// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {KillSwitch} from "./KillSwitch.sol";

/// @title AgentLabels
/// @notice What the owner says an agent is, on chain, so any console can read it.
///
/// The kill switch stores a key, a cold key, guardians and a status. It has no opinion
/// on what an agent does and it never will. A label is the owner's own words: a name
/// and, optionally, a line on what the agent is for. Only the agent's current cold key
/// may set one, so a label is exactly as trustworthy as the party who can stop the agent.
///
/// Stored, not event-only. The first cut of this emitted an event and kept nothing,
/// on the theory that a reader scans logs by indexed id. Monad's RPC caps eth_getLogs
/// at a hundred blocks per call, so after a few minutes of chain a browser cannot find
/// a label without an indexer, and an indexer is a service, which is the thing this
/// product exists to not need. A label is read the way the switch is read: one view
/// call. The owner pays for the storage once, when they choose the words.
///
/// A label is not consulted by anything that decides whether an agent is trusted. It is
/// text for people. Apps that check the switch never read this contract.
contract AgentLabels {
    struct Label {
        string name;
        string purpose;
        address by;
        uint64 at;
    }

    KillSwitch public immutable killSwitch;

    /// @dev Cap on the name so a list column stays a list column. Purpose is long enough
    ///      for a sentence and short enough that nobody stores a document in it.
    uint256 public constant MAX_NAME = 40;
    uint256 public constant MAX_PURPOSE = 200;

    mapping(uint256 agentId => Label) private _labels;

    event Labelled(uint256 indexed agentId, address indexed by, string name, string purpose);

    error NotColdKey();
    error EmptyName();
    error TooLong();

    constructor(KillSwitch ks) {
        killSwitch = ks;
    }

    /// @notice Set or replace the label for an agent.
    /// @param agentId The agent, as registered in the kill switch.
    /// @param name What to call it. One to forty bytes.
    /// @param purpose What it is for. May be empty. Up to two hundred bytes.
    function label(uint256 agentId, string calldata name, string calldata purpose) external {
        KillSwitch.Agent memory a = killSwitch.getAgent(agentId);
        if (a.revocationKey != msg.sender) revert NotColdKey();
        if (bytes(name).length == 0) revert EmptyName();
        if (bytes(name).length > MAX_NAME || bytes(purpose).length > MAX_PURPOSE) revert TooLong();
        _labels[agentId] = Label({name: name, purpose: purpose, by: msg.sender, at: uint64(block.timestamp)});
        emit Labelled(agentId, msg.sender, name, purpose);
    }

    /// @notice The current label. An unlabelled agent returns empty strings and a zero `by`.
    function labelOf(uint256 agentId) external view returns (Label memory) {
        return _labels[agentId];
    }

    /// @notice Labels for many agents in one call, in the order asked. A console drawing a
    ///         list makes one round trip rather than one per row.
    function labelsOf(uint256[] calldata agentIds) external view returns (Label[] memory out) {
        out = new Label[](agentIds.length);
        for (uint256 i = 0; i < agentIds.length; i++) {
            out[i] = _labels[agentIds[i]];
        }
    }
}
