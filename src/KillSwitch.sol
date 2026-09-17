// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IDutyVerifier} from "./interfaces/IDutyVerifier.sol";
import {WebAuthn} from "./libraries/WebAuthn.sol";

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
        /// @dev 0 = never expires. after this timestamp the agent is not trusted, with nobody having to send anything
        uint64 expiresAt;
        /// @dev 0 = no heartbeat. the agent must call beat() at least this often or it stops being trusted
        uint64 heartbeatWindow;
        uint64 lastBeat;
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
    /// @dev how long a guardian-agreed cold key change waits before it may be executed, so the
    ///      owner has a window to cancel one they did not want
    uint64 public immutable guardianRecoveryDelay;

    uint256 public agentCount;
    mapping(uint256 => Agent) private _agents;
    mapping(uint256 => StatusChange[]) private _history;
    mapping(address => uint256) public agentIdByKey;
    /// @dev agentId => guardian => epoch of pause request they voted for (0 = none)
    mapping(uint256 => mapping(address => uint256)) public guardianVote;
    mapping(uint256 => uint256) public guardianVoteRound; // increments whenever a pause resolves
    mapping(uint256 => uint256) public guardianVoteCount;
    /// @dev a passkey the owner nominated as a panic button for one agent. it can pause and
    ///      nothing else: not resume, not revoke, not touch keys or limits. a phone is easier to
    ///      lose than a cold wallet, so the worst a stolen one can do is stop your own agent,
    ///      which you undo with the cold key.
    struct StopKey {
        uint256 x;
        uint256 y;
        bytes32 rpIdHash;
        /// @dev increments on every use, so an assertion cannot be replayed
        uint64 nonce;
        bool set;
    }
    mapping(uint256 agentId => StopKey) private _stopKeys;

    /// @dev guardians replacing a cold key its owner can no longer use. this is for a key that was
    ///      LOST. a key that was STOLEN is a different problem with a different answer: the thief
    ///      can cancel any recovery, so the guardians' route there is to pause and then escalate to
    ///      revoked, killing the agent rather than handing it back. both are in AUDIT.md.
    struct Recovery {
        address newKey;
        /// @dev 0 until the threshold is reached; then the moment the change may be executed
        uint64 readyAt;
        uint32 round;
        uint8 votes;
    }
    mapping(uint256 agentId => Recovery) private _recovery;
    /// @dev agentId => guardian => the recovery round they last voted in (0 = never)
    mapping(uint256 => mapping(address => uint32)) public recoveryVote;

    /// @dev true while the current pause was made by guardians. only such a pause may be escalated:
    ///      an owner who pauses their own agent for a week must not find it revoked by a guardian.
    mapping(uint256 => bool) public guardianPaused;

    event AgentRegistered(uint256 indexed agentId, address indexed agentKey, address indexed revocationKey, address[] guardians, uint8 threshold);
    event StatusChanged(uint256 indexed agentId, Status status, bytes32 reasonHash, address by);
    event Rotated(uint256 indexed agentId, uint256 indexed successorId);
    event RevocationKeyChangeProposed(uint256 indexed agentId, address newKey, uint64 applyAt);
    event RevocationKeyChanged(uint256 indexed agentId, address newKey);
    event GuardianVoted(uint256 indexed agentId, address indexed guardian, uint256 votes, uint256 threshold);
    event LimitsSet(uint256 indexed agentId, uint64 expiresAt, uint64 heartbeatWindow);
    event Beat(uint256 indexed agentId, uint64 at);
    event RecoveryProposed(uint256 indexed agentId, address indexed guardian, address newKey, uint256 votes, uint256 threshold);
    event RecoveryReady(uint256 indexed agentId, address newKey, uint64 readyAt);
    event RecoveryCancelled(uint256 indexed agentId, address by);
    event StopKeySet(uint256 indexed agentId, uint256 x, uint256 y, bytes32 rpIdHash);
    event StopKeyCleared(uint256 indexed agentId);

    error NotRevocationKey();
    error NotGuardian();
    error AgentKeyInUse();
    error Terminal();
    error BadTransition();
    error BadThreshold();
    error NotPending();
    error TooEarly();
    error BadSuccessor();
    error BadKeys();
    error BadAgentSignature();
    error NotAgentKey();
    error NoHeartbeat();
    error Lapsed();
    error BadExpiry();
    error NoRecovery();
    error NoStopKey();
    error BadAssertion();

    constructor(uint64 revocationKeyChangeDelay_, uint64 guardianEscalationDelay_, uint64 guardianRecoveryDelay_) {
        revocationKeyChangeDelay = revocationKeyChangeDelay_;
        guardianEscalationDelay = guardianEscalationDelay_;
        guardianRecoveryDelay = guardianRecoveryDelay_;
    }

    // ---------- registration ----------

    /// @notice Register an agent. The agent key must consent: either it is the caller, or
    ///         `agentSig` is its EIP-191 signature over `registrationDigest(agentKey, revocationKey)`.
    ///         Without this, whoever learned an agent's address first could register it under
    ///         their own cold key and lock the real owner out.
    function register(address agentKey, address revocationKey, address[] calldata guardians, uint8 threshold, bytes calldata agentSig)
        external
        returns (uint256 agentId)
    {
        return _register(agentKey, revocationKey, guardians, threshold, agentSig, 0, 0);
    }

    /// @notice Register with an end date, a heartbeat, or both. `expiresAt` is a timestamp after which the agent
    ///         is no longer trusted with nobody having to send anything; `heartbeatWindow` is how long the agent
    ///         may go silent before the same happens. Zero means neither.
    /// @dev The agent's consent signature covers the keys, not the limits. A limit only ever narrows what the
    ///      agent may do, so a registrar who sets one cannot use it to take authority the agent did not grant.
    function registerWithLimits(
        address agentKey,
        address revocationKey,
        address[] calldata guardians,
        uint8 threshold,
        bytes calldata agentSig,
        uint64 expiresAt,
        uint64 heartbeatWindow
    ) external returns (uint256 agentId) {
        return _register(agentKey, revocationKey, guardians, threshold, agentSig, expiresAt, heartbeatWindow);
    }

    function _register(
        address agentKey,
        address revocationKey,
        address[] calldata guardians,
        uint8 threshold,
        bytes calldata agentSig,
        uint64 expiresAt,
        uint64 heartbeatWindow
    ) internal returns (uint256 agentId) {
        /* a zero cold key is an agent nobody can ever stop; the agent's own key as
           its cold key is a switch the agent holds itself. neither is a registration. */
        if (agentKey == address(0) || revocationKey == address(0) || agentKey == revocationKey) revert BadKeys();
        if (agentIdByKey[agentKey] != 0) revert AgentKeyInUse();
        if (msg.sender != agentKey && _recover(registrationDigest(agentKey, revocationKey), agentSig) != agentKey) revert BadAgentSignature();
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
        /* an expiry already in the past would register an agent that is born untrusted:
           almost certainly a units mistake by the caller, so it is refused rather than stored. */
        if (expiresAt != 0 && expiresAt <= block.timestamp) revert BadExpiry();
        a.expiresAt = expiresAt;
        a.heartbeatWindow = heartbeatWindow;
        a.lastBeat = uint64(block.timestamp);
        agentIdByKey[agentKey] = agentId;
        _history[agentId].push(StatusChange(uint64(block.timestamp), Status.Active));
        emit AgentRegistered(agentId, agentKey, revocationKey, guardians, threshold);
        emit StatusChanged(agentId, Status.Active, bytes32(0), msg.sender);
        if (expiresAt != 0 || heartbeatWindow != 0) emit LimitsSet(agentId, expiresAt, heartbeatWindow);
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
        /* the successor must be live and must be this owner's: "trust moved to X" is a
           claim about the owner's own agents, not a pointer at somebody else's. */
        if (successorId == agentId || s.status != Status.Active || s.revocationKey != msg.sender) revert BadSuccessor();
        a.successorId = successorId;
        _setStatus(agentId, a, Status.Rotated, reasonHash, msg.sender);
        emit Rotated(agentId, successorId);
    }

    /// @notice Set or clear the agent's end date and heartbeat. Only the cold key.
    /// @param expiresAt Timestamp after which the agent is not trusted. 0 clears it.
    /// @param heartbeatWindow How long the agent may go silent. 0 clears it.
    /// @dev Setting either starts a fresh heartbeat window, so an owner who turns one on does not find the
    ///      agent already lapsed by the silence that came before the rule existed.
    function setLimits(uint256 agentId, uint64 expiresAt, uint64 heartbeatWindow) external {
        Agent storage a = _requireOwner(agentId);
        if (a.status == Status.Revoked || a.status == Status.Rotated) revert Terminal();
        if (expiresAt != 0 && expiresAt <= block.timestamp) revert BadExpiry();
        a.expiresAt = expiresAt;
        a.heartbeatWindow = heartbeatWindow;
        a.lastBeat = uint64(block.timestamp);
        emit LimitsSet(agentId, expiresAt, heartbeatWindow);
    }

    // ---------- the panic button ----------

    /// @notice Nominate a passkey that can pause this agent without a wallet. Only the cold key.
    /// @param x P256 public key x. Zero clears the passkey.
    /// @param y P256 public key y.
    /// @param rpIdHash sha256 of the site the passkey was registered to, which binds it there.
    /// @dev The point of this is the case where stopping is urgent and the wallet is not to hand:
    ///      a phone, a fingerprint, and the agent is paused in the next block. It deliberately
    ///      cannot do anything else. Pausing is reversible, so a stolen phone costs its owner an
    ///      interruption; ending an agent, changing its keys or moving its limits still needs the
    ///      cold key. There is no on-curve check: a key that is not on the curve simply never
    ///      verifies, and the owner finds out the first time they try it rather than being able to
    ///      lock anything with it.
    function setStopKey(uint256 agentId, uint256 x, uint256 y, bytes32 rpIdHash) external {
        Agent storage a = _requireOwner(agentId);
        if (a.status == Status.Revoked || a.status == Status.Rotated) revert Terminal();
        StopKey storage k = _stopKeys[agentId];
        if (x == 0 && y == 0) {
            k.set = false; k.x = 0; k.y = 0; k.rpIdHash = bytes32(0);
            emit StopKeyCleared(agentId);
            return;
        }
        k.x = x; k.y = y; k.rpIdHash = rpIdHash; k.set = true;
        /* the nonce is never reset. a new passkey on the same agent must not be able to replay an
           assertion the old one made at the same count. */
        emit StopKeySet(agentId, x, y, rpIdHash);
    }

    /// @notice What the passkey has to sign to pause this agent, right now.
    /// @dev Bound to this contract, this chain, this agent and this use. The nonce moves on every
    ///      successful pause, so an assertion is good exactly once.
    function stopChallenge(uint256 agentId) public view returns (bytes32) {
        return keccak256(abi.encode(address(this), block.chainid, "trustset:pause", agentId, _stopKeys[agentId].nonce));
    }

    /// @notice Pause an agent with its passkey. Anybody may submit this: the assertion is the
    ///         authority, so a relayer can pay the gas and can forge nothing.
    /// @dev Requires user presence and user verification, so a touch alone is not enough; the
    ///      device has to have checked a biometric or a PIN.
    function pauseWithPasskey(uint256 agentId, WebAuthn.Assertion calldata assertion) external {
        Agent storage a = _agents[agentId];
        StopKey storage k = _stopKeys[agentId];
        if (!k.set) revert NoStopKey();
        if (a.status != Status.Active) revert BadTransition();
        WebAuthn.Assertion memory m = WebAuthn.Assertion({
            authenticatorData: assertion.authenticatorData,
            clientDataJSON: assertion.clientDataJSON,
            r: assertion.r,
            s: assertion.s
        });
        (bool ok, uint8 flags) = WebAuthn.verify(m, stopChallenge(agentId), k.rpIdHash, k.x, k.y);
        if (!ok || flags & 0x04 == 0) revert BadAssertion();
        /* spent before the state change, so a reentrant call cannot reuse it. */
        k.nonce++;
        _setStatus(agentId, a, Status.Paused, keccak256("paused with a passkey"), msg.sender);
    }

    /// @notice The passkey nominated for an agent, if any, and the count it is on.
    function stopKeyOf(uint256 agentId) external view returns (uint256 x, uint256 y, bytes32 rpIdHash, uint64 nonce, bool set) {
        StopKey storage k = _stopKeys[agentId];
        return (k.x, k.y, k.rpIdHash, k.nonce, k.set);
    }

    // ---------- heartbeat ----------

    /// @notice The agent says it is alive. Only the agent key, and only while its window is open.
    /// @dev A lapsed heartbeat cannot be cleared by the agent. If it could, a key that went quiet because
    ///      somebody else took it would be revived by that somebody the moment they were ready to use it.
    ///      Coming back from a lapse is the cold key's decision: setLimits starts a new window.
    function beat(uint256 agentId) external {
        Agent storage a = _agents[agentId];
        if (msg.sender != a.agentKey || a.agentKey == address(0)) revert NotAgentKey();
        if (a.heartbeatWindow == 0) revert NoHeartbeat();
        if (block.timestamp > uint256(a.lastBeat) + a.heartbeatWindow) revert Lapsed();
        a.lastBeat = uint64(block.timestamp);
        emit Beat(agentId, uint64(block.timestamp));
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
            _setStatus(agentId, a, Status.Paused, keccak256("guardian pause"), msg.sender);
            guardianPaused[agentId] = true;
        }
    }

    /// @notice If a guardian pause has stood untouched by the owner for the escalation delay, any guardian may
    ///         revoke. This is the recovery path for a lost owner key with a compromised agent.
    function guardianEscalate(uint256 agentId) external {
        Agent storage a = _agents[agentId];
        if (!_isGuardian(a, msg.sender)) revert NotGuardian();
        if (a.status != Status.Paused || !guardianPaused[agentId]) revert BadTransition();
        if (block.timestamp < a.statusSince + guardianEscalationDelay) revert TooEarly();
        _setStatus(agentId, a, Status.Revoked, keccak256("guardian escalation"), msg.sender);
    }

    // ---------- recovering a lost cold key ----------

    /// @notice A guardian proposes replacing the cold key, and votes for it. When the threshold is
    ///         reached a clock starts; after `guardianRecoveryDelay` any guardian may execute it.
    /// @dev This exists for a cold key that was lost. It is deliberately cancellable by the current
    ///      cold key, which means it does NOT help against a key that was stolen: a thief cancels
    ///      every attempt. That case is what pause and escalation are for, and the honest answer
    ///      there is that the agent dies rather than changing hands. Recovery hands an agent to a
    ///      new owner; nobody should be able to do that quietly, so it takes a threshold of the
    ///      people the owner chose, plus a delay in which they can be overruled.
    function proposeRecovery(uint256 agentId, address newKey) external {
        Agent storage a = _agents[agentId];
        if (!_isGuardian(a, msg.sender)) revert NotGuardian();
        if (a.status == Status.Revoked || a.status == Status.Rotated) revert Terminal();
        /* the same checks a registration makes: a key nobody holds, or the agent's own key, is not
           an owner. handing it to the key that already holds it is a no-op worth refusing. */
        if (newKey == address(0) || newKey == a.agentKey || newKey == a.revocationKey) revert BadKeys();

        Recovery storage r = _recovery[agentId];
        /* guardians who name different keys are not agreeing about anything, so naming a new one
           starts a fresh round and the earlier votes stop counting. */
        if (r.newKey != newKey) {
            r.round++;
            r.newKey = newKey;
            r.votes = 0;
            r.readyAt = 0;
        }
        if (recoveryVote[agentId][msg.sender] == r.round + 1) return; // already voted this round
        recoveryVote[agentId][msg.sender] = r.round + 1;
        uint8 votes = ++r.votes;
        emit RecoveryProposed(agentId, msg.sender, newKey, votes, a.guardianThreshold);
        if (votes >= a.guardianThreshold && r.readyAt == 0) {
            r.readyAt = uint64(block.timestamp) + guardianRecoveryDelay;
            emit RecoveryReady(agentId, newKey, r.readyAt);
        }
    }

    /// @notice The cold key refuses a recovery its guardians agreed on. Only the cold key.
    /// @dev Also clears the votes, by moving the round on: a guardian who still wants it has to say
    ///      so again, rather than an old vote counting toward a later attempt.
    function cancelRecovery(uint256 agentId) external {
        _requireOwner(agentId);
        Recovery storage r = _recovery[agentId];
        if (r.newKey == address(0)) revert NoRecovery();
        r.round++;
        r.newKey = address(0);
        r.votes = 0;
        r.readyAt = 0;
        emit RecoveryCancelled(agentId, msg.sender);
    }

    /// @notice Execute a recovery the guardians agreed on and the owner did not cancel. Any guardian.
    function executeRecovery(uint256 agentId) external {
        Agent storage a = _agents[agentId];
        if (!_isGuardian(a, msg.sender)) revert NotGuardian();
        if (a.status == Status.Revoked || a.status == Status.Rotated) revert Terminal();
        Recovery storage r = _recovery[agentId];
        if (r.newKey == address(0) || r.readyAt == 0) revert NoRecovery();
        if (block.timestamp < r.readyAt) revert TooEarly();

        a.revocationKey = r.newKey;
        /* a cold key change the old owner had proposed dies with their ownership. otherwise a
           pending proposal made before the recovery would land afterwards and take the agent
           straight back out of the new owner's hands. */
        a.pendingRevocationKey = address(0);
        a.revocationKeyChangeAt = 0;
        r.round++;
        r.newKey = address(0);
        r.votes = 0;
        r.readyAt = 0;
        emit RevocationKeyChanged(agentId, a.revocationKey);
    }

    /// @notice The recovery in progress, if any: the key proposed, when it may be executed, and where
    ///         the vote stands.
    function recoveryOf(uint256 agentId) external view returns (address newKey, uint64 readyAt, uint8 votes, uint8 threshold) {
        Recovery storage r = _recovery[agentId];
        return (r.newKey, r.readyAt, r.votes, _agents[agentId].guardianThreshold);
    }

    // ---------- views ----------

    /// @notice The one call every app makes. Active, inside its dates, and not gone silent.
    function isTrusted(uint256 agentId) external view returns (bool) {
        Agent storage a = _agents[agentId];
        return a.status == Status.Active && !_expired(a) && !_lapsed(a);
    }

    /// @notice Why an agent is or is not trusted, for a page that has to say something to a person.
    function liveness(uint256 agentId) external view returns (bool trusted, bool expired, bool lapsed, uint64 expiresAt, uint64 nextBeatBy) {
        Agent storage a = _agents[agentId];
        expired = _expired(a);
        lapsed = _lapsed(a);
        trusted = a.status == Status.Active && !expired && !lapsed;
        expiresAt = a.expiresAt;
        nextBeatBy = a.heartbeatWindow == 0 ? 0 : a.lastBeat + a.heartbeatWindow;
    }

    /// @notice Whether the agent was active at a past timestamp. Use this to verify a signature made earlier;
    ///         never read "latest" state to judge an old signature on a chain with speculative heads.
    /// @dev The expiry is checked against the agent's current end date, because only the current one is stored.
    ///      Moving the end date therefore changes this answer about the past, the same way any read of current
    ///      state does. The heartbeat is not checked here at all: liveness is a fact about now, and no record of
    ///      past beats is kept. Both are noted in AUDIT.md.
    function isTrustedAt(uint256 agentId, uint64 timestamp) external view returns (bool) {
        Agent storage a = _agents[agentId];
        if (a.expiresAt != 0 && timestamp >= a.expiresAt) return false;
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

    /// @notice What an agent key signs to consent to being registered under a cold key.
    ///         Bound to this contract and this chain.
    function registrationDigest(address agentKey, address revocationKey) public view returns (bytes32) {
        bytes32 inner = keccak256(abi.encode(address(this), block.chainid, "trustset:register", agentKey, revocationKey));
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", inner));
    }

    // ---------- internal ----------

    function _recover(bytes32 digest, bytes calldata sig) internal pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 r = bytes32(sig[0:32]);
        bytes32 s_ = bytes32(sig[32:64]);
        uint8 v = uint8(sig[64]);
        if (v < 27) v += 27;
        if (uint256(s_) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) return address(0);
        return ecrecover(digest, v, r, s_);
    }

    function _requireOwner(uint256 agentId) internal view returns (Agent storage a) {
        a = _agents[agentId];
        if (msg.sender != a.revocationKey || a.revocationKey == address(0)) revert NotRevocationKey();
    }

    function _expired(Agent storage a) internal view returns (bool) {
        return a.expiresAt != 0 && block.timestamp >= a.expiresAt;
    }

    function _lapsed(Agent storage a) internal view returns (bool) {
        return a.heartbeatWindow != 0 && block.timestamp > uint256(a.lastBeat) + a.heartbeatWindow;
    }

    function _isGuardian(Agent storage a, address who) internal view returns (bool) {
        address[] storage g = a.guardians;
        for (uint256 i = 0; i < g.length; i++) {
            if (g[i] == who) return true;
        }
        return false;
    }

    function _setStatus(uint256 agentId, Agent storage a, Status status, bytes32 reasonHash, address by) internal {
        /* every status change closes the guardians' current vote round, so a vote cast
           before the owner paused and resumed does not still count a year later. and
           whatever pause this is, it is not a guardian pause until guardianPause says so. */
        guardianVoteRound[agentId]++;
        guardianVoteCount[agentId] = 0;
        guardianPaused[agentId] = false;
        a.status = status;
        a.statusSince = uint64(block.timestamp);
        /* coming back to active starts a fresh heartbeat window. an agent paused for a week
           with a one day window would otherwise be lapsed the instant it was resumed. */
        if (status == Status.Active) a.lastBeat = uint64(block.timestamp);
        a.reasonHash = reasonHash;
        _history[agentId].push(StatusChange(uint64(block.timestamp), status));
        emit StatusChanged(agentId, status, reasonHash, by);
    }
}
