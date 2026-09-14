// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {OperatorRegistry} from "../src/OperatorRegistry.sol";
import {KillSwitch} from "../src/KillSwitch.sol";
import {Counterparty} from "../src/demo/Counterparty.sol";
import {MockStaking} from "../test/mocks/MockStaking.sol";

/// @notice Local demo on anvil. Anvil has no staking precompile, so a mock stands in at a normal address.
///         Accounts: 0 deployer and agent owner, 1 and 2 validator auth addresses, 3 agent key.
contract Demo is Script {
    function run() external {
        uint256 pk0 = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
        uint256 pk1 = 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d;
        uint256 pk2 = 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a;
        address owner = vm.addr(pk0);
        address auth1 = vm.addr(pk1);
        address auth2 = vm.addr(pk2);
        address agentKey = vm.addr(0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6);

        string memory vectors = vm.readFile("test/vectors-bls.json");
        bytes memory blsPk1 = vm.parseJsonBytes(vectors, ".pk1");
        bytes memory blsPk2 = vm.parseJsonBytes(vectors, ".pk2");

        vm.startBroadcast(pk0);
        MockStaking staking = new MockStaking();
        staking.setValidator(7, auth1, 12_000_000 ether);
        staking.setValidator(9, auth2, 8_000_000 ether);
        staking.setEpoch(2095, false);
        KillSwitch ks = new KillSwitch(1 days, 3 days);
        uint8[] memory duties = new uint8[](1);
        duties[0] = 1;
        address[] memory verifiers = new address[](1);
        verifiers[0] = address(ks);
        OperatorRegistry reg = new OperatorRegistry(address(staking), 1 ether, 2, 1, duties, verifiers);
        Counterparty venue = new Counterparty(ks);
        address[] memory guardians = new address[](2);
        guardians[0] = auth1;
        guardians[1] = auth2;
        uint256 agentId = ks.register(agentKey, owner, guardians, 2);
        vm.stopBroadcast();

        vm.startBroadcast(pk1);
        reg.register{value: 1 ether}(7, blsPk1, 1);
        vm.stopBroadcast();
        vm.startBroadcast(pk2);
        reg.register{value: 2 ether}(9, blsPk2, 1);
        vm.stopBroadcast();

        string memory j = "demo";
        vm.serializeAddress(j, "staking", address(staking));
        vm.serializeAddress(j, "killSwitch", address(ks));
        vm.serializeAddress(j, "registry", address(reg));
        vm.serializeAddress(j, "venue", address(venue));
        vm.serializeAddress(j, "owner", owner);
        vm.serializeAddress(j, "agentKey", agentKey);
        vm.serializeAddress(j, "auth1", auth1);
        vm.serializeAddress(j, "auth2", auth2);
        string memory out = vm.serializeUint(j, "agentId", agentId);
        vm.writeJson(out, "demo/addresses.json");
        console2.log("registry", address(reg));
        console2.log("killSwitch", address(ks));
        console2.log("venue", address(venue));
    }
}
