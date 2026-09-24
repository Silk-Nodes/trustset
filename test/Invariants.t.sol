// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {KillSwitch} from "../src/KillSwitch.sol";

/// The properties that carry the product, checked against call sequences nobody wrote down.
///
/// The unit suites prove that each door works and that each guard refuses the obvious wrong caller.
/// What they cannot prove is that no ORDER of those calls reaches a state the design forbids, and
/// that is the whole question for a switch: a stop has to be a stop no matter what happened before
/// it or what anybody does after. So the handler below holds a small world, four actors who are
/// somebody and one who is nobody, and the fuzzer calls whatever it likes in whatever order,
/// including the calls that should fail.
///
/// Reverts are swallowed on purpose. A sequence that ends in a revert is a sequence that proves a
/// guard held, and dropping it would throw away most of the search.
contract Handler is Test {
    KillSwitch public ks;

    address public constant OWNER = address(0xB0B);
    address public constant STRANGER = address(0xBAD);
    address public immutable agentKey;
    uint256 internal constant AGENT_PK = 0xA1;
    address[3] public guardians = [address(0x61), address(0x62), address(0x63)];

    uint256[] public ids;

    /* ---------- ghosts ---------- */

    /// The owner each agent SHOULD have, moved only by the two doors that may move it.
    mapping(uint256 => address) public expectedCold;
    /// Once true, never false again, and the invariant says the status agrees.
    mapping(uint256 => bool) public wasTerminal;
    /// The moment an agent became terminal, for asking about the past afterwards.
    mapping(uint256 => uint64) public terminalAt;
    /// The highest passkey nonce ever seen, which must never be beaten from below.
    mapping(uint256 => uint64) public maxNonce;
    /// Set if guardians ever paused an agent on fewer distinct votes than its threshold.
    bool public thresholdWasBypassed;

    /* every delay in this contract exists so that a change can be seen coming and refused. the
       invariants above prove WHO may move a thing; these prove WHEN. they were added after three
       mutations went undetected: deleting the wait from applyRevocationKey, from executeRecovery,
       and deleting the requirement that an escalation follow a guardian pause. each one left every
       property green, because a suite that only watches who is holding the door does not notice
       that the door opened a week early. */
    bool public keyChangedEarly;
    bool public recoveryRanEarly;
    bool public escalatedWithoutAGuardianPause;
    bool public escalatedEarly;

    /* distinct guardian votes since the last status change, which is what a threshold means. */
    mapping(uint256 => uint256) internal voteEpoch;
    mapping(uint256 => mapping(address => uint256)) internal votedIn;
    mapping(uint256 => uint256) internal distinctVotes;
    mapping(uint256 => uint256) internal seenHistoryLength;

    /// Successful calls per door, so a green run cannot be a run that did nothing.
    ///
    /// This was a mapping keyed by a string at first, which compiles: a short string literal
    /// converts to bytes32 as left aligned ascii. The invariant then read keccak256 of the same
    /// words, which is a different key, so it read twelve empty slots and reported that nothing
    /// had happened. It was right that time, and would have been wrong every time after.
    string[12] public DOORS = [
        "setStatus", "rotate", "setLimits", "beat", "proposeRevocationKey", "applyRevocationKey",
        "guardianPause", "guardianEscalate", "proposeRecovery", "cancelRecovery", "executeRecovery", "setStopKey"
    ];
    uint256[12] public did;
    /// Every handler call, successful or not. The invariants are also evaluated once before the
    /// fuzzer has called anything, so a bare "something succeeded" floor fails on that first look
    /// rather than on a real run. This is what tells the two apart.
    uint256 public attempts;
    function totalCalls() external view returns (uint256 t) { for (uint256 i; i < did.length; i++) t += did[i]; }
    function doorName(uint256 i) external view returns (string memory) { return DOORS[i]; }

    constructor(KillSwitch ks_, uint256[] memory ids_) {
        ks = ks_;
        agentKey = vm.addr(AGENT_PK);
        for (uint256 i = 0; i < ids_.length; i++) {
            ids.push(ids_[i]);
            expectedCold[ids_[i]] = OWNER;
            seenHistoryLength[ids_[i]] = ks.historyLength(ids_[i]);
        }
    }

    function idCount() external view returns (uint256) { return ids.length; }

    function _id(uint256 seed) internal view returns (uint256) { return ids[seed % ids.length]; }

    /// Anybody at all, including somebody with no business here.
    function _who(uint256 seed) internal view returns (address) {
        uint256 k = seed % 6;
        if (k == 0) return OWNER;
        if (k == 1) return agentKey;
        if (k == 5) return STRANGER;
        return guardians[k - 2];
    }

    /// The agent's owner RIGHT NOW, which is not the same as the key it was registered with:
    /// a recovery moves it, and a handler that kept pranking the original owner would spend the
    /// rest of the run locked out of its own agent.
    function _cold(uint256 id) internal view returns (address) { return ks.getAgent(id).revocationKey; }

    function _guardian(uint256 seed) internal view returns (address) { return guardians[seed % 3]; }

    /// Two candidate keys, not six. Recovery needs a threshold of guardians naming the SAME key,
    /// and out of six candidates they rarely agree by accident, so executeRecovery was unreachable.
    address public constant RESCUED_A = address(0x9E11);
    address public constant RESCUED_B = address(0x9E22);
    function _newKey(uint256 seed) internal pure returns (address) { return seed % 2 == 0 ? RESCUED_A : RESCUED_B; }

    /// Five times out of six the caller who is allowed, once the caller who is not.
    ///
    /// A uniformly random caller is the obvious choice and it is the wrong one. Ten percent of
    /// calls landed anywhere at all, and four of the twelve doors never opened once in a run, so
    /// the deep states, an escalation after a standing guardian pause, a recovery executed after
    /// its week, were never reached and the invariants about them were never really tested. The
    /// stranger still gets their turn, which is what keeps the authorisation itself under test.
    function _mostly(address right, uint256 seed) internal pure returns (address) {
        return seed % 6 == 5 ? STRANGER : right;
    }

    /// Run after every action. It RECORDS and never asserts, which is the whole point.
    ///
    /// The first version asserted here, and it was worthless. An assertion inside a handler reverts
    /// the handler call; with fail_on_revert off the fuzzer treats a reverted call as one to
    /// discard, rolls the state back and carries on, so the failure and the ghost that would have
    /// proved it both vanish. Deleting the terminal check from setStatus and rerunning the suite
    /// was how that surfaced: an agent really could come back from revoked and every invariant
    /// still went green, because the call that brought it back tripped the assertion here and was
    /// thrown away as if it had never been made.
    ///
    /// So the handler only ever writes down what it saw. Every claim is made by an invariant_
    /// function, which runs outside the sequence where a failure is a failure.
    function _observe(uint256 id) internal {
        KillSwitch.Status s = ks.getAgent(id).status;
        if (s == KillSwitch.Status.Revoked || s == KillSwitch.Status.Rotated) {
            if (!wasTerminal[id]) { wasTerminal[id] = true; terminalAt[id] = uint64(vm.getBlockTimestamp()); }
        }
        /* only ever raised, so a nonce that goes down leaves this above it and the invariant sees it */
        (,,, uint64 nonce,) = ks.stopKeyOf(id);
        if (nonce > maxNonce[id]) maxNonce[id] = nonce;

        /* a status change ends the current vote round, so the tally starts again */
        uint256 hl = ks.historyLength(id);
        if (hl != seenHistoryLength[id]) {
            seenHistoryLength[id] = hl;
            voteEpoch[id]++;
            distinctVotes[id] = 0;
        }
    }

    /* ---------- the doors ---------- */

    function setStatus(uint256 idSeed, uint256 whoSeed, uint8 raw, bytes32 reason) external {
        attempts++;
        uint256 id = _id(idSeed);
        KillSwitch.Status s = KillSwitch.Status(uint8(bound(raw, 0, 4)));
        vm.prank(_mostly(_cold(id), whoSeed));
        try ks.setStatus(id, s, reason) { did[0]++; } catch {}
        _observe(id);
    }

    function rotate(uint256 idSeed, uint256 succSeed, uint256 whoSeed) external {
        attempts++;
        uint256 id = _id(idSeed);
        vm.prank(_mostly(_cold(id), whoSeed));
        try ks.rotate(id, _id(succSeed), keccak256("rotated")) { did[1]++; } catch {}
        _observe(id);
    }

    function setLimits(uint256 idSeed, uint256 whoSeed, uint64 expiry, uint64 window) external {
        attempts++;
        uint256 id = _id(idSeed);
        /* bounded into the plausible: an expiry inside the next year, a window of minutes to weeks,
           and zero often enough that clearing a limit is exercised too. */
        uint64 e = expiry % 4 == 0 ? 0 : uint64(bound(expiry, vm.getBlockTimestamp() + 1, vm.getBlockTimestamp() + 365 days));
        uint64 w = window % 4 == 0 ? 0 : uint64(bound(window, 1 minutes, 30 days));
        vm.prank(_mostly(_cold(id), whoSeed));
        try ks.setLimits(id, e, w) { did[2]++; } catch {}
        _observe(id);
    }

    function beat(uint256 idSeed, uint256 whoSeed) external {
        attempts++;
        uint256 id = _id(idSeed);
        vm.prank(_mostly(ks.getAgent(id).agentKey, whoSeed));
        try ks.beat(id) { did[3]++; } catch {}
        _observe(id);
    }

    function proposeRevocationKey(uint256 idSeed, uint256 whoSeed, uint256 keySeed) external {
        attempts++;
        uint256 id = _id(idSeed);
        vm.prank(_mostly(_cold(id), whoSeed));
        try ks.proposeRevocationKey(id, _newKey(keySeed)) { did[4]++; } catch {}
        _observe(id);
    }

    /// One of the two doors an owner may move through, so it is one of the two that updates the ghost.
    function applyRevocationKey(uint256 idSeed, uint256 whoSeed) external {
        attempts++;
        uint256 id = _id(idSeed);
        uint64 dueAt = ks.getAgent(id).revocationKeyChangeAt;
        vm.prank(_mostly(_cold(id), whoSeed));
        try ks.applyRevocationKey(id) {
            did[5]++;
            if (dueAt == 0 || vm.getBlockTimestamp() < dueAt) keyChangedEarly = true;
            expectedCold[id] = ks.getAgent(id).revocationKey;
        } catch {}
        _observe(id);
    }

    function guardianPause(uint256 idSeed, uint256 whoSeed) external {
        attempts++;
        uint256 id = _id(idSeed);
        _guardianPause(id, _mostly(_guardian(whoSeed), whoSeed));
        _observe(id);
    }

    function _guardianPause(uint256 id, address who) internal {
        uint256 before = ks.historyLength(id);
        /* count this caller as a distinct voter in the current round, the way the contract does */
        bool counts = votedIn[id][who] != voteEpoch[id] + 1;
        vm.prank(who);
        try ks.guardianPause(id) {
            did[6]++;
            if (counts) { votedIn[id][who] = voteEpoch[id] + 1; distinctVotes[id]++; }
            /* if that call paused the agent, note whether the threshold had really been met.
               recorded, not asserted, for the reason in _observe. */
            if (ks.historyLength(id) > before && distinctVotes[id] < ks.getAgent(id).guardianThreshold) {
                thresholdWasBypassed = true;
            }
        } catch {}
    }

    /* ---------- sequences the fuzzer will not find on its own ----------
     *
     * picking uniformly among thirteen doors, the odds of drawing "two different guardians vote,
     * nothing else touches the agent in between, then a week passes" are close enough to zero that
     * guardianEscalate and executeRecovery opened exactly zero times across 128,000 calls. the
     * invariants about them were therefore decorative.
     *
     * these two supply the agreement and nothing else. every call inside them is one a guardian
     * could make on their own, through the real contract, with the real authorisation; the fuzzer
     * still decides when they happen, against which agent, and what runs before and after. the
     * threshold is never assumed, it is still counted and asserted in _guardianPause. */

    function guardiansAgreeToPause(uint256 idSeed) external {
        attempts++;
        uint256 id = _id(idSeed);
        for (uint256 i = 0; i < guardians.length; i++) _guardianPause(id, guardians[i]);
        _observe(id);
    }

    /* the three that need a clock as well as an agreement. the delays are read off the contract
       rather than written down here, so a change to one of them cannot leave this suite quietly
       warping past a delay that no longer exists. */

    function guardiansEscalateAfterTheDelay(uint256 idSeed) external {
        attempts++;
        uint256 id = _id(idSeed);
        for (uint256 i = 0; i < guardians.length; i++) _guardianPause(id, guardians[i]);
        vm.warp(vm.getBlockTimestamp() + ks.guardianEscalationDelay() + 1);
        _escalate(id, guardians[0]);
        _observe(id);
    }

    function guardiansCompleteARecovery(uint256 idSeed, uint256 keySeed) external {
        attempts++;
        uint256 id = _id(idSeed);
        address newKey = _newKey(keySeed);
        for (uint256 i = 0; i < guardians.length; i++) {
            vm.prank(guardians[i]);
            try ks.proposeRecovery(id, newKey) { did[8]++; } catch {}
        }
        vm.warp(vm.getBlockTimestamp() + ks.guardianRecoveryDelay() + 1);
        _executeRecovery(id, guardians[1]);
        _observe(id);
    }

    /// An agent that is actually kept alive, rather than one that lapses the first time time moves.
    function heartbeatCycle(uint256 idSeed, uint64 window) external {
        attempts++;
        uint256 id = _id(idSeed);
        uint64 w = uint64(bound(window, 1 hours, 30 days));
        vm.prank(_cold(id));
        try ks.setLimits(id, 0, w) { did[2]++; } catch {}
        vm.warp(vm.getBlockTimestamp() + w / 2);
        vm.prank(ks.getAgent(id).agentKey);
        try ks.beat(id) { did[3]++; } catch {}
        _observe(id);
    }

    function guardiansAgreeToRecover(uint256 idSeed, uint256 keySeed) external {
        attempts++;
        uint256 id = _id(idSeed);
        address newKey = _newKey(keySeed);
        for (uint256 i = 0; i < guardians.length; i++) {
            vm.prank(guardians[i]);
            try ks.proposeRecovery(id, newKey) { did[8]++; } catch {}
        }
        _observe(id);
    }

    function guardianEscalate(uint256 idSeed, uint256 whoSeed) external {
        attempts++;
        uint256 id = _id(idSeed);
        _escalate(id, _mostly(_guardian(whoSeed), whoSeed));
        _observe(id);
    }

    function _escalate(uint256 id, address who) internal {
        bool wasGuardianPause = ks.guardianPaused(id);
        uint64 since = ks.getAgent(id).statusSince;
        vm.prank(who);
        try ks.guardianEscalate(id) {
            did[7]++;
            if (!wasGuardianPause) escalatedWithoutAGuardianPause = true;
            if (vm.getBlockTimestamp() < since + ks.guardianEscalationDelay()) escalatedEarly = true;
        } catch {}
    }

    function proposeRecovery(uint256 idSeed, uint256 whoSeed, uint256 keySeed) external {
        attempts++;
        uint256 id = _id(idSeed);
        vm.prank(_mostly(_guardian(whoSeed), whoSeed));
        try ks.proposeRecovery(id, _newKey(keySeed)) { did[8]++; } catch {}
        _observe(id);
    }

    function cancelRecovery(uint256 idSeed, uint256 whoSeed) external {
        attempts++;
        uint256 id = _id(idSeed);
        vm.prank(_mostly(_cold(id), whoSeed));
        try ks.cancelRecovery(id) { did[9]++; } catch {}
        _observe(id);
    }

    /// The other door an owner may move through.
    function executeRecovery(uint256 idSeed, uint256 whoSeed) external {
        attempts++;
        uint256 id = _id(idSeed);
        _executeRecovery(id, _mostly(_guardian(whoSeed), whoSeed));
        _observe(id);
    }

    function _executeRecovery(uint256 id, address who) internal {
        (, uint64 readyAt, uint8 votes, uint8 threshold) = ks.recoveryOf(id);
        vm.prank(who);
        try ks.executeRecovery(id) {
            did[10]++;
            if (readyAt == 0 || vm.getBlockTimestamp() < readyAt || votes < threshold) recoveryRanEarly = true;
            expectedCold[id] = ks.getAgent(id).revocationKey;
        } catch {}
    }

    function setStopKey(uint256 idSeed, uint256 whoSeed, uint256 x, uint256 y) external {
        attempts++;
        uint256 id = _id(idSeed);
        vm.prank(_mostly(_cold(id), whoSeed));
        try ks.setStopKey(id, x, y, keccak256("rp")) { did[11]++; } catch {}
        _observe(id);
    }

    /// Time is an input here, because two of the four ways an agent stops are just the clock.
    function warp(uint256 by) external {
        attempts++;
        /* biased at the three delays the contract actually has. a uniform jump over six weeks
           crosses all of them almost every time, which sounds generous and is not: it means the
           state just before a delay elapses is never visited. */
        uint256 step = by % 4 == 0 ? bound(by, 1 minutes, 12 hours)
            : by % 4 == 1 ? bound(by, 1 days, 3 days)
            : by % 4 == 2 ? bound(by, 3 days, 8 days)
            : bound(by, 1, 45 days);
        vm.warp(vm.getBlockTimestamp() + step);
        for (uint256 i = 0; i < ids.length; i++) _observe(ids[i]);
    }
}

contract InvariantsTest is StdInvariant, Test {
    KillSwitch ks;
    Handler handler;

    uint256 constant KEY_DELAY = 1 days;
    uint256 constant ESCALATION = 3 days;
    uint256 constant RECOVERY = 7 days;

    uint256 idA;
    uint256 idB;
    uint256 idC;

    function _consent(uint256 pk, address cold) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, ks.registrationDigest(vm.addr(pk), cold));
        return abi.encodePacked(r, s, v);
    }

    function setUp() public {
        ks = new KillSwitch(uint64(KEY_DELAY), uint64(ESCALATION), uint64(RECOVERY));
        vm.warp(1_000_000);

        address[] memory gs = new address[](3);
        gs[0] = address(0x61); gs[1] = address(0x62); gs[2] = address(0x63);

        /* two agents, with different thresholds, so "a threshold of two" and "a threshold of three"
           are both exercised and rotate has a real successor to point at. */
        idA = ks.register(vm.addr(0xA1), address(0xB0B), gs, 2, _consent(0xA1, address(0xB0B)));
        idB = ks.register(vm.addr(0xA2), address(0xB0B), gs, 3, _consent(0xA2, address(0xB0B)));
        idC = ks.register(vm.addr(0xA3), address(0xB0B), gs, 1, _consent(0xA3, address(0xB0B)));

        uint256[] memory ids = new uint256[](3);
        ids[0] = idA; ids[1] = idB; ids[2] = idC;
        handler = new Handler(ks, ids);
        targetContract(address(handler));
    }

    /* ---------- the properties ---------- */

    /// Revoked and Rotated are terminal. This is the one the whole product rests on: a stop that can
    /// be undone by some sequence is not a stop.
    function invariant_terminalIsForever() public view {
        for (uint256 i = 0; i < handler.idCount(); i++) {
            uint256 id = handler.ids(i);
            if (!handler.wasTerminal(id)) continue;
            KillSwitch.Status s = ks.getAgent(id).status;
            assertTrue(s == KillSwitch.Status.Revoked || s == KillSwitch.Status.Rotated, "terminal was undone");
            assertFalse(ks.isTrusted(id), "a terminal agent was trusted");
        }
    }

    /// An agent that was stopped stays stopped in the record, so an app judging an old signature
    /// cannot be told the agent was fine at a moment after it was revoked.
    function invariant_thePastStaysStopped() public view {
        for (uint256 i = 0; i < handler.idCount(); i++) {
            uint256 id = handler.ids(i);
            uint64 t = handler.terminalAt(id);
            if (t == 0) continue;
            assertFalse(ks.isTrustedAt(id, t), "trusted at the moment it was stopped");
            assertFalse(ks.isTrustedAt(id, uint64(vm.getBlockTimestamp())), "trusted after it was stopped");
        }
    }

    /// The owner moves through exactly two doors, both of which take a delay, and through nothing
    /// else. No ordering of the other eleven calls may move it.
    function invariant_coldKeyMovesOnlyThroughItsTwoDoors() public view {
        for (uint256 i = 0; i < handler.idCount(); i++) {
            uint256 id = handler.ids(i);
            assertEq(ks.getAgent(id).revocationKey, handler.expectedCold(id), "the owner moved by some other route");
        }
    }

    /// A key nobody holds is not an owner, at any point in an agent's life.
    function invariant_coldKeyIsNeverZero() public view {
        for (uint256 i = 0; i < handler.idCount(); i++) {
            assertTrue(ks.getAgent(handler.ids(i)).revocationKey != address(0), "an agent was left with no owner");
        }
    }

    /// Trusted means all four of the ways to stop are clear, not just the status.
    function invariant_trustedMeansEveryLimitIsClear() public view {
        for (uint256 i = 0; i < handler.idCount(); i++) {
            uint256 id = handler.ids(i);
            if (!ks.isTrusted(id)) continue;
            (bool trusted, bool expired, bool lapsed,,) = ks.liveness(id);
            assertTrue(trusted, "isTrusted and liveness disagree");
            assertFalse(expired, "trusted past its end date");
            assertFalse(lapsed, "trusted while silent");
            assertTrue(ks.getAgent(id).status == KillSwitch.Status.Active, "trusted while not active");
        }
    }

    /// The history only ever grows, and never goes backwards in time. Everything that reads the past
    /// is a binary search over it, so a single out of order entry would quietly corrupt every answer.
    function invariant_historyOnlyGrowsForward() public view {
        for (uint256 i = 0; i < handler.idCount(); i++) {
            uint256 id = handler.ids(i);
            uint256 n = ks.historyLength(id);
            assertGt(n, 0, "an agent with no history");
            uint64 last = 0;
            for (uint256 j = 0; j < n; j++) {
                uint64 at = ks.historyAt(id, j).at;
                assertGe(at, last, "history went backwards in time");
                last = at;
            }
            assertEq(uint8(ks.statusAt(id, uint64(vm.getBlockTimestamp()))), uint8(ks.getAgent(id).status), "the record disagrees with now");
        }
    }

    /* the passkey nonce was an invariant here too, and it was removed. this handler cannot forge a
       webauthn assertion, so pauseWithPasskey is never reached and the property could never have
       gone red: deleting the nonce++ from the contract left it green. Panic.t.sol proves it with
       real signed vectors instead. a check that cannot fail is worse than no check, because it
       reads as coverage. */

    /// Every delay is waited out. A key handover that can be rushed is not a timelock.
    function invariant_nothingSkipsItsDelay() public view {
        assertFalse(handler.keyChangedEarly(), "an owner changed before its delay was up");
        assertFalse(handler.recoveryRanEarly(), "a recovery executed before its clock, or below its threshold");
        assertFalse(handler.escalatedEarly(), "guardians escalated before the escalation delay");
    }

    /// Only a pause the guardians themselves made may be escalated, so an owner who pauses their
    /// own agent for a week does not come back to find it revoked.
    function invariant_onlyAGuardianPauseCanBeEscalated() public view {
        assertFalse(handler.escalatedWithoutAGuardianPause(), "an escalation followed a pause the guardians did not make");
    }

    /// A threshold is a number of DISTINCT guardians, counted here the way the contract counts it.
    function invariant_guardiansCannotPauseBelowTheirThreshold() public view {
        assertFalse(handler.thresholdWasBypassed(), "guardians paused an agent without reaching its threshold");
    }

    /// A guardian pause is a guardian pause. Nothing else sets the flag that lets guardians escalate
    /// to revoked, so an owner's own pause can never be escalated by somebody else.
    function invariant_guardianPausedImpliesPaused() public view {
        for (uint256 i = 0; i < handler.idCount(); i++) {
            uint256 id = handler.ids(i);
            if (!ks.guardianPaused(id)) continue;
            assertTrue(ks.getAgent(id).status == KillSwitch.Status.Paused, "guardian flag set on an agent that is not paused");
        }
    }

    /// A recovery that has not reached the threshold has no clock, so it can never be executed.
    function invariant_recoveryNeedsItsThresholdFirst() public view {
        for (uint256 i = 0; i < handler.idCount(); i++) {
            (address newKey, uint64 readyAt, uint8 votes, uint8 threshold) = ks.recoveryOf(handler.ids(i));
            if (readyAt != 0) assertGe(votes, threshold, "a recovery was armed below its threshold");
            if (newKey == address(0)) assertEq(readyAt, 0, "a cancelled recovery kept its clock");
        }
    }

    /// What the fuzzer actually managed to do.
    ///
    /// Without this the suite is worth nothing: nine properties holding across 128,000 calls that
    /// all reverted would print exactly the same green as nine properties that were really tested.
    /// The first version of this suite did exactly that, and only said so because the counter was
    /// wired up wrong in a way that read zero.
    ///
    /// The floor is per run, because handler state resets between runs, so it cannot ask for every
    /// door every time. `invariant_callSummary` prints the spread, and `test_everyDoorOpens` below
    /// is the one that proves each door is reachable at all.
    /// A full run that changed nothing would be a suite proving its properties about an untouched
    /// contract. Short sequences are exempt: the invariants are evaluated before the fuzzer has
    /// called anything, and again on the one call sequences the shrinker produces, and neither is
    /// a run.
    function invariant_theRunActuallyDidSomething() public view {
        if (handler.attempts() < 50) return;
        assertGt(handler.totalCalls(), 0, "a whole run of calls changed nothing");
    }

    function invariant_callSummary() public view {
        console.log("attempts:", handler.attempts());
        console.log("calls that changed something:", handler.totalCalls());
        for (uint256 i = 0; i < 12; i++) console.log("  ", handler.doorName(i), handler.did(i));
    }

    /// Every door opens.
    ///
    /// The invariant run cannot assert this, because handler state resets between runs and a run
    /// that revokes an agent early legitimately never touches half of them again. So reachability
    /// is proved here, once, deterministically, through the same handler the fuzzer drives. If a
    /// door stops being reachable this fails, and the summary above stops being able to hide it.
    function test_everyDoorOpens() public {
        /* rotate first, while all three are active and share an owner, and spend agent C on it */
        handler.rotate(2, 0, 0);

        handler.setStopKey(0, 0, 1, 2);
        handler.heartbeatCycle(0, 2 days);          // setLimits, then beat inside the window
        handler.setStatus(0, 0, 2, "pause");        // paused
        handler.setStatus(0, 0, 1, "resume");       // active again

        handler.proposeRevocationKey(0, 0, 0);
        handler.warp(uint256(ks.revocationKeyChangeDelay()) + 1);
        handler.applyRevocationKey(0, 0);

        /* key B, not A: A is the owner by now, and proposing the key that already holds the
           agent is refused, which is what made this step silently do nothing the first time. */
        handler.proposeRecovery(0, 0, 1);           // one guardian is not a threshold
        handler.cancelRecovery(0, 0);               // and the owner refuses it
        handler.guardiansCompleteARecovery(0, 1);   // agreement, a week, then execution

        handler.guardianPause(0, 0);                // one vote
        handler.guardianPause(0, 1);                // a second, distinct: now it pauses

        handler.guardiansEscalateAfterTheDelay(1);  // agent B: pause, three days, revoked

        for (uint256 i = 0; i < 12; i++) {
            assertGt(handler.did(i), 0, string.concat("could not reach ", handler.doorName(i)));
        }
    }
}
