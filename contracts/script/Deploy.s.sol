// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {MythosLauncher} from "../src/MythosLauncher.sol";

/// @notice forge script script/Deploy.s.sol --rpc-url robinhood --broadcast
///         Env (contracts/.env): DEPLOYER_PRIVATE_KEY (or pass a wallet flag such as --ledger),
///              TREASURY (required), LAUNCH_FEE_WEI (default 0.0005 ETH),
///              CREATOR_FEE_BPS (default 6000 = 60% of WETH LP fees),
///              START_TICK (default 202000 = about 1.69 ETH opening FDV for 1B supply, the same as pons).
///         Any other chain (testnet rehearsals) needs UNISWAP_FACTORY, UNISWAP_POSITION_MANAGER,
///         UNISWAP_ROUTER and WRAPPED_NATIVE.
contract Deploy is Script {
    struct Uniswap {
        address factory;
        address positionManager;
        address swapRouter02;
        address weth;
    }

    function uniswapFor(uint256 chainId) internal view returns (Uniswap memory) {
        // Official Uniswap v3 deployment on Robinhood Chain mainnet; wiring checked on-chain on 2026-11-18:
        // NPM.factory() and SwapRouter02.factory() return this factory, and WETH9() returns WETH.
        if (chainId == 4663) {
            return Uniswap({
                factory: 0x1f7d7550B1b028f7571E69A784071F0205FD2EfA,
                positionManager: 0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3,
                swapRouter02: 0xCaf681a66D020601342297493863E78C959E5cb2,
                weth: 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73
            });
        }
        return Uniswap({
            factory: vm.envAddress("UNISWAP_FACTORY"),
            positionManager: vm.envAddress("UNISWAP_POSITION_MANAGER"),
            swapRouter02: vm.envAddress("UNISWAP_ROUTER"),
            weth: vm.envAddress("WRAPPED_NATIVE")
        });
    }

    function run() external {
        Uniswap memory u = uniswapFor(block.chainid);
        address treasury = vm.envAddress("TREASURY");
        uint256 launchFee = vm.envOr("LAUNCH_FEE_WEI", uint256(0.0005 ether));
        uint16 creatorFeeBps = uint16(vm.envOr("CREATOR_FEE_BPS", uint256(6000)));
        int24 startTick = int24(int256(vm.envOr("START_TICK", uint256(202_000))));
        uint256 deployerKey = vm.envOr("DEPLOYER_PRIVATE_KEY", uint256(0));

        if (deployerKey != 0) vm.startBroadcast(deployerKey);
        else vm.startBroadcast();
        MythosLauncher launcher =
            new MythosLauncher(u.factory, u.positionManager, u.swapRouter02, u.weth, startTick, treasury, launchFee, creatorFeeBps);
        vm.stopBroadcast();

        console2.log("MythosLauncher deployed at", address(launcher));
        console2.log("The app launches through pons; this address is not read by the app yet.");
    }
}
