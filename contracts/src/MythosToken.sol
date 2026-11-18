// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title MythosToken
/// @notice Fixed-supply ERC-20 created by MythosLauncher. No mint, no tax, no owner,
///         no blacklist. The full supply is minted once to the launcher, which places
///         it in a locked Uniswap v3 position.
contract MythosToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public immutable totalSupply;

    /// @notice Wallet that launched the token (metadata only, no privileges).
    address public immutable creator;
    /// @notice Launcher that deployed the token; may set metadata exactly once.
    address public immutable launcher;

    string public image;
    string public description;
    string public website;
    string public twitter;
    bool private metadataSet;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    error NotLauncher();
    error MetadataAlreadySet();
    error InsufficientBalance();
    error InsufficientAllowance();

    constructor(string memory name_, string memory symbol_, address creator_, uint256 supply_) {
        name = name_;
        symbol = symbol_;
        creator = creator_;
        launcher = msg.sender;
        totalSupply = supply_;
        balanceOf[msg.sender] = supply_;
        emit Transfer(address(0), msg.sender, supply_);
    }

    function setMetadata(
        string calldata image_,
        string calldata description_,
        string calldata website_,
        string calldata twitter_
    ) external {
        if (msg.sender != launcher) revert NotLauncher();
        if (metadataSet) revert MetadataAlreadySet();
        metadataSet = true;
        image = image_;
        description = description_;
        website = website_;
        twitter = twitter_;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            if (allowed < amount) revert InsufficientAllowance();
            unchecked {
                allowance[from][msg.sender] = allowed - amount;
            }
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) private {
        uint256 bal = balanceOf[from];
        if (bal < amount) revert InsufficientBalance();
        unchecked {
            balanceOf[from] = bal - amount;
            balanceOf[to] += amount;
        }
        emit Transfer(from, to, amount);
    }
}
