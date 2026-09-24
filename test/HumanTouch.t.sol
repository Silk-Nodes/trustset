// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {HumanTouch} from "../src/HumanTouch.sol";
import {KillSwitch} from "../src/KillSwitch.sol";
import {WebAuthn} from "../src/libraries/WebAuthn.sol";

/// @dev deployment order fixed so the touch address, and therefore the challenge, is stable
///      across runs: vectors are signed offline for it. rerun the probe test if setUp changes.
contract HumanTouchTest is Test {
    KillSwitch ks;
    HumanTouch touch;
    address account = address(0xACC0);
    bytes32 action = keccak256("vote on proposal 7");

    /* the agent address's consent to its registration, signed with its own key */
    function _consent(uint256 agentPk, address cold) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s_) = vm.sign(agentPk, ks.registrationDigest(vm.addr(agentPk), cold));
        return abi.encodePacked(r, s_, v);
    }


    function setUp() public {
        ks = new KillSwitch(1 days, 3 days, 7 days);
        touch = new HumanTouch(ks);
    }

    function _vec(string memory key) internal view returns (WebAuthn.Assertion memory a, uint256 x, uint256 y, bytes32 rp) {
        string memory j = vm.readFile("test/vectors-webauthn.json");
        string memory p = string.concat(".", key);
        a.authenticatorData = vm.parseJsonBytes(j, string.concat(p, ".authenticatorData"));
        a.clientDataJSON = vm.parseJsonBytes(j, string.concat(p, ".clientDataJSON"));
        a.r = vm.parseJsonUint(j, string.concat(p, ".r"));
        a.s = vm.parseJsonUint(j, string.concat(p, ".s"));
        x = vm.parseJsonUint(j, string.concat(p, ".x"));
        y = vm.parseJsonUint(j, string.concat(p, ".y"));
        rp = vm.parseJsonBytes32(j, string.concat(p, ".rpIdHash"));
    }

    /// @dev EIP-7951 returns empty output for an invalid signature, the same as an absent
    ///      precompile, so the probe has to use a signature that is actually valid.
    function _p256Live() internal view returns (bool) {
        (WebAuthn.Assertion memory a, uint256 x, uint256 y,) = _vec("uv");
        bytes32 h = sha256(bytes.concat(a.authenticatorData, sha256(a.clientDataJSON)));
        (bool ok, bytes memory out) = address(0x0100).staticcall(abi.encode(h, a.r, a.s, x, y));
        return ok && out.length == 32 && abi.decode(out, (uint256)) == 1;
    }

    function test_probeChallenge() public view {
        console2.log("touch", address(touch));
        console2.logBytes32(touch.challengeFor(account, action));
    }

    function test_humanWithUv() public {
        if (!_p256Live()) vm.skip(true);
        (WebAuthn.Assertion memory a, uint256 x, uint256 y, bytes32 rp) = _vec("uv");
        vm.prank(account); touch.registerPasskey(x, y, rp);
        touch.attestHuman(account, action, a);
        assertTrue(touch.wasHuman(account, action));
        assertEq(touch.humanCount(account), 1);
        vm.expectRevert(HumanTouch.AlreadyAttested.selector);
        touch.attestHuman(account, action, a);
    }

    function test_presenceWithoutVerificationIsNotHuman() public {
        if (!_p256Live()) vm.skip(true);
        (WebAuthn.Assertion memory a, uint256 x, uint256 y, bytes32 rp) = _vec("noUv");
        vm.prank(account); touch.registerPasskey(x, y, rp);
        vm.expectRevert(HumanTouch.NotHuman.selector);
        touch.attestHuman(account, action, a);
    }

    function test_wrongChallengeFails() public {
        if (!_p256Live()) vm.skip(true);
        (WebAuthn.Assertion memory a, uint256 x, uint256 y, bytes32 rp) = _vec("uv");
        vm.prank(account); touch.registerPasskey(x, y, rp);
        vm.expectRevert(HumanTouch.NotHuman.selector);
        touch.attestHuman(account, keccak256("a different action"), a);
    }

    function test_wrongRpFails() public {
        if (!_p256Live()) vm.skip(true);
        (WebAuthn.Assertion memory a, uint256 x, uint256 y,) = _vec("uv");
        vm.prank(account); touch.registerPasskey(x, y, keccak256("other.example"));
        vm.expectRevert(HumanTouch.NotHuman.selector);
        touch.attestHuman(account, action, a);
    }

    function test_highSRejected() public {
        if (!_p256Live()) vm.skip(true);
        (WebAuthn.Assertion memory a, uint256 x, uint256 y, bytes32 rp) = _vec("uv");
        vm.prank(account); touch.registerPasskey(x, y, rp);
        a.s = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551 - a.s;
        vm.expectRevert(HumanTouch.NotHuman.selector);
        touch.attestHuman(account, action, a);
    }

    function test_noPasskeyReverts() public {
        (WebAuthn.Assertion memory a,,,) = _vec("uv");
        vm.expectRevert(HumanTouch.NoPasskey.selector);
        touch.attestHuman(account, action, a);
    }

    function test_agentAttest() public {
        address agentKey = vm.addr(0xA9);
        address[] memory none;
        ks.register(agentKey, address(0xB0B), none, 0, _consent(0xA9, address(0xB0B)));
        vm.prank(agentKey); touch.attestAgent(action);
        assertEq(uint8(touch.originOf(agentKey, action)), uint8(HumanTouch.Origin.Agent));
        vm.prank(address(0xDEAD));
        vm.expectRevert(HumanTouch.NotAgent.selector);
        touch.attestAgent(keccak256("other"));
        vm.prank(agentKey);
        vm.expectRevert(HumanTouch.AlreadyAttested.selector);
        touch.attestAgent(action);
    }

    /// @dev the harness the plan promised: malformed authenticator data must never read as human.
    function testFuzz_malformedAuthDataNeverHuman(bytes calldata junk, uint8 flags) public {
        if (!_p256Live()) vm.skip(true);
        (WebAuthn.Assertion memory a, uint256 x, uint256 y, bytes32 rp) = _vec("uv");
        vm.prank(account); touch.registerPasskey(x, y, rp);
        bytes memory ad = junk.length >= 37 ? bytes.concat(rp, bytes1(flags), junk[0:4], junk[4:]) : junk;
        a.authenticatorData = ad;
        vm.expectRevert(HumanTouch.NotHuman.selector);
        touch.attestHuman(account, action, a);
        assertFalse(touch.wasHuman(account, action));
    }

    /// @dev and a mutated clientDataJSON must never read as human either.
    function testFuzz_mutatedClientDataNeverHuman(uint256 pos, uint8 b) public {
        if (!_p256Live()) vm.skip(true);
        (WebAuthn.Assertion memory a, uint256 x, uint256 y, bytes32 rp) = _vec("uv");
        vm.prank(account); touch.registerPasskey(x, y, rp);
        pos = bound(pos, 0, a.clientDataJSON.length - 1);
        vm.assume(a.clientDataJSON[pos] != bytes1(b));
        a.clientDataJSON[pos] = bytes1(b);
        vm.expectRevert(HumanTouch.NotHuman.selector);
        touch.attestHuman(account, action, a);
    }

    /// an agent address cannot stamp another account's action as "agent" and block the human proof
    function test_agentCannotBlockAnotherAccountsAction() public {
        address agentKey = vm.addr(0xA9);
        address[] memory none;
        ks.register(agentKey, address(0xB0B), none, 0, _consent(0xA9, address(0xB0B)));
        vm.prank(agentKey); touch.attestAgent(action);
        assertEq(uint8(touch.originOf(agentKey, action)), uint8(HumanTouch.Origin.Agent));
        // the human's slot for the same action hash is untouched
        assertEq(uint8(touch.originOf(account, action)), uint8(HumanTouch.Origin.Unknown));
    }

    function test_challengeCarriesChainId() public {
        bytes32 here = touch.challengeFor(account, action);
        vm.chainId(10143);
        assertTrue(touch.challengeFor(account, action) != here);
    }
}
