// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {OperatorRegistry} from "../src/OperatorRegistry.sol";
import {KillSwitch} from "../src/KillSwitch.sol";
import {MockStaking} from "./mocks/MockStaking.sol";

contract OperatorRegistryTest is Test {
    MockStaking staking;
    OperatorRegistry reg;
    KillSwitch ks;
    address auth1 = address(0x1001);
    address auth2 = address(0x1002);
    // real BLS keys generated with py_ecc (seeds operator-1, operator-2), precompile encoding
    bytes pk1 = hex"0000000000000000000000000000000013ac1a4c00e5b7e169ae03d67ded85b613c325b08b88a0c51efc36d6aeb6fe789ad7572b89faae43a988f636f33059e2000000000000000000000000000000001843ffe646781638da018573d9a41f6b15670a564565e96479365f52629367e71b680ccb8613953d880316ea33421ba7";
    bytes pk2 = hex"00000000000000000000000000000000189dafaea5e9a854c4b8d9c1c2e6fb520749b14011532adb9bee9b93911bb4bb18116d32ba687f775272a9820bd2bd0b00000000000000000000000000000000063dcba24dcd13ba15aa02f6b5a5246260e9db379c019d14098179df3ab70e4d8f43b1f97ada3293101a21c41039a928";
    bytes constant AGG_SIG_HELLO = hex"000000000000000000000000000000001819d0bd86219858e4803126366b3e6513f8241e3b2429368a08781f565b43cf8947329738cb9086228d8347ede461c7000000000000000000000000000000000e96f41459ea63a625b5fc8ffa4fe5bde517b43f735ab0d5fddbf5ebc7d6932ab72da2135613921cbffb73d8d5017ba4000000000000000000000000000000000472ad47f184b0d5a8947da647e56b7b7d15e32c1b3b449ee1eb0bd1b3d17238108c61101878acece41b015a6171c229000000000000000000000000000000000b9469f5cc856e6d4315c94511b7a38da08decc81612209fdb03ff1344a9b1f5a5314bedf00a48b57f4d5303d260423d";
    bytes constant SIG1_HELLO = hex"000000000000000000000000000000000db495a7a84516c3619710e692cfab3a98a42f1a7701aa81b0b4dd2df4987aaf2caa2eca9e3bfcc4a4f5843323400e6600000000000000000000000000000000155c2aa95a7b3c570c9e80d8b3780a681cd46b6ec56757495334976eab85b33accdb94537378655913a10ddd96e0daf0000000000000000000000000000000000a61bf1d9a44f94951a974fbfb1df099a56a9f6f42f3d31785e555e559f4b22907ac4008d8c0e668fb68b2d0788179800000000000000000000000000000000010b7fb2bb0fa3c625c06865f76d85a45d97eb9d80c8e03a5d3e236a58c511490b9b35d7fcc67ff6bd955b4f5d78ad064";
    bytes constant SIG1_STATEMENT = hex"0000000000000000000000000000000015d016fed2889c5b5fd27ccea9352d1ae24fcdb54d74429d4bbea00ef5065e12ac871d22f33b70f8cff165da07a7fb530000000000000000000000000000000009b2af87ef70be489cf3cd6c36a67d942253c1fcb3f3fcb343eadf370e11dab2a42d80f3cc59d8473f34eade4c0d3cc800000000000000000000000000000000183efc74ff6724f6c177a7c454858d5ea0a0816a7335520c7757ca66133fd71b854693559c549294203e7d0a14546fd400000000000000000000000000000000085b3c88ab1e0f1cddbd16129cf9c053a120b844dec09e9f69c8c510deec5c0f5882c63a39c9ddde49cbd4aa58f3a0c0";

    function setUp() public {
        staking = new MockStaking();
        ks = new KillSwitch(1 days, 3 days);
        uint8[] memory duties = new uint8[](1);
        duties[0] = 1; // DUTY_REVOCATION_WITNESS
        address[] memory verifiers = new address[](1);
        verifiers[0] = address(ks);
        reg = new OperatorRegistry(address(staking), 1 ether, 2, 1, duties, verifiers);
        staking.setValidator(7, auth1, 10_000_000 ether);
        staking.setValidator(8, auth2, 0); // registered validator, not in consensus set
        vm.deal(auth1, 10 ether);
        vm.deal(auth2, 10 ether);
    }

    function test_registerHappyPath() public {
        vm.prank(auth1);
        uint256 id = reg.register{value: 1 ether}(7, pk1, 1);
        assertEq(id, 1);
        OperatorRegistry.Operator memory op = reg.getOperator(id);
        assertEq(op.validatorId, 7);
        assertEq(op.authAddress, auth1);
        assertEq(op.bond, 1 ether);
        assertEq(op.lastHeartbeatEpoch, 100);
        assertTrue(reg.isActiveFor(id, 1));
        assertFalse(reg.isActiveFor(id, 2), "duty not held");
    }

    function test_registerRequiresAuthAddress() public {
        vm.prank(auth2);
        vm.expectRevert(OperatorRegistry.NotValidatorAuth.selector);
        reg.register{value: 1 ether}(7, pk1, 1);
    }

    function test_registerRequiresConsensusStake() public {
        vm.prank(auth2);
        vm.expectRevert(OperatorRegistry.NotInConsensusSet.selector);
        reg.register{value: 1 ether}(8, pk2, 1);
    }

    function test_registerRequiresBondAndKeyLength() public {
        vm.prank(auth1);
        vm.expectRevert(OperatorRegistry.BondTooLow.selector);
        reg.register{value: 0.5 ether}(7, pk1, 1);
        vm.prank(auth1);
        vm.expectRevert(OperatorRegistry.BadBlsKey.selector);
        reg.register{value: 1 ether}(7, new bytes(48), 1);
    }

    function test_duplicateValidatorReverts() public {
        vm.prank(auth1);
        reg.register{value: 1 ether}(7, pk1, 1);
        vm.prank(auth1);
        vm.expectRevert(OperatorRegistry.AlreadyRegistered.selector);
        reg.register{value: 1 ether}(7, pk1, 1);
    }

    function test_heartbeatGrace() public {
        vm.prank(auth1);
        uint256 id = reg.register{value: 1 ether}(7, pk1, 1);
        staking.setEpoch(101, false);
        assertTrue(reg.isActiveFor(id, 1), "within grace");
        staking.setEpoch(102, false);
        assertFalse(reg.isActiveFor(id, 1), "missed heartbeat");
        vm.prank(auth1);
        reg.heartbeat();
        assertTrue(reg.isActiveFor(id, 1));
    }

    function test_leavingConsensusSetDeactivates() public {
        vm.prank(auth1);
        uint256 id = reg.register{value: 1 ether}(7, pk1, 1);
        staking.setValidator(7, auth1, 0);
        assertFalse(reg.isActiveFor(id, 1));
    }

    function test_exitFlow() public {
        vm.prank(auth1);
        uint256 id = reg.register{value: 1 ether}(7, pk1, 1);
        vm.prank(auth1);
        reg.requestExit();
        assertFalse(reg.isActiveFor(id, 1), "exiting operators are inactive");
        vm.prank(auth1);
        vm.expectRevert(OperatorRegistry.ExitNotReady.selector);
        reg.finalizeExit();
        staking.setEpoch(102, false);
        uint256 before = auth1.balance;
        vm.prank(auth1);
        reg.finalizeExit();
        assertEq(auth1.balance, before + 1 ether);
        assertEq(reg.operatorIdByValidator(7), 0);
    }

    function test_onlyOperatorAuthCanHeartbeat() public {
        vm.prank(address(0xBEEF));
        vm.expectRevert(OperatorRegistry.NotOperatorAuth.selector);
        reg.heartbeat();
    }

    function test_slashRequiresVerifierAndOperator() public {
        vm.expectRevert(OperatorRegistry.NotOperator.selector);
        reg.slash(1, 1, hex"", new bytes(256));
        vm.prank(auth1);
        reg.register{value: 1 ether}(7, pk1, 1);
        vm.expectRevert(OperatorRegistry.NoDutyVerifier.selector);
        reg.slash(1, 2, hex"", new bytes(256));
    }

    function test_verifyAggregateRejectsInactiveSigner() public {
        vm.prank(auth1);
        reg.register{value: 1 ether}(7, pk1, 1);
        vm.expectRevert(OperatorRegistry.DutyNotHeld.selector);
        reg.verifyAggregate(2, bytes32(0), 1, new bytes(256));
    }

    function test_probeAddressesForOfflineSigning() public view {
        console2.log("registry", address(reg));
        console2.log("killswitch", address(ks));
        bytes32 digest = keccak256(abi.encode(address(reg), uint8(1), keccak256("hello")));
        console2.logBytes32(digest);
        bytes memory stmt = abi.encode(uint256(1), uint8(1), uint64(1_000_000));
        console2.logBytes32(reg.statementDigest(1, 1, stmt));
    }

    /// @dev End to end: two operators register, both sign the domain separated digest for duty 1 and message
    ///      keccak("hello") offline, the registry verifies the aggregate with one pairing and reports bond behind it.
    function test_verifyAggregateTwoOperators() public {
        staking.setValidator(9, auth2, 5_000_000 ether);
        vm.prank(auth1);
        reg.register{value: 1 ether}(7, pk1, 1);
        vm.prank(auth2);
        reg.register{value: 2 ether}(9, pk2, 1);
        (uint256 signers, uint256 bond) = reg.verifyAggregate(1, keccak256("hello"), 0x3, AGG_SIG_HELLO);
        assertEq(signers, 2);
        assertEq(bond, 3 ether);
        // a single operator's signature does not verify as the pair
        vm.expectRevert(bytes("bad aggregate signature"));
        reg.verifyAggregate(1, keccak256("hello"), 0x3, SIG1_HELLO);
        // but verifies alone
        (signers, bond) = reg.verifyAggregate(1, keccak256("hello"), 0x1, SIG1_HELLO);
        assertEq(signers, 1);
        assertEq(bond, 1 ether);
        // wrong duty in the domain fails
        vm.prank(auth1);
        reg.setDuties(3);
        vm.expectRevert(bytes("bad aggregate signature"));
        reg.verifyAggregate(2, keccak256("hello"), 0x1, SIG1_HELLO);
    }

    /// @dev Operator 1 signed "agent 1 was Active at t=1_000_000". The kill switch shows it revoked at that time.
    ///      Anyone can present the statement and take the bond. The same statement cannot be slashed twice.
    function test_slashOnContradictedStatement() public {
        vm.warp(1_000_000);
        address[] memory none;
        (uint8 v1, bytes32 r1, bytes32 s1) = vm.sign(0xA1, ks.registrationDigest(vm.addr(0xA1), address(0xB0B)));
        uint256 agentId = ks.register(vm.addr(0xA1), address(0xB0B), none, 0, abi.encodePacked(r1, s1, v1));
        vm.prank(address(0xB0B));
        ks.setStatus(agentId, KillSwitch.Status.Revoked, keccak256("compromised"));

        vm.prank(auth1);
        reg.register{value: 1 ether}(7, pk1, 1);
        bytes memory stmt = abi.encode(uint256(1), uint8(KillSwitch.Status.Active), uint64(1_000_000));

        address challenger = address(0xC4A11);
        vm.prank(challenger);
        reg.slash(1, 1, stmt, SIG1_STATEMENT);
        assertEq(challenger.balance, 0.5 ether, "challenger gets half");
        assertEq(address(0x000000000000000000000000000000000000dEaD).balance, 0.5 ether, "the other half is burned");
        assertTrue(reg.getOperator(1).slashed);
        assertFalse(reg.isActiveFor(1, 1));
        vm.prank(challenger);
        vm.expectRevert(OperatorRegistry.AlreadySlashed.selector);
        reg.slash(1, 1, stmt, SIG1_STATEMENT);
    }

    function test_slashRejectsTrueStatementAndBadSignature() public {
        vm.warp(1_000_000);
        address[] memory none;
        (uint8 v1, bytes32 r1, bytes32 s1) = vm.sign(0xA1, ks.registrationDigest(vm.addr(0xA1), address(0xB0B)));
        ks.register(vm.addr(0xA1), address(0xB0B), none, 0, abi.encodePacked(r1, s1, v1)); // stays Active, so the claim is true
        vm.prank(auth1);
        reg.register{value: 1 ether}(7, pk1, 1);
        bytes memory stmt = abi.encode(uint256(1), uint8(KillSwitch.Status.Active), uint64(1_000_000));
        vm.expectRevert(OperatorRegistry.NotContradicted.selector);
        reg.slash(1, 1, stmt, SIG1_STATEMENT);
        bytes memory other = abi.encode(uint256(1), uint8(KillSwitch.Status.Paused), uint64(1_000_000));
        vm.expectRevert(bytes("bad signature"));
        reg.slash(1, 1, other, SIG1_STATEMENT);
    }
}
