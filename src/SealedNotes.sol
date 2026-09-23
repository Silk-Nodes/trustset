// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {KillSwitch} from "./KillSwitch.sol";

/// @title SealedNotes
/// @notice Notes about an agent that only its owner's passkey can read: the runbook an
///         operator needs at three in the morning, and the reason an agent was stopped.
///
/// Nothing here is readable. The browser encrypts each note before it is sent, with a key
/// derived from the owner's passkey through the WebAuthn PRF extension (Mera), under a fresh
/// salt per note. What arrives is a sealed vault: the credential that can open it, the salt,
/// the nonce and the ciphertext. The key itself exists only inside a signing ceremony, is
/// never stored, and is recreated on any device the passkey syncs to.
///
/// Stored, not event only, for the reason AgentLabels gives: Monad's RPC caps eth_getLogs
/// at a hundred blocks, so a note kept only in a log could not be found again without an
/// indexer, and a second device has to be able to find it with one view call.
///
/// Only the agent's current cold key may add a note, so a note is exactly as trustworthy as
/// the party who can stop the agent. Nothing that decides whether an agent is trusted ever
/// reads this contract.
contract SealedNotes {
    /// @dev what a note is about. the runbook is replaced by the newest one; stop reasons
    ///      accumulate, one per stop.
    enum Kind {
        Runbook,
        StopReason
    }

    struct Note {
        Kind kind;
        address by;
        uint64 at;
        bytes vault;
    }

    KillSwitch public immutable killSwitch;

    /// @dev room for a page of text once sealed and encoded, and not for a document.
    uint256 public constant MAX_VAULT = 6144;

    mapping(uint256 agentId => Note[]) private _notes;

    event Sealed(uint256 indexed agentId, address indexed by, Kind kind, uint256 index);

    error NotColdKey();
    error EmptyVault();
    error TooLong();

    constructor(KillSwitch ks) {
        killSwitch = ks;
    }

    /// @notice Keep one sealed note for an agent.
    /// @param agentId The agent, as registered in the kill switch.
    /// @param kind A runbook or a stop reason.
    /// @param vault The sealed vault, as the browser produced it. Opaque to this contract.
    function seal(uint256 agentId, Kind kind, bytes calldata vault) external {
        if (killSwitch.getAgent(agentId).revocationKey != msg.sender) revert NotColdKey();
        if (vault.length == 0) revert EmptyVault();
        if (vault.length > MAX_VAULT) revert TooLong();
        _notes[agentId].push(Note({kind: kind, by: msg.sender, at: uint64(block.timestamp), vault: vault}));
        emit Sealed(agentId, msg.sender, kind, _notes[agentId].length - 1);
    }

    /// @notice How many notes an agent has.
    function countOf(uint256 agentId) external view returns (uint256) {
        return _notes[agentId].length;
    }

    /// @notice Every note for an agent, oldest first. Small by construction: an owner writes them.
    function notesOf(uint256 agentId) external view returns (Note[] memory) {
        return _notes[agentId];
    }
}
