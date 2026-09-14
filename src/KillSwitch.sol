// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IDutyVerifier} from "./interfaces/IDutyVerifier.sol";

/// @title KillSwitch
/// @notice Per agent: a hot agent key, a cold revocation key, optional guardians, and a status that anyone can
///         read in one call. Revoked is terminal. Rotated points at a successor so trust migrates instead of dying.
/// @dev Immutable, no admin. Holds no funds. A bug here produces a wrong status, never a lost coin.
///      Also a duty verifier: an operator statement "agent A had status S at time T" can be proven false here.
contract KillSwitch is IDutyVerifier {
    enum Status {
        None,
        Active,
        Paused,
        Revoked,
        Rotated
    }

    struct Agent {
        address agentKey;
        address revocationKey;
        address pendingRevocationKey;
        uint64 revocationKeyChangeAt; // timestamp when pending key may be applied
        uint8 guardianThreshold;
        Status status;
        uint64 statusSince;
        uint256 successorId; // when Rotated
        bytes32 reasonHash;
        address[] guardians;
    }

    struct StatusChange {
        uint64 at;
        Status status;
    }

    uint64 public immutable revocationKeyChangeDelay;
    /// @dev guardians can pause immediately, and may escalate a pause to revoked only after this delay with no
    ///      owner action, so a lost owner key does not leave a compromised agent live forever
    uint64 public immutable guardianEscalationDelay;

    uint256 public agentCount;
    mapping(uint256 => Agent) private _agents;
    mapping(uint256 => StatusChange[]) private _history;
    mapping(address => uint256) public agentIdByKey;
    /// @dev agentId => guardian => epoch of pause request they voted for (0 = none)
    mapping(uint256 => mapping(address => uint256)) public guardianVote;
    mapping(uint256 => uint256) public guardianVoteRound; // increments whenever a pause resolves
    mapping(uint256 => uint256) public guardianVoteCount;

    event AgentRegistered(uint256 indexed agentId, address indexed agentKey, address indexed revocationKey, address[] guardians, uint8 threshold);
    event StatusChanged(uint256 indexed agentId, Status status, bytes32 reasonHash, address by);
    event Rotated(uint256 indexed agentId, uint256 indexed successorId);
    event RevocationKeyChangeProposed(uint256 indexed agentId, address newKey, uint64 applyAt);
    event RevocationKeyChanged(uint256 indexed agentId, address newKey);
    event GuardianVoted(uint256 indexed agentId, address indexed guardian, uint256 votes, uint256 threshold);

    error NotRevocationKey();
    error NotGuardian();
    error AgentKeyInUse();
    error Terminal();
    error BadTransition();
    error BadThreshold();
    error NotPending();
    error TooEarly();
    error BadSuccessor();

    constructor(uint64 revocationKeyChangeDelay_, uint64 guardianEscalationDelay_) {
        revocationKeyChangeDelay = revocationKeyChangeDelay_;
        guardianEscalationDelay = guardianEscalationDelay_;
    }

    // ---------- registration ----------

    function register(address agentKey, address revocationKey, address[] calldata guardians, uint8 threshold)
        external
        returns (uint256 agentId)
    {
        if (agentIdByKey[agentKey] != 0) revert AgentKeyInUse();
        if (guardians.length > 0 && (threshold == 0 || threshold > guardians.length)) revert BadThreshold();
        if (guardians.length == 0 && threshold != 0) revert BadThreshold();
        agentId = ++agentCount;
        Agent storage a = _agents[agentId];
        a.agentKey = agentKey;
        a.revocationKey = revocationKey;
        a.guardians = guardians;
        a.guardianThreshold = threshold;
        a.status = Status.Active;
        a.statusSince = uint64(block.timestamp);
        agentIdByKey[agentKey] = agentId;
        _history[agentId].push(StatusChange(uint64(block.timestamp), Status.Active));
        emit AgentRegistered(agentId, agentKey, revocationKey, guardians, threshold);
        emit StatusChanged(agentId, Status.Active, bytes32(0), msg.sender);
    }

    // ---------- owner controls ----------

    /// @notice Pause, resume, or revoke. Revoked is terminal. Only the revocation key.
    function setStatus(uint256 agentId, Status status, bytes32 reasonHash) external {
        Agent storage a = _requireOwner(agentId);
        if (a.status == Status.Revoked || a.status == Status.Rotated) revert Terminal();
        if (status != Status.Active && status != Status.Paused && status != Status.Revoked) revert BadTransition();
        _setStatus(agentId, a, status, reasonHash, msg.sender);
    }

    /// @notice Retire this agent in favour of a successor. Terminal for this id; successor must be a live agent.
    function rotate(uint256 agentId, uint256 successorId, bytes32 reasonHash) external {
        Agent storage a = _requireOwner(agentId);
        if (a.status == Status.Revoked || a.status == Status.Rotated) revert Terminal();
        Agent storage s = _agents[successorId];
        if (successorId == agentId || s.status != Status.Active) revert BadSuccessor();
        a.successorId = successorId;
        _setStatus(agentId, a, Status.Rotated, reasonHash, msg.sender);
        emit Rotated(agentId, successorId);
    }

    function proposeRevocationKey(uint256 agentId, address newKey) external {
        Agent storage a = _requireOwner(agentId);
        a.pendingRevocationKey = newKey;
        a.revocationKeyChangeAt = uint64(block.timestamp) + revocationKeyChangeDelay;
        emit RevocationKeyChangeProposed(agentId, newKey, a.revocationKeyChangeAt);
    }

    function applyRevocationKey(uint256 agentId) external {
        Agent storage a = _requireOwner(agentId);
        if (a.pendingRevocationKey == address(0)) revert NotPending();
        if (block.timestamp < a.revocationKeyChangeAt) revert TooEarly();
        a.revocationKey = a.pendingRevocationKey;
        a.pendingRevocationKey = address(0);
        a.revocationKeyChangeAt = 0;
        emit RevocationKeyChanged(agentId, a.revocationKey);
    }

    // ---------- guardians ----------

    /// @notice A guardian votes to pause. When the threshold is reached the agent pauses. Guardians can never
    ///         revoke directly.
    function guardianPause(uint256 agentId) external {
        Agent storage a = _agents[agentId];
        if (!_isGuardian(a, msg.sender)) revert NotGuardian();
        if (a.status != Status.Active) revert BadTransition();
        uint256 round = guardianVoteRound[agentId];
        if (guardianVote[agentId][msg.sender] == round + 1) return; // already voted this round
        guardianVote[agentId][msg.sender] = round + 1;
        uint256 votes = ++guardianVoteCount[agentId];
        emit GuardianVoted(agentId, msg.sender, votes, a.guardianThreshold);
        if (votes >= a.guardianThreshold) {
            guardianVoteRound[agentId] = round + 1;
            guardianVoteCount[agentId] = 0;
            _setStatus(agentId, a, Status.Paused, keccak256("guardian pause"), msg.sender);
        }
    }

    /// @notice If a guardian pause has stood untouched by the owner for the escalation delay, any guardian may
    ///         revoke. This is the recovery path for a lost owner key with a compromised agent.
    function guardianEscalate(uint256 agentId) external {
        Agent storage a = _agents[agentId];
        if (!_isGuardian(a, msg.sender)) revert NotGuardian();
        if (a.status != Status.Paused) revert BadTransition();
        if (block.timestamp < a.statusSince + guardianEscalationDelay) revert TooEarly();
        _setStatus(agentId, a, Status.Revoked, keccak256("guardian escalation"), msg.sender);
    }

    // ---------- views ----------

    function isTrusted(uint256 agentId) external view returns (bool) {
        return _agents[agentId].status == Status.Active;
    }

    /// @notice Whether the agent was active at a past timestamp. Use this to verify a signature made earlier;
    ///         never read "latest" state to judge an old signature on a chain with speculative heads.
    function isTrustedAt(uint256 agentId, uint64 timestamp) external view returns (bool) {
        return statusAt(agentId, timestamp) == Status.Active;
    }

    function statusAt(uint256 agentId, uint64 timestamp) public view returns (Status) {
        StatusChange[] storage h = _history[agentId];
        if (h.length == 0 || timestamp < h[0].at) return Status.None;
        // history is small per agent; linear scan from the end
        for (uint256 i = h.length; i > 0; i--) {
            if (h[i - 1].at <= timestamp) return h[i - 1].status;
        }
        return Status.None;
    }

    function getAgent(uint256 agentId) external view returns (Agent memory) {
        return _agents[agentId];
    }

    function historyLength(uint256 agentId) external view returns (uint256) {
        return _history[agentId].length;
    }

    function historyAt(uint256 agentId, uint256 index) external view returns (StatusChange memory) {
        return _history[agentId][index];
    }

    /// @notice Duty verifier for revocation witnesses. Statement encoding: abi.encode(agentId, status, timestamp).
    ///         Contradicted when the recorded status at that timestamp differs from the claimed one.
    function isContradicted(bytes32, bytes calldata statement) external view returns (bool) {
        (uint256 agentId, Status claimed, uint64 timestamp) = abi.decode(statement, (uint256, Status, uint64));
        if (timestamp > block.timestamp) return false; // cannot judge the future
        return statusAt(agentId, timestamp) != claimed;
    }

    // ---------- internal ----------

    function _requireOwner(uint256 agentId) internal view returns (Agent storage a) {
        a = _agents[agentId];
        if (msg.sender != a.revocationKey || a.revocationKey == address(0)) revert NotRevocationKey();
    }

    function _isGuardian(Agent storage a, address who) internal view returns (bool) {
        address[] storage g = a.guardians;
        for (uint256 i = 0; i < g.length; i++) {
            if (g[i] == who) return true;
        }
        return false;
    }

    function _setStatus(uint256 agentId, Agent storage a, Status status, bytes32 reasonHash, address by) internal {
        a.status = status;
        a.statusSince = uint64(block.timestamp);
        a.reasonHash = reasonHash;
        _history[agentId].push(StatusChange(uint64(block.timestamp), status));
        emit StatusChanged(agentId, status, reasonHash, by);
    }
}
