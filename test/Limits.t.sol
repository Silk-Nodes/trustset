// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {KillSwitch} from "../src/KillSwitch.sol";

/// Expiry and heartbeat: the two ways an agent stops being trusted with nobody sending anything.
contract LimitsTest is Test {
    KillSwitch ks;
    uint256 agentPk = 0xA1;
    address agentKey = vm.addr(0xA1);
    address owner = address(0xB0B);
    address stranger = address(0xBAD);
    uint256 id;

    function _consent(uint256 pk, address cold) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s_) = vm.sign(pk, ks.registrationDigest(vm.addr(pk), cold));
        return abi.encodePacked(r, s_, v);
    }

    function _plain() internal returns (uint256) {
        address[] memory none;
        return ks.register(agentKey, owner, none, 0, _consent(agentPk, owner));
    }

    function setUp() public {
        ks = new KillSwitch(1 days, 3 days, 7 days);
        vm.warp(1_000_000);
        id = _plain();
    }

    // ---------- expiry ----------

    function test_noExpiryByDefault() public view {
        assertTrue(ks.isTrusted(id));
        (, , , uint64 expiresAt, uint64 nextBeatBy) = ks.liveness(id);
        assertEq(expiresAt, 0);
        assertEq(nextBeatBy, 0);
    }

    function test_expiryEndsTrustWithNoTransaction() public {
        vm.prank(owner);
        ks.setLimits(id, uint64(block.timestamp + 7 days), 0);
        vm.warp(block.timestamp + 7 days - 1);
        assertTrue(ks.isTrusted(id), "trusted right up to the end date");
        vm.warp(block.timestamp + 1);
        assertFalse(ks.isTrusted(id), "and not a second past it");
        (bool trusted, bool expired, bool lapsed,,) = ks.liveness(id);
        assertFalse(trusted); assertTrue(expired); assertFalse(lapsed);
    }

    /// The status is untouched by an expiry. The agent did not do anything wrong; its time ran out.
    function test_expiredAgentIsStillActive() public {
        vm.prank(owner);
        ks.setLimits(id, uint64(block.timestamp + 1 days), 0);
        vm.warp(block.timestamp + 2 days);
        assertFalse(ks.isTrusted(id));
        assertEq(uint8(ks.getAgent(id).status), uint8(KillSwitch.Status.Active));
    }

    /* solc keeps block.timestamp on the stack across a vm.warp, so every timestamp
       after a warp is read back through the cheatcode rather than from the cached one. */
    function test_ownerCanExtendOrClear() public {
        vm.startPrank(owner);
        ks.setLimits(id, uint64(vm.getBlockTimestamp() + 1 days), 0);
        vm.warp(vm.getBlockTimestamp() + 2 days);
        assertFalse(ks.isTrusted(id));
        ks.setLimits(id, uint64(vm.getBlockTimestamp() + 1 days), 0);
        assertTrue(ks.isTrusted(id), "a new end date brings it back");
        ks.setLimits(id, 0, 0);
        vm.warp(vm.getBlockTimestamp() + 3650 days);
        assertTrue(ks.isTrusted(id), "cleared means never");
        vm.stopPrank();
    }

    function test_expiryInThePastRejected() public {
        vm.prank(owner);
        vm.expectRevert(KillSwitch.BadExpiry.selector);
        ks.setLimits(id, uint64(block.timestamp), 0);
    }

    function test_onlyColdKeySetsLimits() public {
        vm.prank(stranger);
        vm.expectRevert(KillSwitch.NotRevocationKey.selector);
        ks.setLimits(id, uint64(block.timestamp + 1 days), 0);

        vm.prank(agentKey);
        vm.expectRevert(KillSwitch.NotRevocationKey.selector);
        ks.setLimits(id, uint64(block.timestamp + 1 days), 0);
    }

    function test_registerWithLimits() public {
        address[] memory none;
        uint64 until = uint64(block.timestamp + 3 days);
        uint256 id2 = ks.registerWithLimits(vm.addr(0xA2), owner, none, 0, _consent(0xA2, owner), until, 1 hours);
        (, , , uint64 expiresAt, uint64 nextBeatBy) = ks.liveness(id2);
        assertEq(expiresAt, until);
        assertEq(nextBeatBy, uint64(block.timestamp + 1 hours));
    }

    function test_registerWithPastExpiryRejected() public {
        address[] memory none;
        bytes memory sig = _consent(0xA3, owner);
        vm.expectRevert(KillSwitch.BadExpiry.selector);
        ks.registerWithLimits(vm.addr(0xA3), owner, none, 0, sig, uint64(block.timestamp - 1), 0);
    }

    /// A signature made after the end date is not covered by it, even judged later.
    function test_isTrustedAtRespectsExpiry() public {
        vm.prank(owner);
        ks.setLimits(id, uint64(block.timestamp + 1 days), 0);
        uint64 during = uint64(block.timestamp + 1 hours);
        uint64 after_ = uint64(block.timestamp + 2 days);
        vm.warp(block.timestamp + 3 days);
        assertTrue(ks.isTrustedAt(id, during));
        assertFalse(ks.isTrustedAt(id, after_));
    }

    // ---------- heartbeat ----------

    function test_silenceEndsTrust() public {
        vm.prank(owner);
        ks.setLimits(id, 0, 1 hours);
        vm.warp(block.timestamp + 1 hours);
        assertTrue(ks.isTrusted(id), "the window is inclusive of its last second");
        vm.warp(block.timestamp + 1);
        assertFalse(ks.isTrusted(id));
        (bool trusted, bool expired, bool lapsed,,) = ks.liveness(id);
        assertFalse(trusted); assertFalse(expired); assertTrue(lapsed);
    }

    function test_beatKeepsItAlive() public {
        vm.prank(owner);
        ks.setLimits(id, 0, 1 hours);
        for (uint256 i = 0; i < 5; i++) {
            vm.warp(block.timestamp + 50 minutes);
            vm.prank(agentKey);
            ks.beat(id);
            assertTrue(ks.isTrusted(id));
        }
        vm.warp(block.timestamp + 61 minutes);
        assertFalse(ks.isTrusted(id));
    }

    /// The point of a dead man's switch: whoever holds the key cannot restart it after it has run out.
    function test_agentCannotReviveItself() public {
        vm.prank(owner);
        ks.setLimits(id, 0, 1 hours);
        vm.warp(block.timestamp + 2 hours);
        vm.prank(agentKey);
        vm.expectRevert(KillSwitch.Lapsed.selector);
        ks.beat(id);
        assertFalse(ks.isTrusted(id));

        vm.prank(owner);
        ks.setLimits(id, 0, 1 hours);
        assertTrue(ks.isTrusted(id), "only the cold key starts a new window");
    }

    function test_onlyTheAgentKeyBeats() public {
        vm.prank(owner);
        ks.setLimits(id, 0, 1 hours);
        vm.prank(owner);
        vm.expectRevert(KillSwitch.NotAgentKey.selector);
        ks.beat(id);
        vm.prank(stranger);
        vm.expectRevert(KillSwitch.NotAgentKey.selector);
        ks.beat(id);
    }

    function test_beatWithoutAHeartbeatReverts() public {
        vm.prank(agentKey);
        vm.expectRevert(KillSwitch.NoHeartbeat.selector);
        ks.beat(id);
    }

    /// A pause is not silence. Resuming starts a fresh window rather than resuming a dead one.
    function test_resumeStartsAFreshWindow() public {
        vm.startPrank(owner);
        ks.setLimits(id, 0, 1 hours);
        ks.setStatus(id, KillSwitch.Status.Paused, keccak256("owner paused"));
        vm.warp(block.timestamp + 10 days);
        ks.setStatus(id, KillSwitch.Status.Active, keccak256("owner resumed"));
        vm.stopPrank();
        assertTrue(ks.isTrusted(id), "not lapsed by the time it spent paused");
    }

    function test_pausedAndExpiredStaysUntrustedOnResume() public {
        vm.startPrank(owner);
        ks.setLimits(id, uint64(block.timestamp + 1 days), 0);
        ks.setStatus(id, KillSwitch.Status.Paused, keccak256("owner paused"));
        vm.warp(block.timestamp + 2 days);
        ks.setStatus(id, KillSwitch.Status.Active, keccak256("owner resumed"));
        vm.stopPrank();
        assertFalse(ks.isTrusted(id), "resuming does not move the end date");
    }

    function test_limitsCannotBeSetOnARevokedAgent() public {
        vm.startPrank(owner);
        ks.setStatus(id, KillSwitch.Status.Revoked, keccak256("stop"));
        vm.expectRevert(KillSwitch.Terminal.selector);
        ks.setLimits(id, uint64(block.timestamp + 1 days), 0);
        vm.stopPrank();
    }

    /// Whatever the limits say, a stop still stops.
    function test_stopBeatsEverything() public {
        vm.startPrank(owner);
        ks.setLimits(id, uint64(block.timestamp + 365 days), 365 days);
        ks.setStatus(id, KillSwitch.Status.Revoked, keccak256("stop"));
        vm.stopPrank();
        assertFalse(ks.isTrusted(id));
    }

    function testFuzz_expiryBoundary(uint32 span, uint32 jump) public {
        vm.assume(span > 0);
        uint64 until = uint64(block.timestamp) + span;
        vm.prank(owner);
        ks.setLimits(id, until, 0);
        vm.warp(uint256(block.timestamp) + jump);
        assertEq(ks.isTrusted(id), block.timestamp < until);
    }

    function testFuzz_onlyAgentKeyBeats(address caller) public {
        vm.assume(caller != agentKey);
        vm.prank(owner);
        ks.setLimits(id, 0, 1 hours);
        vm.prank(caller);
        vm.expectRevert(KillSwitch.NotAgentKey.selector);
        ks.beat(id);
    }
}
