// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {MythosLauncher} from "../src/MythosLauncher.sol";
import {MythosToken} from "../src/MythosToken.sol";
import {TickMath} from "../src/libraries/TickMath.sol";

interface IWETH {
    function deposit() external payable;
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address owner) external view returns (uint256);
}

interface IRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256);
}

/// @notice Robinhood Chain mainnet fork tests: forge test --fork-url robinhood -vv
contract MythosLauncherTest is Test {
    // Official Uniswap v3 deployment on Robinhood Chain (chain 4663).
    address constant FACTORY = 0x1f7d7550B1b028f7571E69A784071F0205FD2EfA;
    address constant NPM = 0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3;
    address constant ROUTER = 0xCaf681a66D020601342297493863E78C959E5cb2;
    address constant WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;

    MythosLauncher launcher;
    address treasury = makeAddr("treasury");
    address creator = makeAddr("creator");
    address trader = makeAddr("trader");

    function setUp() public {
        if (block.chainid != 4663) vm.skip(true);
        // makeAddr keys are public, so sweeper bots may have EIP-7702-delegated some of these
        // addresses (e.g. "treasury") to forward any native coin they receive.
        vm.etch(treasury, "");
        vm.etch(creator, "");
        vm.etch(trader, "");
        launcher = new MythosLauncher(FACTORY, NPM, ROUTER, WETH, 202_000, treasury, 0.0005 ether, 6000);
        vm.deal(creator, 10 ether);
        vm.deal(trader, 10 ether);
    }

    function _params(bytes32 salt) internal view returns (MythosLauncher.LaunchParams memory) {
        return MythosLauncher.LaunchParams({
            name: "Mythos Test",
            symbol: "TTEST",
            image: "ipfs://logo",
            description: "fork test",
            website: "",
            twitter: "",
            feeRecipient: creator,
            salt: salt
        });
    }

    function test_TickMathKnownValues() public pure {
        assertEq(TickMath.getSqrtRatioAtTick(0), 79228162514264337593543950336);
        assertEq(TickMath.getSqrtRatioAtTick(TickMath.MIN_TICK), 4295128739);
        assertEq(TickMath.getSqrtRatioAtTick(TickMath.MAX_TICK), 1461446703485210103287273052203988822378723970342);
    }

    function test_LaunchWithInitialBuy() public {
        bytes32 salt = keccak256("salt-1");
        address predicted = launcher.predictTokenAddress(creator, "Mythos Test", "TTEST", salt);

        vm.prank(creator);
        (address token, address pool, uint256 positionId, uint256 bought) =
            launcher.launch{value: 0.0005 ether + 0.05 ether}(_params(salt), 0);

        assertEq(token, predicted, "CREATE2 prediction");
        assertTrue(pool != address(0));
        assertGt(positionId, 0);
        assertGt(bought, 0, "initial buy filled");
        assertEq(MythosToken(token).balanceOf(creator), bought);
        assertEq(treasury.balance, 0.0005 ether, "launch fee to treasury");
        assertEq(MythosToken(token).creator(), creator);
        assertEq(MythosToken(token).image(), "ipfs://logo");
    }

    function test_TradingAndFeeCollection() public {
        vm.prank(creator);
        (address token,,,) = launcher.launch{value: 0.0005 ether}(_params(keccak256("salt-2")), 0);

        // A trader buys, which pays LP fees in WETH.
        vm.prank(trader);
        uint256 out = IRouter(ROUTER).exactInputSingle{value: 1 ether}(
            IRouter.ExactInputSingleParams(WETH, token, 10_000, trader, 1 ether, 0, 0)
        );
        assertGt(out, 0);

        (uint256 creatorAmount, uint256 platformAmount) = launcher.collectFees(token);
        assertGt(creatorAmount + platformAmount, 0, "fees accrued");
        assertEq(IWETH(WETH).balanceOf(creator), creatorAmount);
        assertEq(IWETH(WETH).balanceOf(treasury), platformAmount);
        assertApproxEqRel(creatorAmount, ((creatorAmount + platformAmount) * 6000) / 10_000, 0.001e18);
    }

    /// @dev The CREATE2 address decides whether the token is token0 or token1; both
    ///      branches must open at the same price and trade both ways.
    function test_BothTokenOrderingsOpenAtSamePriceAndTrade() public {
        for (uint256 pass; pass < 2; ++pass) {
            bool wantToken0 = pass == 0;
            bytes32 salt;
            for (uint256 i;; ++i) {
                salt = keccak256(abi.encode("ordering", i));
                address predicted = launcher.predictTokenAddress(creator, "Mythos Test", "TTEST", salt);
                if ((predicted < WETH) == wantToken0) break;
            }

            vm.prank(creator);
            (address token,,, uint256 bought) = launcher.launch{value: 0.0005 ether + 0.05 ether}(_params(salt), 0);
            (,,,, bool tokenIsToken0) = launcher.launches(token);
            assertEq(tokenIsToken0, wantToken0, "ordering");
            // ~1.69 ETH opening FDV: 0.0495 ETH after the 1% fee buys ~29M of 1B tokens, a little less after impact.
            assertGt(bought, 27_500_000 ether, "opening price too high");
            assertLt(bought, 29_500_000 ether, "opening price too low");

            // Sell half back through the pool.
            vm.startPrank(creator);
            MythosToken(token).approve(ROUTER, type(uint256).max);
            uint256 wethBefore = IWETH(WETH).balanceOf(creator);
            uint256 wethOut = IRouter(ROUTER).exactInputSingle(
                IRouter.ExactInputSingleParams(token, WETH, 10_000, creator, bought / 2, 0, 0)
            );
            vm.stopPrank();
            assertGt(wethOut, 0.02 ether, "sell filled");
            assertEq(IWETH(WETH).balanceOf(creator) - wethBefore, wethOut);
        }
    }

    function test_RevertsBelowLaunchFee() public {
        vm.prank(creator);
        vm.expectRevert(MythosLauncher.InsufficientValue.selector);
        launcher.launch{value: 0.0001 ether}(_params(keccak256("salt-3")), 0);
    }

    function test_OnlyOwnerConfig() public {
        vm.prank(trader);
        vm.expectRevert(MythosLauncher.NotOwner.selector);
        launcher.setConfig(trader, 0, 0);
    }
}
