// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {KillSwitch} from "../src/KillSwitch.sol";
import {SealedNotes} from "../src/SealedNotes.sol";

/// @notice Deploy SealedNotes against the kill switch already on Monad testnet. Nothing
///         else moves: the switch, the labels and every agent stay where they are. The
///         address is added to the deployment file by hand afterwards, so this script can
///         never rewrite the rest of it.
contract Notes is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PK");
        KillSwitch ks = KillSwitch(vm.parseJsonAddress(vm.readFile("deployments/monad-testnet.json"), ".killSwitch"));
        vm.startBroadcast(pk);
        SealedNotes notes = new SealedNotes(ks);
        vm.stopBroadcast();
        console2.log("notes", address(notes));
    }
}
