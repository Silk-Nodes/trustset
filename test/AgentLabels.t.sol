// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {KillSwitch} from "../src/KillSwitch.sol";
import {AgentLabels} from "../src/AgentLabels.sol";

contract AgentLabelsTest is Test {
    KillSwitch ks;
    AgentLabels labels;
    address owner = makeAddr("owner");
    address other = makeAddr("other");
    uint256 agentPk = 0xA5;
    address agentKey = vm.addr(0xA5);
    uint256 id;

    /* the agent address's consent to its registration, signed with its own key */
    function _consent(uint256 agentPk, address cold) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s_) = vm.sign(agentPk, ks.registrationDigest(vm.addr(agentPk), cold));
        return abi.encodePacked(r, s_, v);
    }

    event Labelled(uint256 indexed agentId, address indexed by, string name, string purpose);

    function setUp() public {
        ks = new KillSwitch(1 days, 3 days, 7 days);
        labels = new AgentLabels(ks);
        address[] memory none;
        vm.prank(owner);
        id = ks.register(agentKey, owner, none, 0, _consent(agentPk, owner));
    }

    function test_coldKeyCanLabel() public {
        vm.expectEmit(true, true, false, true);
        emit Labelled(id, owner, "Treasury sweeper", "Moves idle USDC to the treasury");
        vm.prank(owner);
        labels.label(id, "Treasury sweeper", "Moves idle USDC to the treasury");

        AgentLabels.Label memory l = labels.labelOf(id);
        assertEq(l.name, "Treasury sweeper");
        assertEq(l.purpose, "Moves idle USDC to the treasury");
        assertEq(l.by, owner);
        assertEq(l.at, uint64(block.timestamp));
    }

    function test_unlabelledReadsEmpty() public view {
        AgentLabels.Label memory l = labels.labelOf(id);
        assertEq(bytes(l.name).length, 0);
        assertEq(l.by, address(0));
        assertEq(l.at, 0);
    }

    function test_labelsOfManyInOrder() public {
        address[] memory none;
        vm.startPrank(owner);
        uint256 id2 = ks.register(vm.addr(0xA6), owner, none, 0, _consent(0xA6, owner));
        labels.label(id, "one", "");
        labels.label(id2, "two", "second");
        vm.stopPrank();

        uint256[] memory ids = new uint256[](3);
        ids[0] = id2; ids[1] = 999; ids[2] = id;
        AgentLabels.Label[] memory out = labels.labelsOf(ids);
        assertEq(out.length, 3);
        assertEq(out[0].name, "two");
        assertEq(out[0].purpose, "second");
        assertEq(bytes(out[1].name).length, 0);
        assertEq(out[2].name, "one");
    }

    function test_purposeMayBeEmpty() public {
        vm.prank(owner);
        labels.label(id, "Quote bot", "");
    }

    function test_relabelReplaces() public {
        vm.startPrank(owner);
        labels.label(id, "First", "had a purpose");
        vm.expectEmit(true, true, false, true);
        emit Labelled(id, owner, "Second", "");
        labels.label(id, "Second", "");
        vm.stopPrank();
        AgentLabels.Label memory l = labels.labelOf(id);
        assertEq(l.name, "Second");
        assertEq(bytes(l.purpose).length, 0, "purpose is replaced, not merged");
    }

    function test_agentKeyCannotLabelItself() public {
        vm.prank(agentKey);
        vm.expectRevert(AgentLabels.NotColdKey.selector);
        labels.label(id, "I am fine", "");
    }

    function test_strangerCannotLabel() public {
        vm.prank(other);
        vm.expectRevert(AgentLabels.NotColdKey.selector);
        labels.label(id, "x", "");
    }

    function test_unregisteredIdHasNoColdKey() public {
        // getAgent on an unknown id returns the zero struct; zero is nobody's sender
        vm.prank(owner);
        vm.expectRevert(AgentLabels.NotColdKey.selector);
        labels.label(999, "x", "");
    }

    function test_emptyNameRejected() public {
        vm.prank(owner);
        vm.expectRevert(AgentLabels.EmptyName.selector);
        labels.label(id, "", "has a purpose");
    }

    function test_nameTooLongRejected() public {
        string memory long = "0123456789012345678901234567890123456789X"; // 41 bytes
        vm.prank(owner);
        vm.expectRevert(AgentLabels.TooLong.selector);
        labels.label(id, long, "");
    }

    function test_purposeTooLongRejected() public {
        bytes memory b = new bytes(201);
        for (uint256 i = 0; i < 201; i++) b[i] = "a";
        vm.prank(owner);
        vm.expectRevert(AgentLabels.TooLong.selector);
        labels.label(id, "ok", string(b));
    }

    function test_exactLimitsAccepted() public {
        string memory name40 = "0123456789012345678901234567890123456789";
        bytes memory b = new bytes(200);
        for (uint256 i = 0; i < 200; i++) b[i] = "a";
        vm.prank(owner);
        labels.label(id, name40, string(b));
    }

    /// The owner can change. After a time-locked change lands, the old owner
    /// loses the label as well, and the new one gains it. A label follows control.
    function test_labelFollowsColdKeyChange() public {
        address newCold = makeAddr("newCold");
        vm.prank(owner);
        ks.proposeRevocationKey(id, newCold);
        vm.warp(block.timestamp + 1 days + 1);
        // the outgoing owner applies its own replacement
        vm.prank(owner);
        ks.applyRevocationKey(id);

        vm.prank(owner);
        vm.expectRevert(AgentLabels.NotColdKey.selector);
        labels.label(id, "old owner", "");

        vm.prank(newCold);
        labels.label(id, "new owner", "");
    }

    /// A stopped agent can still be labelled. The label is for people reading a list,
    /// and a revoked agent is exactly the one somebody wants to recognise.
    function test_revokedAgentStillLabellable() public {
        vm.startPrank(owner);
        ks.setStatus(id, KillSwitch.Status.Revoked, keccak256("stop"));
        labels.label(id, "Stopped bot", "Was trading on the venue");
        vm.stopPrank();
    }

    function testFuzz_onlyColdKey(address caller) public {
        vm.assume(caller != owner);
        vm.prank(caller);
        vm.expectRevert(AgentLabels.NotColdKey.selector);
        labels.label(id, "x", "");
    }
}
