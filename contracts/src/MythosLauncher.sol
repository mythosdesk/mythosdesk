// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {MythosToken} from "./MythosToken.sol";
import {TickMath} from "./libraries/TickMath.sol";

interface IUniswapV3Factory {
    function createPool(address tokenA, address tokenB, uint24 fee) external returns (address pool);
}

interface IUniswapV3Pool {
    function initialize(uint160 sqrtPriceX96) external;
}

interface INonfungiblePositionManager {
    struct MintParams {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }

    struct CollectParams {
        uint256 tokenId;
        address recipient;
        uint128 amount0Max;
        uint128 amount1Max;
    }

    function mint(MintParams calldata params)
        external
        payable
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);

    function collect(CollectParams calldata params) external payable returns (uint256 amount0, uint256 amount1);
}

interface ISwapRouter02 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

interface IERC20Minimal {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address owner) external view returns (uint256);
}

/// @title MythosLauncher
/// @notice One-transaction token launches on Robinhood Chain:
///         1. deploys a fixed-supply MythosToken (CREATE2, namespaced per creator),
///         2. creates and initialises a Uniswap v3 1% pool against WETH,
///         3. places the entire supply in a single-sided position that this
///            contract holds forever (there is no function to move it),
///         4. optionally executes the creator's first buy in the same transaction.
///         LP fees are collected permissionlessly: WETH fees are split between the
///         creator's fee recipient and the platform treasury; token-side fees are burned.
///         The app launches through pons; this contract is the self-hosted fallback.
contract MythosLauncher {
    struct LaunchParams {
        string name;
        string symbol;
        string image;
        string description;
        string website;
        string twitter;
        address feeRecipient;
        bytes32 salt;
    }

    struct LaunchRecord {
        address creator;
        address feeRecipient;
        address pool;
        uint256 positionId;
        bool tokenIsToken0;
    }

    uint24 public constant POOL_FEE = 10_000; // 1%
    int24 public constant TICK_SPACING = 200;
    int24 public constant MAX_USABLE_TICK = 887_200; // floor(887272 / 200) * 200
    uint256 public constant SUPPLY = 1_000_000_000 ether;
    uint16 public constant MAX_CREATOR_FEE_BPS = 9_000;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    IUniswapV3Factory public immutable uniswapFactory;
    INonfungiblePositionManager public immutable positionManager;
    ISwapRouter02 public immutable swapRouter;
    /// @notice Wrapped native token (WETH on Robinhood Chain).
    address public immutable weth;
    /// @notice |tick| of the opening price. Must be a multiple of TICK_SPACING.
    int24 public immutable startTick;

    address public owner;
    address public treasury;
    uint256 public launchFee;
    uint16 public creatorFeeBps;

    mapping(address token => LaunchRecord) public launches;
    address[] public allTokens;

    uint256 private locked = 1;

    event TokenLaunched(
        address indexed token,
        address indexed creator,
        address indexed feeRecipient,
        address pool,
        uint256 positionId,
        uint256 initialBuyEth,
        uint256 tokensBought
    );
    event FeesCollected(address indexed token, uint256 creatorAmount, uint256 platformAmount, uint256 tokensBurned);
    event FeeRecipientUpdated(address indexed token, address indexed feeRecipient);
    event ConfigUpdated(address treasury, uint256 launchFee, uint16 creatorFeeBps);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error NotFeeRecipient();
    error Reentrancy();
    error InvalidParams();
    error InsufficientValue();
    error UnknownToken();
    error TransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier nonReentrant() {
        if (locked != 1) revert Reentrancy();
        locked = 2;
        _;
        locked = 1;
    }

    constructor(
        address uniswapFactory_,
        address positionManager_,
        address swapRouter_,
        address weth_,
        int24 startTick_,
        address treasury_,
        uint256 launchFee_,
        uint16 creatorFeeBps_
    ) {
        if (startTick_ <= 0 || startTick_ % TICK_SPACING != 0 || startTick_ >= MAX_USABLE_TICK) revert InvalidParams();
        if (treasury_ == address(0) || creatorFeeBps_ > MAX_CREATOR_FEE_BPS) revert InvalidParams();
        uniswapFactory = IUniswapV3Factory(uniswapFactory_);
        positionManager = INonfungiblePositionManager(positionManager_);
        swapRouter = ISwapRouter02(swapRouter_);
        weth = weth_;
        startTick = startTick_;
        owner = msg.sender;
        treasury = treasury_;
        launchFee = launchFee_;
        creatorFeeBps = creatorFeeBps_;
        emit OwnershipTransferred(address(0), msg.sender);
        emit ConfigUpdated(treasury_, launchFee_, creatorFeeBps_);
    }

    // ---------------------------------------------------------------------
    // Launch
    // ---------------------------------------------------------------------

    /// @param minTokensOut Minimum tokens for the optional initial buy (msg.value - launchFee).
    function launch(LaunchParams calldata params, uint256 minTokensOut)
        external
        payable
        nonReentrant
        returns (address token, address pool, uint256 positionId, uint256 tokensOut)
    {
        _validate(params);
        if (msg.value < launchFee) revert InsufficientValue();
        address feeRecipient = params.feeRecipient == address(0) ? msg.sender : params.feeRecipient;

        token = _deployToken(params);
        bool tokenIsToken0;
        (pool, positionId, tokenIsToken0) = _seedPool(token);

        launches[token] = LaunchRecord({
            creator: msg.sender,
            feeRecipient: feeRecipient,
            pool: pool,
            positionId: positionId,
            tokenIsToken0: tokenIsToken0
        });
        allTokens.push(token);

        if (launchFee > 0) _sendEth(treasury, launchFee);

        uint256 buyAmount = msg.value - launchFee;
        if (buyAmount > 0) tokensOut = _initialBuy(token, buyAmount, minTokensOut);

        emit TokenLaunched(token, msg.sender, feeRecipient, pool, positionId, buyAmount, tokensOut);
    }

    function _validate(LaunchParams calldata params) private pure {
        uint256 nameLen = bytes(params.name).length;
        uint256 symbolLen = bytes(params.symbol).length;
        if (nameLen == 0 || nameLen > 64 || symbolLen == 0 || symbolLen > 16) revert InvalidParams();
        if (bytes(params.description).length > 2048 || bytes(params.image).length > 512) revert InvalidParams();
    }

    /// @dev Namespaced by creator so nobody can occupy someone else's address.
    function _deployToken(LaunchParams calldata params) private returns (address token) {
        token = address(
            new MythosToken{salt: _namespacedSalt(msg.sender, params.salt)}(params.name, params.symbol, msg.sender, SUPPLY)
        );
        MythosToken(token).setMetadata(params.image, params.description, params.website, params.twitter);
    }

    /// @dev Creates the pool at the opening price and locks the whole supply in a
    ///      single-sided position owned by this contract.
    ///      token0 = token: price is WETH per token, opening at -startTick, range [open, max].
    ///      token1 = token: price is token per WETH, opening at +startTick, range [min, open].
    function _seedPool(address token) private returns (address pool, uint256 positionId, bool tokenIsToken0) {
        tokenIsToken0 = token < weth;
        pool = uniswapFactory.createPool(token, weth, POOL_FEE);
        int24 openTick = tokenIsToken0 ? -startTick : startTick;
        IUniswapV3Pool(pool).initialize(TickMath.getSqrtRatioAtTick(openTick));

        MythosToken(token).approve(address(positionManager), SUPPLY);
        INonfungiblePositionManager.MintParams memory mintParams;
        mintParams.fee = POOL_FEE;
        mintParams.recipient = address(this);
        mintParams.deadline = block.timestamp;
        if (tokenIsToken0) {
            mintParams.token0 = token;
            mintParams.token1 = weth;
            mintParams.tickLower = openTick;
            mintParams.tickUpper = MAX_USABLE_TICK;
            mintParams.amount0Desired = SUPPLY;
        } else {
            mintParams.token0 = weth;
            mintParams.token1 = token;
            mintParams.tickLower = -MAX_USABLE_TICK;
            mintParams.tickUpper = openTick;
            mintParams.amount1Desired = SUPPLY;
        }
        (positionId,,,) = positionManager.mint(mintParams);
    }

    /// @dev Runs in the launch transaction, before anyone else can trade the pool.
    function _initialBuy(address token, uint256 amountIn, uint256 minTokensOut) private returns (uint256) {
        return swapRouter.exactInputSingle{value: amountIn}(
            ISwapRouter02.ExactInputSingleParams({
                tokenIn: weth,
                tokenOut: token,
                fee: POOL_FEE,
                recipient: msg.sender,
                amountIn: amountIn,
                amountOutMinimum: minTokensOut,
                sqrtPriceLimitX96: 0
            })
        );
    }

    // ---------------------------------------------------------------------
    // Fees
    // ---------------------------------------------------------------------

    /// @notice Anyone can trigger; proceeds always go to the configured recipients.
    function collectFees(address token) external nonReentrant returns (uint256 creatorAmount, uint256 platformAmount) {
        LaunchRecord memory record = launches[token];
        if (record.pool == address(0)) revert UnknownToken();

        (uint256 amount0, uint256 amount1) = positionManager.collect(
            INonfungiblePositionManager.CollectParams({
                tokenId: record.positionId,
                recipient: address(this),
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );
        (uint256 wethFees, uint256 tokenFees) = record.tokenIsToken0 ? (amount1, amount0) : (amount0, amount1);

        if (wethFees > 0) {
            creatorAmount = (wethFees * creatorFeeBps) / 10_000;
            platformAmount = wethFees - creatorAmount;
            if (creatorAmount > 0) _sendToken(weth, record.feeRecipient, creatorAmount);
            if (platformAmount > 0) _sendToken(weth, treasury, platformAmount);
        }
        if (tokenFees > 0) _sendToken(token, DEAD, tokenFees);

        emit FeesCollected(token, creatorAmount, platformAmount, tokenFees);
    }

    function setFeeRecipient(address token, address feeRecipient) external {
        LaunchRecord storage record = launches[token];
        if (record.pool == address(0)) revert UnknownToken();
        if (msg.sender != record.feeRecipient) revert NotFeeRecipient();
        if (feeRecipient == address(0)) revert InvalidParams();
        record.feeRecipient = feeRecipient;
        emit FeeRecipientUpdated(token, feeRecipient);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function predictTokenAddress(address creator, string calldata name_, string calldata symbol_, bytes32 salt)
        external
        view
        returns (address)
    {
        bytes32 initCodeHash = keccak256(
            abi.encodePacked(type(MythosToken).creationCode, abi.encode(name_, symbol_, creator, SUPPLY))
        );
        return address(
            uint160(
                uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), _namespacedSalt(creator, salt), initCodeHash)))
            )
        );
    }

    function tokenCount() external view returns (uint256) {
        return allTokens.length;
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    function setConfig(address treasury_, uint256 launchFee_, uint16 creatorFeeBps_) external onlyOwner {
        if (treasury_ == address(0) || creatorFeeBps_ > MAX_CREATOR_FEE_BPS) revert InvalidParams();
        treasury = treasury_;
        launchFee = launchFee_;
        creatorFeeBps = creatorFeeBps_;
        emit ConfigUpdated(treasury_, launchFee_, creatorFeeBps_);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidParams();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    function _namespacedSalt(address creator, bytes32 salt) private pure returns (bytes32) {
        return keccak256(abi.encode(creator, salt));
    }

    function _sendEth(address to, uint256 amount) private {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    function _sendToken(address token, address to, uint256 amount) private {
        if (!IERC20Minimal(token).transfer(to, amount)) revert TransferFailed();
    }
}
