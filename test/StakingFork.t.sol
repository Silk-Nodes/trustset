// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {IStaking, STAKING_PRECOMPILE} from "../src/interfaces/IStaking.sol";
import {OperatorRegistry} from "../src/OperatorRegistry.sol";
import {KillSwitch} from "../src/KillSwitch.sol";

/// @notice Runs only with --fork-url against Monad. Proves the IStaking interface decodes the real precompile and
///         that the registry accepts a real validator's auth address (impersonated) and rejects a stranger.
contract StakingForkTest is Test {
    function setUp() public {
        if (block.chainid != 143) vm.skip(true);
    }

    function test_realPrecompileDecodes() public {
        IStaking s = IStaking(STAKING_PRECOMPILE);
        (uint64 epoch, bool delay) = s.getEpoch();
        console2.log("epoch", epoch, "inDelay", delay);
        assertGt(epoch, 0);
        (address auth,, uint256 stake,,,, uint256 cStake,,,,, bytes memory bls) = s.getValidator(1);
        console2.log("validator 1 auth", auth);
        console2.log("stake", stake / 1e18, "consensusStake", cStake / 1e18);
        console2.log("bls key bytes", bls.length);
        assertTrue(auth != address(0));
    }

    function test_registerAgainstRealValidator() public {
        IStaking s = IStaking(STAKING_PRECOMPILE);
        // find a validator that holds consensus stake right now
        uint64 vid;
        uint64 vid2;
        address auth;
        for (uint64 i = 1; i <= 60 && vid2 == 0; i++) {
            (address a,,,,,, uint256 cStake,,,,,) = s.getValidator(i);
            if (cStake == 0) continue;
            if (vid == 0) { vid = i; auth = a; } else { vid2 = i; }
        }
        require(vid != 0 && vid2 != 0, "need two active validators in first 60 ids");
        console2.log("using validator", vid, "auth", auth);
        KillSwitch ks = new KillSwitch(1 days, 3 days, 7 days);
        uint8[] memory d = new uint8[](1);
        d[0] = 1;
        address[] memory v = new address[](1);
        v[0] = address(ks);
        OperatorRegistry reg = new OperatorRegistry(address(0), 1 ether, 2, 1, d, v);
        vm.deal(auth, 5 ether);
        vm.prank(auth);
        uint256 id = reg.register{value: 1 ether}(vid, new bytes(128), 1);
        assertTrue(reg.isActiveFor(id, 1));
        vm.deal(address(0xBAD), 5 ether);
        vm.prank(address(0xBAD));
        vm.expectRevert(OperatorRegistry.NotValidatorAuth.selector);
        reg.register{value: 1 ether}(vid2, new bytes(128), 1);
    }
}
