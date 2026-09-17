// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {KillSwitch} from "../src/KillSwitch.sol";
import {AgentLabels} from "../src/AgentLabels.sol";

/// @notice Deploy AgentLabels against the kill switch already on Monad testnet, then label
///         the three seeded agents so the console has names to read from chain on day one.
contract Labels is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PK");
        string memory d = vm.readFile("deployments/monad-testnet.json");
        KillSwitch ks = KillSwitch(vm.parseJsonAddress(d, ".killSwitch"));

        vm.startBroadcast(pk);
        AgentLabels labels = new AgentLabels(ks);
        labels.label(1, "Treasury sweeper", "Moves idle USDC from the hot wallet to the treasury");
        labels.label(2, "Research bot", "Reads on-chain data and writes reports, signs nothing of value");
        labels.label(3, "DCA runner", "Buys a fixed amount of MON every hour");
        labels.label(4, "Guarded bot", "Owned by the deployer, guarded by the tester. Vote to pause it.");
        labels.label(5, "Seven day key", "Registered with an end date. Trust ends on its own, with nobody sending anything.");
        labels.label(6, "Heartbeat bot", "Must say it is alive every hour. Silence ends its trust.");
        vm.stopBroadcast();

        /* rewrite the deployment file with the new address. */
        string memory j = "testnet";
        /* carried across, like the rail: the indexer needs to know where this
           deployment starts and the labels run must not drop it. */
        vm.serializeUint(j, "startBlock", vm.parseJsonUint(d, ".startBlock"));
        vm.serializeAddress(j, "refunds", vm.parseJsonAddress(d, ".refunds"));
        vm.serializeAddress(j, "mockUsd", vm.parseJsonAddress(d, ".mockUsd"));
        vm.serializeUint(j, "chainId", vm.parseJsonUint(d, ".chainId"));
        vm.serializeAddress(j, "killSwitch", address(ks));
        vm.serializeAddress(j, "humanTouch", vm.parseJsonAddress(d, ".humanTouch"));
        vm.serializeAddress(j, "venue", vm.parseJsonAddress(d, ".venue"));
        vm.serializeAddress(j, "owner", vm.parseJsonAddress(d, ".owner"));
        vm.serializeUint(j, "agent1", 1);
        vm.serializeUint(j, "agent2", 2);
        vm.serializeUint(j, "agent3", 3);
        string memory out = vm.serializeAddress(j, "labels", address(labels));
        vm.writeJson(out, "deployments/monad-testnet.json");
        console2.log("labels", address(labels));
    }
}
