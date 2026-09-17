// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {WebAuthn} from "./libraries/WebAuthn.sol";
import {KillSwitch} from "./KillSwitch.sol";

/// @title HumanTouch
/// @notice Records, per action, whether a human pressed a passkey or an agent key signed.
///         A human attestation requires a WebAuthn assertion with user presence and user
///         verification, verified on chain against the passkey the account registered.
/// @dev Immutable, no admin, holds no funds. Observes and attests; it is never on the signing path.
///      Each attestation is bound to one action hash and can be recorded once.
contract HumanTouch {
    enum Origin { Unknown, Human, Agent }

    struct Passkey { uint256 x; uint256 y; bytes32 rpIdHash; }

    KillSwitch public immutable killSwitch;
    mapping(address => Passkey) private _passkeys;
    /// @dev keccak256(account, actionHash) => origin. keyed by the account as well as the
    ///      action, so a registered agent key cannot stamp somebody else's action hash as
    ///      "agent" first and block their human proof.
    mapping(bytes32 => Origin) private _origin;
    mapping(address => uint256) public humanCount;
    mapping(address => uint256) public agentCount;

    event PasskeyRegistered(address indexed account, uint256 x, uint256 y, bytes32 rpIdHash);
    event HumanTouched(address indexed account, bytes32 indexed actionHash, uint8 flags);
    event AgentSigned(address indexed account, uint256 indexed agentId, bytes32 indexed actionHash);

    error AlreadyAttested();
    error NoPasskey();
    error NotHuman();
    error NotAgent();

    constructor(KillSwitch ks) { killSwitch = ks; }

    /// @notice An account registers the passkey that will prove human presence for it.
    function registerPasskey(uint256 x, uint256 y, bytes32 rpIdHash) external {
        _passkeys[msg.sender] = Passkey(x, y, rpIdHash);
        emit PasskeyRegistered(msg.sender, x, y, rpIdHash);
    }

    function passkeyOf(address account) external view returns (Passkey memory) { return _passkeys[account]; }

    /// @notice Prove a human pressed the key for this action. The challenge the passkey signed is
    ///         keccak256(abi.encode(this, chainid, account, actionHash)), so an assertion cannot be
    ///         replayed for another action, another contract, or another chain.
    function attestHuman(address account, bytes32 actionHash, WebAuthn.Assertion calldata a) external {
        bytes32 key = _key(account, actionHash);
        if (_origin[key] != Origin.Unknown) revert AlreadyAttested();
        Passkey memory k = _passkeys[account];
        if (k.x == 0 && k.y == 0) revert NoPasskey();
        (bool ok, uint8 flags) = WebAuthn.verify(a, challengeFor(account, actionHash), k.rpIdHash, k.x, k.y);
        if (!ok || flags & WebAuthn.FLAG_UV == 0) revert NotHuman();
        _origin[key] = Origin.Human;
        humanCount[account]++;
        emit HumanTouched(account, actionHash, flags);
    }

    /// @notice An agent key declares its own action. Only a key registered in the kill switch may.
    function attestAgent(bytes32 actionHash) external {
        bytes32 key = _key(msg.sender, actionHash);
        if (_origin[key] != Origin.Unknown) revert AlreadyAttested();
        uint256 agentId = killSwitch.agentIdByKey(msg.sender);
        if (agentId == 0) revert NotAgent();
        _origin[key] = Origin.Agent;
        agentCount[msg.sender]++;
        emit AgentSigned(msg.sender, agentId, actionHash);
    }

    /// @dev chain id in the domain, so an assertion for this contract at this address on
    ///      one chain is worthless for the same address on another.
    function challengeFor(address account, bytes32 actionHash) public view returns (bytes32) {
        return keccak256(abi.encode(address(this), block.chainid, account, actionHash));
    }

    function originOf(address account, bytes32 actionHash) external view returns (Origin) { return _origin[_key(account, actionHash)]; }
    function wasHuman(address account, bytes32 actionHash) external view returns (bool) { return _origin[_key(account, actionHash)] == Origin.Human; }

    function _key(address account, bytes32 actionHash) private pure returns (bytes32) { return keccak256(abi.encode(account, actionHash)); }
}
