// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {KillSwitch} from "../src/KillSwitch.sol";
import {HumanTouch} from "../src/HumanTouch.sol";
import {Counterparty} from "../src/demo/Counterparty.sol";

/// @notice Monad testnet deploy. The product only: the switch, the human proof
///         and one counterparty that reads the switch inside its own call.
///         The operator registry is deliberately not here, it is not the product.
///         Three agents are registered so the console has something to show.
contract Testnet is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PK");
        address owner = vm.addr(pk);

        vm.startBroadcast(pk);
        /* one day to change the cold key. the guardian delays are ten minutes
           here, not the days mainnet would use, so both escape hatches can be
           seen to fire on a testnet inside one sitting: escalating a pause to a
           stop, and replacing a cold key its owner lost. */
        KillSwitch ks = new KillSwitch(1 days, 10 minutes, 10 minutes);
        HumanTouch touch = new HumanTouch(ks);
        Counterparty venue = new Counterparty(ks);

        address[] memory guardians = new address[](0);
        /* real keys, derived from a label, so an agent key is something that can
           actually sign later rather than an address nobody holds. each one
           signs its own consent, as any agent registered here must. */
        uint256 a1 = _reg(ks, uint256(keccak256("trustset agent 1")), owner, guardians, 0);
        uint256 a2 = _reg(ks, uint256(keccak256("trustset agent 2")), owner, guardians, 0);
        uint256 a3 = _reg(ks, uint256(keccak256("trustset agent 3")), owner, guardians, 0);
        /* a fourth, guarded by the wallet that has been testing this, so the
           guardian path has something real to act on from day one. */
        address[] memory g = new address[](1);
        g[0] = 0x424210aE65A3Cd5542d0C796c6A0D5368bF94B0f;
        _reg(ks, uint256(keccak256("trustset agent guarded")), owner, g, 1);
        /* one that runs out on its own, and one that has to keep saying it is alive.
           both are the point of the limits: nobody has to send anything for trust
           to end. seven days and one hour, so a reader sees a real countdown. */
        _limited(ks, uint256(keccak256("trustset agent expiring")), owner, uint64(block.timestamp + 7 days), 0);
        _limited(ks, uint256(keccak256("trustset agent heartbeat")), owner, 0, 1 hours);
        vm.stopBroadcast();

        /* the refund rail and its mock dollar do not read the switch, so they survive
           a redeploy of it. carry their addresses across rather than dropping them. */
        string memory prev = vm.readFile("deployments/monad-testnet.json");
        string memory j = "testnet";
        vm.serializeAddress(j, "refunds", vm.parseJsonAddress(prev, ".refunds"));
        vm.serializeAddress(j, "mockUsd", vm.parseJsonAddress(prev, ".mockUsd"));
        /* the block this deployment starts at, so the indexer never has to be
           told where to begin walking the logs. */
        vm.serializeUint(j, "startBlock", block.number);
        vm.serializeUint(j, "chainId", block.chainid);
        vm.serializeAddress(j, "killSwitch", address(ks));
        vm.serializeAddress(j, "humanTouch", address(touch));
        vm.serializeAddress(j, "venue", address(venue));
        vm.serializeAddress(j, "owner", owner);
        vm.serializeUint(j, "agent1", a1);
        vm.serializeUint(j, "agent2", a2);
        string memory out = vm.serializeUint(j, "agent3", a3);
        vm.writeJson(out, "deployments/monad-testnet.json");
        console2.log("killSwitch", address(ks));
        console2.log("humanTouch", address(touch));
        console2.log("venue", address(venue));
    }

    function _limited(KillSwitch ks, uint256 pk, address cold, uint64 expiresAt, uint64 window) internal returns (uint256) {
        (uint8 v, bytes32 r, bytes32 s_) = vm.sign(pk, ks.registrationDigest(vm.addr(pk), cold));
        return ks.registerWithLimits(vm.addr(pk), cold, new address[](0), 0, abi.encodePacked(r, s_, v), expiresAt, window);
    }

    function _reg(KillSwitch ks, uint256 pk, address cold, address[] memory guardians, uint8 threshold) internal returns (uint256) {
        (uint8 v, bytes32 r, bytes32 s_) = vm.sign(pk, ks.registrationDigest(vm.addr(pk), cold));
        return ks.register(vm.addr(pk), cold, guardians, threshold, abi.encodePacked(r, s_, v));
    }
}
