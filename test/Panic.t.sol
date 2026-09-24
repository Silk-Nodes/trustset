// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {KillSwitch} from "../src/KillSwitch.sol";
import {WebAuthn} from "../src/libraries/WebAuthn.sol";

/// The panic button: pausing an agent with a passkey, no wallet in the room.
/// @dev deployment order is fixed so the switch's address, and therefore the challenge, is stable
///      across runs. the vectors are signed offline for it; rerun test_probeChallenge and the
///      generator if setUp changes.
contract PanicTest is Test {
    KillSwitch ks;
    uint256 agentPk = 0xA1;
    address agentKey = vm.addr(0xA1);
    address owner = address(0xB0B);
    address stranger = address(0xBAD);
    address relayer = address(0xFEE);
    uint256 id;

    function _consent(uint256 pk, address cold) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s_) = vm.sign(pk, ks.registrationDigest(vm.addr(pk), cold));
        return abi.encodePacked(r, s_, v);
    }

    function setUp() public {
        ks = new KillSwitch(1 days, 3 days, 7 days);
        vm.warp(1_000_000);
        address[] memory none;
        id = ks.register(agentKey, owner, none, 0, _consent(agentPk, owner));
    }

    function _vec(string memory key) internal view returns (WebAuthn.Assertion memory a, uint256 x, uint256 y, bytes32 rp) {
        string memory j = vm.readFile("test/vectors-panic.json");
        string memory p = string.concat(".", key);
        a.authenticatorData = vm.parseJsonBytes(j, string.concat(p, ".authenticatorData"));
        a.clientDataJSON = vm.parseJsonBytes(j, string.concat(p, ".clientDataJSON"));
        a.r = vm.parseJsonUint(j, string.concat(p, ".r"));
        a.s = vm.parseJsonUint(j, string.concat(p, ".s"));
        x = vm.parseJsonUint(j, string.concat(p, ".x"));
        y = vm.parseJsonUint(j, string.concat(p, ".y"));
        rp = vm.parseJsonBytes32(j, string.concat(p, ".rpIdHash"));
    }

    /// @dev the precompile answers empty for a bad signature exactly as an absent one does, so the
    ///      probe has to use a signature that really verifies.
    function _p256Live() internal view returns (bool) {
        (WebAuthn.Assertion memory a, uint256 x, uint256 y,) = _vec("uv");
        bytes32 h = sha256(bytes.concat(a.authenticatorData, sha256(a.clientDataJSON)));
        (bool ok, bytes memory out) = address(0x0100).staticcall(abi.encode(h, a.r, a.s, x, y));
        return ok && out.length == 32 && abi.decode(out, (uint256)) == 1;
    }

    function test_probeChallenge() public view {
        console2.log("killSwitch", address(ks));
        console2.logBytes32(ks.stopChallenge(id));
    }

    function _nominate(string memory vec) internal returns (WebAuthn.Assertion memory a) {
        uint256 x; uint256 y; bytes32 rp;
        (a, x, y, rp) = _vec(vec);
        vm.prank(owner);
        ks.setStopKey(id, x, y, rp);
    }

    function test_passkeyPauses() public {
        if (!_p256Live()) vm.skip(true);
        WebAuthn.Assertion memory a = _nominate("uv");
        assertTrue(ks.isTrusted(id));
        /* anybody may carry it: the assertion is the authority, not the sender */
        vm.prank(relayer);
        ks.pauseWithPasskey(id, a);
        assertFalse(ks.isTrusted(id));
        assertEq(uint8(ks.getAgent(id).status), uint8(KillSwitch.Status.Paused));
    }

    /// One touch, one pause. The nonce moves, so the same assertion is dead afterwards.
    function test_assertionCannotBeReplayed() public {
        if (!_p256Live()) vm.skip(true);
        WebAuthn.Assertion memory a = _nominate("uv");
        ks.pauseWithPasskey(id, a);
        vm.prank(owner);
        ks.setStatus(id, KillSwitch.Status.Active, keccak256("owner resumed"));
        vm.expectRevert(KillSwitch.BadAssertion.selector);
        ks.pauseWithPasskey(id, a);
        assertTrue(ks.isTrusted(id), "the replay did not land");
    }

    /// A touch is not enough. The device must have verified a person: biometric or PIN.
    function test_presenceWithoutVerificationIsRefused() public {
        if (!_p256Live()) vm.skip(true);
        WebAuthn.Assertion memory a = _nominate("noUv");
        vm.expectRevert(KillSwitch.BadAssertion.selector);
        ks.pauseWithPasskey(id, a);
    }

    function test_withoutAPasskeyThereIsNothingToUse() public {
        if (!_p256Live()) vm.skip(true);
        (WebAuthn.Assertion memory a,,,) = _vec("uv");
        vm.expectRevert(KillSwitch.NoStopKey.selector);
        ks.pauseWithPasskey(id, a);
    }

    function test_onlyColdKeyNominates() public {
        (, uint256 x, uint256 y, bytes32 rp) = _vec("uv");
        vm.prank(stranger);
        vm.expectRevert(KillSwitch.NotRevocationKey.selector);
        ks.setStopKey(id, x, y, rp);
        vm.prank(agentKey);
        vm.expectRevert(KillSwitch.NotRevocationKey.selector);
        ks.setStopKey(id, x, y, rp);
    }

    /// The whole point of keeping it to pause: a lost phone costs an interruption, not an agent.
    function test_passkeyCannotRevokeResumeOrTouchKeys() public {
        if (!_p256Live()) vm.skip(true);
        WebAuthn.Assertion memory a = _nominate("uv");
        ks.pauseWithPasskey(id, a);
        /* the agent is paused; the passkey has no way to do anything else. every other
           entry point still demands the owner, and a paused agent is not Active so a
           second pause is refused outright. */
        vm.expectRevert(KillSwitch.BadTransition.selector);
        ks.pauseWithPasskey(id, a);
        vm.prank(stranger);
        vm.expectRevert(KillSwitch.NotRevocationKey.selector);
        ks.setStatus(id, KillSwitch.Status.Revoked, keccak256("not yours"));
    }

    function test_ownerCanClearThePasskey() public {
        if (!_p256Live()) vm.skip(true);
        WebAuthn.Assertion memory a = _nominate("uv");
        vm.prank(owner);
        ks.setStopKey(id, 0, 0, bytes32(0));
        (, , , , bool set) = ks.stopKeyOf(id);
        assertFalse(set);
        vm.expectRevert(KillSwitch.NoStopKey.selector);
        ks.pauseWithPasskey(id, a);
    }

    /// Replacing the passkey must not rewind the count, or the old key's last assertion works again.
    function test_nonceSurvivesANewPasskey() public {
        if (!_p256Live()) vm.skip(true);
        WebAuthn.Assertion memory a = _nominate("uv");
        ks.pauseWithPasskey(id, a);
        (, , , uint64 n1,) = ks.stopKeyOf(id);
        (, uint256 x, uint256 y, bytes32 rp) = _vec("noUv");
        vm.prank(owner);
        ks.setStopKey(id, x, y, rp);
        (, , , uint64 n2,) = ks.stopKeyOf(id);
        assertEq(n2, n1, "the count carries over");
        assertGt(n2, 0);
    }

    function test_cannotNominateOnADeadAgent() public {
        (, uint256 x, uint256 y, bytes32 rp) = _vec("uv");
        vm.startPrank(owner);
        ks.setStatus(id, KillSwitch.Status.Revoked, keccak256("stop"));
        vm.expectRevert(KillSwitch.Terminal.selector);
        ks.setStopKey(id, x, y, rp);
        vm.stopPrank();
    }
}
