// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {KillSwitch} from "../src/KillSwitch.sol";

contract KillSwitchTest is Test {
    KillSwitch ks;
    uint256 agentPk = 0xA1;
    address agentKey = vm.addr(0xA1);
    address owner = address(0xB0B);
    address g1 = address(0x61);
    address g2 = address(0x62);
    address g3 = address(0x63);
    uint256 id;

    /* the agent key's consent to its registration, signed with its own key */
    function _consent(uint256 agentPk, address cold) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s_) = vm.sign(agentPk, ks.registrationDigest(vm.addr(agentPk), cold));
        return abi.encodePacked(r, s_, v);
    }

    function setUp() public {
        ks = new KillSwitch(1 days, 3 days);
        vm.warp(1_000_000);
        address[] memory gs = new address[](3);
        gs[0] = g1;
        gs[1] = g2;
        gs[2] = g3;
        id = ks.register(agentKey, owner, gs, 2, _consent(agentPk, owner));
    }

    function test_registerIsActive() public view {
        assertTrue(ks.isTrusted(id));
        assertEq(ks.agentIdByKey(agentKey), id);
        assertEq(ks.historyLength(id), 1);
    }

    function test_duplicateAgentKeyReverts() public {
        address[] memory none;
        bytes memory sig = _consent(agentPk, owner);
        vm.expectRevert(KillSwitch.AgentKeyInUse.selector);
        ks.register(agentKey, owner, none, 0, sig);
    }

    function test_badThresholdReverts() public {
        address[] memory gs = new address[](1);
        gs[0] = g1;
        bytes memory s2 = _consent(0xA2, owner);
        bytes memory s3 = _consent(0xA3, owner);
        vm.expectRevert(KillSwitch.BadThreshold.selector);
        ks.register(vm.addr(0xA2), owner, gs, 2, s2);
        vm.expectRevert(KillSwitch.BadThreshold.selector);
        ks.register(vm.addr(0xA3), owner, gs, 0, s3);
    }

    function test_onlyRevocationKeyCanSetStatus() public {
        vm.prank(agentKey);
        vm.expectRevert(KillSwitch.NotRevocationKey.selector);
        ks.setStatus(id, KillSwitch.Status.Revoked, bytes32(0));
    }

    function test_pauseResumeRevoke() public {
        vm.startPrank(owner);
        ks.setStatus(id, KillSwitch.Status.Paused, keccak256("suspicious"));
        assertFalse(ks.isTrusted(id));
        ks.setStatus(id, KillSwitch.Status.Active, bytes32(0));
        assertTrue(ks.isTrusted(id));
        ks.setStatus(id, KillSwitch.Status.Revoked, keccak256("compromised"));
        assertFalse(ks.isTrusted(id));
        vm.expectRevert(KillSwitch.Terminal.selector);
        ks.setStatus(id, KillSwitch.Status.Active, bytes32(0));
        vm.stopPrank();
    }

    function test_cannotSetNoneOrRotatedDirectly() public {
        vm.startPrank(owner);
        vm.expectRevert(KillSwitch.BadTransition.selector);
        ks.setStatus(id, KillSwitch.Status.Rotated, bytes32(0));
        vm.expectRevert(KillSwitch.BadTransition.selector);
        ks.setStatus(id, KillSwitch.Status.None, bytes32(0));
        vm.stopPrank();
    }

    function test_isTrustedAtUsesHistory() public {
        uint64 t0 = uint64(block.timestamp);
        vm.warp(t0 + 100);
        vm.prank(owner);
        ks.setStatus(id, KillSwitch.Status.Revoked, bytes32(0));
        assertTrue(ks.isTrustedAt(id, t0 + 50));
        assertFalse(ks.isTrustedAt(id, t0 + 100));
        assertFalse(ks.isTrustedAt(id, t0 - 1));
        assertEq(uint8(ks.statusAt(id, t0 - 1)), uint8(KillSwitch.Status.None));
    }

    function test_rotateToSuccessor() public {
        address[] memory none;
        uint256 succ = ks.register(vm.addr(0xA9), owner, none, 0, _consent(0xA9, owner));
        vm.prank(owner);
        ks.rotate(id, succ, keccak256("upgrade"));
        assertFalse(ks.isTrusted(id));
        assertTrue(ks.isTrusted(succ));
        assertEq(ks.getAgent(id).successorId, succ);
        vm.prank(owner);
        vm.expectRevert(KillSwitch.Terminal.selector);
        ks.rotate(id, succ, bytes32(0));
    }

    function test_rotateRequiresLiveSuccessor() public {
        vm.prank(owner);
        vm.expectRevert(KillSwitch.BadSuccessor.selector);
        ks.rotate(id, id, bytes32(0));
        vm.prank(owner);
        vm.expectRevert(KillSwitch.BadSuccessor.selector);
        ks.rotate(id, 999, bytes32(0));
    }

    function test_guardianPauseThreshold() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert(KillSwitch.NotGuardian.selector);
        ks.guardianPause(id);

        vm.prank(g1);
        ks.guardianPause(id);
        assertTrue(ks.isTrusted(id), "one vote is not enough");
        vm.prank(g1);
        ks.guardianPause(id); // double vote ignored
        assertTrue(ks.isTrusted(id));
        vm.prank(g2);
        ks.guardianPause(id);
        assertFalse(ks.isTrusted(id), "threshold reached");
    }

    function test_guardianCannotRevokeBeforeDelay() public {
        vm.prank(g1);
        ks.guardianPause(id);
        vm.prank(g2);
        ks.guardianPause(id);
        vm.prank(g3);
        vm.expectRevert(KillSwitch.TooEarly.selector);
        ks.guardianEscalate(id);
        vm.warp(block.timestamp + 3 days);
        vm.prank(g3);
        ks.guardianEscalate(id);
        assertEq(uint8(ks.getAgent(id).status), uint8(KillSwitch.Status.Revoked));
    }

    function test_ownerResumeResetsGuardianClock() public {
        vm.prank(g1);
        ks.guardianPause(id);
        vm.prank(g2);
        ks.guardianPause(id);
        vm.prank(owner);
        ks.setStatus(id, KillSwitch.Status.Active, bytes32(0));
        vm.warp(block.timestamp + 10 days);
        vm.prank(g1);
        vm.expectRevert(KillSwitch.BadTransition.selector);
        ks.guardianEscalate(id);
    }

    function test_revocationKeyChangeIsTimeLocked() public {
        address newOwner = address(0xC0DE);
        vm.prank(owner);
        ks.proposeRevocationKey(id, newOwner);
        vm.prank(owner);
        vm.expectRevert(KillSwitch.TooEarly.selector);
        ks.applyRevocationKey(id);
        vm.warp(block.timestamp + 1 days);
        vm.prank(owner);
        ks.applyRevocationKey(id);
        vm.prank(newOwner);
        ks.setStatus(id, KillSwitch.Status.Paused, bytes32(0));
        vm.prank(owner);
        vm.expectRevert(KillSwitch.NotRevocationKey.selector);
        ks.setStatus(id, KillSwitch.Status.Active, bytes32(0));
    }

    function test_isContradicted() public {
        uint64 t0 = uint64(block.timestamp);
        vm.warp(t0 + 10);
        vm.prank(owner);
        ks.setStatus(id, KillSwitch.Status.Revoked, bytes32(0));
        // true claim: active at t0
        assertFalse(ks.isContradicted(bytes32(0), abi.encode(id, KillSwitch.Status.Active, t0)));
        // false claim: active at t0+10 (it was revoked)
        assertTrue(ks.isContradicted(bytes32(0), abi.encode(id, KillSwitch.Status.Active, t0 + 10)));
        // future claims cannot be judged
        assertFalse(ks.isContradicted(bytes32(0), abi.encode(id, KillSwitch.Status.Active, uint64(block.timestamp + 1))));
    }

    /// @dev Revoked is terminal under any sequence of owner actions.
    function testFuzz_revokedIsTerminal(uint8 next) public {
        vm.startPrank(owner);
        ks.setStatus(id, KillSwitch.Status.Revoked, bytes32(0));
        KillSwitch.Status s = KillSwitch.Status(bound(next, 0, 4));
        vm.expectRevert();
        ks.setStatus(id, s, bytes32(0));
        vm.stopPrank();
        assertFalse(ks.isTrusted(id));
    }

    // ---------- audit: registration keys ----------

    function test_registerRejectsZeroAndSelfKeys() public {
        address[] memory none;
        vm.expectRevert(KillSwitch.BadKeys.selector);
        ks.register(address(0), owner, none, 0, "");
        vm.expectRevert(KillSwitch.BadKeys.selector);
        ks.register(vm.addr(0xA2), address(0), none, 0, "");
        vm.expectRevert(KillSwitch.BadKeys.selector);
        ks.register(vm.addr(0xA2), vm.addr(0xA2), none, 0, "");
    }

    // ---------- audit: only a guardian pause escalates ----------

    function test_ownerPauseCannotBeEscalated() public {
        vm.prank(owner);
        ks.setStatus(id, KillSwitch.Status.Paused, keccak256("holiday"));
        vm.warp(block.timestamp + 3 days + 1);
        vm.prank(g1);
        vm.expectRevert(KillSwitch.BadTransition.selector);
        ks.guardianEscalate(id);
        assertEq(uint8(ks.getAgent(id).status), uint8(KillSwitch.Status.Paused));
    }

    function test_guardianPauseEscalatesAfterDelay() public {
        vm.prank(g1); ks.guardianPause(id);
        vm.prank(g2); ks.guardianPause(id);
        assertTrue(ks.guardianPaused(id));
        vm.warp(block.timestamp + 3 days);
        vm.prank(g3);
        ks.guardianEscalate(id);
        assertEq(uint8(ks.getAgent(id).status), uint8(KillSwitch.Status.Revoked));
    }

    function test_ownerResumeClearsGuardianPauseFlag() public {
        vm.prank(g1); ks.guardianPause(id);
        vm.prank(g2); ks.guardianPause(id);
        vm.prank(owner);
        ks.setStatus(id, KillSwitch.Status.Active, keccak256("false alarm"));
        vm.prank(owner);
        ks.setStatus(id, KillSwitch.Status.Paused, keccak256("my own pause"));
        assertFalse(ks.guardianPaused(id));
        vm.warp(block.timestamp + 3 days + 1);
        vm.prank(g1);
        vm.expectRevert(KillSwitch.BadTransition.selector);
        ks.guardianEscalate(id);
    }

    // ---------- audit: votes do not outlive a status change ----------

    function test_staleVoteDoesNotCount() public {
        vm.prank(g1); ks.guardianPause(id); // 1 of 2
        assertEq(ks.guardianVoteCount(id), 1);
        vm.prank(owner); ks.setStatus(id, KillSwitch.Status.Paused, keccak256("x"));
        vm.prank(owner); ks.setStatus(id, KillSwitch.Status.Active, keccak256("y"));
        assertEq(ks.guardianVoteCount(id), 0, "round closed by the owner's change");
        vm.prank(g2); ks.guardianPause(id); // must be 1 of 2 again, not 2 of 2
        assertEq(uint8(ks.getAgent(id).status), uint8(KillSwitch.Status.Active));
        vm.prank(g1); ks.guardianPause(id);
        assertEq(uint8(ks.getAgent(id).status), uint8(KillSwitch.Status.Paused));
    }

    // ---------- audit: a successor is the owner's own ----------

    function test_rotateRequiresOwnSuccessor() public {
        address[] memory none;
        address other = address(0xC0FFEE);
        vm.prank(other);
        uint256 theirs = ks.register(vm.addr(0xA9), other, none, 0, _consent(0xA9, other));
        vm.prank(owner);
        vm.expectRevert(KillSwitch.BadSuccessor.selector);
        ks.rotate(id, theirs, keccak256("r"));
        vm.prank(owner);
        uint256 mine = ks.register(vm.addr(0xA8), owner, none, 0, _consent(0xA8, owner));
        vm.prank(owner);
        ks.rotate(id, mine, keccak256("r"));
        assertEq(ks.getAgent(id).successorId, mine);
    }

    // ---------- audit: the agent key consents ----------

    function test_registerWithoutConsentReverts() public {
        address[] memory none;
        vm.expectRevert(KillSwitch.BadAgentSignature.selector);
        ks.register(vm.addr(0xA7), owner, none, 0, "");
        // a consent for a different cold key is not consent for this one
        bytes memory wrong = _consent(0xA7, address(0xC0FFEE));
        vm.expectRevert(KillSwitch.BadAgentSignature.selector);
        ks.register(vm.addr(0xA7), owner, none, 0, wrong);
    }

    function test_agentRegistersItselfWithoutSignature() public {
        address[] memory none;
        vm.prank(vm.addr(0xA7));
        uint256 n = ks.register(vm.addr(0xA7), owner, none, 0, "");
        assertEq(ks.getAgent(n).revocationKey, owner);
    }

    function test_consentIsBoundToChain() public {
        address[] memory none;
        bytes memory sig = _consent(0xA7, owner);
        vm.chainId(10143);
        vm.expectRevert(KillSwitch.BadAgentSignature.selector);
        ks.register(vm.addr(0xA7), owner, none, 0, sig);
    }
}
