// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {KillSwitch} from "../src/KillSwitch.sol";
import {SealedNotes} from "../src/SealedNotes.sol";

contract SealedNotesTest is Test {
    KillSwitch ks;
    SealedNotes notes;
    address owner = makeAddr("owner");
    address other = makeAddr("other");
    uint256 id;

    event Sealed(uint256 indexed agentId, address indexed by, SealedNotes.Kind kind, uint256 index);

    function _consent(uint256 pk, address cold) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s_) = vm.sign(pk, ks.registrationDigest(vm.addr(pk), cold));
        return abi.encodePacked(r, s_, v);
    }

    function setUp() public {
        ks = new KillSwitch(1 days, 3 days, 7 days);
        notes = new SealedNotes(ks);
        address[] memory none;
        vm.prank(owner);
        id = ks.register(vm.addr(0xA5), owner, none, 0, _consent(0xA5, owner));
    }

    function test_coldKeySealsAndReadsBack() public {
        vm.expectEmit(true, true, false, true);
        emit Sealed(id, owner, SealedNotes.Kind.Runbook, 0);
        vm.prank(owner);
        notes.seal(id, SealedNotes.Kind.Runbook, hex"7b7d");

        SealedNotes.Note[] memory n = notes.notesOf(id);
        assertEq(n.length, 1);
        assertEq(uint8(n[0].kind), uint8(SealedNotes.Kind.Runbook));
        assertEq(n[0].by, owner);
        assertEq(n[0].at, uint64(block.timestamp));
        assertEq(n[0].vault, hex"7b7d");
        assertEq(notes.countOf(id), 1);
    }

    function test_notesAccumulateInOrder() public {
        vm.startPrank(owner);
        notes.seal(id, SealedNotes.Kind.Runbook, hex"01");
        notes.seal(id, SealedNotes.Kind.StopReason, hex"02");
        notes.seal(id, SealedNotes.Kind.Runbook, hex"03");
        vm.stopPrank();
        SealedNotes.Note[] memory n = notes.notesOf(id);
        assertEq(n.length, 3);
        assertEq(n[1].vault, hex"02");
        assertEq(uint8(n[1].kind), uint8(SealedNotes.Kind.StopReason));
        assertEq(n[2].vault, hex"03");
    }

    function test_onlyTheColdKey() public {
        vm.prank(other);
        vm.expectRevert(SealedNotes.NotColdKey.selector);
        notes.seal(id, SealedNotes.Kind.Runbook, hex"01");
    }

    function test_unknownAgentRefused() public {
        vm.prank(owner);
        vm.expectRevert(SealedNotes.NotColdKey.selector);
        notes.seal(999, SealedNotes.Kind.Runbook, hex"01");
    }

    function test_emptyAndOversizeRefused() public {
        vm.startPrank(owner);
        vm.expectRevert(SealedNotes.EmptyVault.selector);
        notes.seal(id, SealedNotes.Kind.Runbook, "");
        bytes memory big = new bytes(notes.MAX_VAULT() + 1);
        vm.expectRevert(SealedNotes.TooLong.selector);
        notes.seal(id, SealedNotes.Kind.Runbook, big);
        vm.stopPrank();
    }

    function test_unreadAgentHasNoNotes() public view {
        assertEq(notes.notesOf(id).length, 0);
        assertEq(notes.countOf(id), 0);
    }
}
