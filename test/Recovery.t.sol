// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {KillSwitch} from "../src/KillSwitch.sol";

/// Guardians replacing a cold key its owner can no longer use.
///
/// The distinction this suite is built around: recovery is for a key that was LOST. For a key that
/// was STOLEN it does not help, because the thief can cancel every attempt, and the honest answer
/// there is pause and escalate, which kills the agent rather than handing it over. Both are tested.
contract RecoveryTest is Test {
    KillSwitch ks;
    uint256 agentPk = 0xA1;
    address agentKey = vm.addr(0xA1);
    address owner = address(0xB0B);
    address rescued = address(0x9E11);
    address stranger = address(0xBAD);
    address g1 = address(0x61);
    address g2 = address(0x62);
    address g3 = address(0x63);
    uint64 constant RECOVERY = 7 days;
    uint256 id;

    function _consent(uint256 pk, address cold) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s_) = vm.sign(pk, ks.registrationDigest(vm.addr(pk), cold));
        return abi.encodePacked(r, s_, v);
    }

    function setUp() public {
        ks = new KillSwitch(1 days, 3 days, RECOVERY);
        vm.warp(1_000_000);
        address[] memory gs = new address[](3);
        gs[0] = g1; gs[1] = g2; gs[2] = g3;
        id = ks.register(agentKey, owner, gs, 2, _consent(agentPk, owner));
    }

    function _agree() internal {
        vm.prank(g1); ks.proposeRecovery(id, rescued);
        vm.prank(g2); ks.proposeRecovery(id, rescued);
    }

    /// The whole point: an owner who lost their key gets the agent back through the people they chose.
    function test_guardiansReplaceALostColdKey() public {
        _agree();
        (address k, uint64 readyAt, uint8 votes, uint8 threshold) = ks.recoveryOf(id);
        assertEq(k, rescued); assertEq(votes, 2); assertEq(threshold, 2);
        assertEq(readyAt, uint64(vm.getBlockTimestamp()) + RECOVERY);

        vm.warp(vm.getBlockTimestamp() + RECOVERY);
        vm.prank(g3); ks.executeRecovery(id);
        assertEq(ks.getAgent(id).revocationKey, rescued);

        /* the new owner has the powers, the old one has none */
        vm.prank(rescued); ks.setStatus(id, KillSwitch.Status.Paused, keccak256("mine now"));
        vm.prank(owner);
        vm.expectRevert(KillSwitch.NotRevocationKey.selector);
        ks.setStatus(id, KillSwitch.Status.Active, keccak256("not yours"));
    }

    function test_oneVoteIsNotEnough() public {
        vm.prank(g1); ks.proposeRecovery(id, rescued);
        (, uint64 readyAt, uint8 votes,) = ks.recoveryOf(id);
        assertEq(votes, 1);
        assertEq(readyAt, 0, "the clock does not start under the threshold");
        vm.warp(vm.getBlockTimestamp() + RECOVERY + 1);
        vm.prank(g1);
        vm.expectRevert(KillSwitch.NoRecovery.selector);
        ks.executeRecovery(id);
    }

    function test_theSameGuardianCannotVoteTwice() public {
        vm.prank(g1); ks.proposeRecovery(id, rescued);
        vm.prank(g1); ks.proposeRecovery(id, rescued);
        (, uint64 readyAt, uint8 votes,) = ks.recoveryOf(id);
        assertEq(votes, 1); assertEq(readyAt, 0);
    }

    function test_notReadyUntilTheDelayHasPassed() public {
        _agree();
        vm.warp(vm.getBlockTimestamp() + RECOVERY - 1);
        vm.prank(g1);
        vm.expectRevert(KillSwitch.TooEarly.selector);
        ks.executeRecovery(id);
    }

    /// The owner is not powerless: a recovery they did not want is refused, and the votes go with it.
    function test_theColdKeyCanRefuseIt() public {
        _agree();
        vm.prank(owner); ks.cancelRecovery(id);
        (address k, uint64 readyAt, uint8 votes,) = ks.recoveryOf(id);
        assertEq(k, address(0)); assertEq(readyAt, 0); assertEq(votes, 0);

        vm.warp(vm.getBlockTimestamp() + RECOVERY + 1);
        vm.prank(g1);
        vm.expectRevert(KillSwitch.NoRecovery.selector);
        ks.executeRecovery(id);
    }

    /// A cancelled round's votes must not count toward the next attempt.
    function test_votesDoNotSurviveACancel() public {
        _agree();
        vm.prank(owner); ks.cancelRecovery(id);
        vm.prank(g1); ks.proposeRecovery(id, rescued);
        (, uint64 readyAt, uint8 votes,) = ks.recoveryOf(id);
        assertEq(votes, 1, "g2's old vote is gone");
        assertEq(readyAt, 0);
    }

    /// Guardians naming different keys are not agreeing about anything.
    function test_namingADifferentKeyStartsOver() public {
        vm.prank(g1); ks.proposeRecovery(id, rescued);
        vm.prank(g2); ks.proposeRecovery(id, address(0xDEAD));
        (address k, , uint8 votes,) = ks.recoveryOf(id);
        assertEq(k, address(0xDEAD));
        assertEq(votes, 1, "the first vote was for a different key");
    }

    /// This is the case recovery does NOT solve, and the test says so out loud.
    function test_aStolenColdKeyCancelsForever() public {
        address thief = owner; // the thief holds the cold key
        _agree();
        vm.prank(thief); ks.cancelRecovery(id);
        _agree();
        vm.prank(thief); ks.cancelRecovery(id);
        (address k,,,) = ks.recoveryOf(id);
        assertEq(k, address(0), "recovery cannot win against whoever holds the key");

        /* the answer for a stolen key is not to take the agent back, it is to end it */
        vm.prank(g1); ks.guardianPause(id);
        vm.prank(g2); ks.guardianPause(id);
        assertFalse(ks.isTrusted(id));
        vm.warp(vm.getBlockTimestamp() + ks.guardianEscalationDelay());
        vm.prank(g1); ks.guardianEscalate(id);
        assertEq(uint8(ks.getAgent(id).status), uint8(KillSwitch.Status.Revoked));
    }

    /// A cold key change the old owner set in motion must not land after they lose the agent.
    function test_recoveryKillsTheOldOwnersPendingHandover() public {
        vm.prank(owner); ks.proposeRevocationKey(id, stranger);
        _agree();
        vm.warp(vm.getBlockTimestamp() + RECOVERY);
        vm.prank(g1); ks.executeRecovery(id);
        assertEq(ks.getAgent(id).revocationKey, rescued);
        assertEq(ks.getAgent(id).pendingRevocationKey, address(0));

        vm.prank(stranger);
        vm.expectRevert(KillSwitch.NotRevocationKey.selector);
        ks.applyRevocationKey(id);
    }

    function test_onlyGuardiansMayProposeOrExecute() public {
        vm.prank(stranger);
        vm.expectRevert(KillSwitch.NotGuardian.selector);
        ks.proposeRecovery(id, rescued);

        _agree();
        vm.warp(vm.getBlockTimestamp() + RECOVERY);
        vm.prank(stranger);
        vm.expectRevert(KillSwitch.NotGuardian.selector);
        ks.executeRecovery(id);

        vm.prank(agentKey);
        vm.expectRevert(KillSwitch.NotGuardian.selector);
        ks.executeRecovery(id);
    }

    function test_onlyTheColdKeyMayCancel() public {
        _agree();
        vm.prank(g1);
        vm.expectRevert(KillSwitch.NotRevocationKey.selector);
        ks.cancelRecovery(id);
    }

    function test_cannotRecoverToNobodyOrToTheAgentItself() public {
        vm.startPrank(g1);
        vm.expectRevert(KillSwitch.BadKeys.selector);
        ks.proposeRecovery(id, address(0));
        vm.expectRevert(KillSwitch.BadKeys.selector);
        ks.proposeRecovery(id, agentKey);
        vm.expectRevert(KillSwitch.BadKeys.selector);
        ks.proposeRecovery(id, owner);
        vm.stopPrank();
    }

    function test_cannotRecoverADeadAgent() public {
        vm.prank(owner); ks.setStatus(id, KillSwitch.Status.Revoked, keccak256("stop"));
        vm.prank(g1);
        vm.expectRevert(KillSwitch.Terminal.selector);
        ks.proposeRecovery(id, rescued);
    }

    /// An agent with no guardians has nobody to recover it, which is the owner's choice to make.
    function test_noGuardiansMeansNoRecovery() public {
        address[] memory none;
        uint256 lone = ks.register(vm.addr(0xA2), owner, none, 0, _consent(0xA2, owner));
        vm.prank(g1);
        vm.expectRevert(KillSwitch.NotGuardian.selector);
        ks.proposeRecovery(lone, rescued);
    }

    function testFuzz_onlyGuardiansPropose(address caller) public {
        vm.assume(caller != g1 && caller != g2 && caller != g3);
        vm.prank(caller);
        vm.expectRevert(KillSwitch.NotGuardian.selector);
        ks.proposeRecovery(id, rescued);
    }
}
