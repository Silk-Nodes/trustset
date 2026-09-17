// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {RefundRail} from "../src/RefundRail.sol";
import {MockUSD} from "../test/mocks/MockUSD.sol";

/// @notice Deploy the refund rail and a mock dollar on Monad testnet, then make two
///         real payments so the page has something true to show: one settled on a
///         payer-signed receipt, one left open with a ten second window so it can be
///         refunded from the shell right after. The mock dollar exists because the
///         testnet has no stable that a faucet hands out; the rail itself is token-agnostic.
contract Refunds is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PK");
        address me = vm.addr(pk);
        string memory d = vm.readFile("deployments/monad-testnet.json");

        vm.startBroadcast(pk);
        RefundRail rail = new RefundRail();
        MockUSD usd = new MockUSD();
        usd.mint(me, 1_000_000e6);
        usd.approve(address(rail), type(uint256).max);

        /* 1: paid, delivered, released by the payer. the service is a throwaway
           address standing in for the API that answered. */
        address svc = vm.addr(uint256(keccak256("trustset demo service")));
        uint256 a = rail.pay(svc, address(usd), 4000, 60, keccak256("GET /smart-money-flows"));
        rail.release(a, keccak256("200 OK 4.1kb 118ms"));
        /* 2: paid, never answered. ten seconds, then anyone can send it home. */
        uint256 b = rail.pay(svc, address(usd), 4000, 10, keccak256("GET /token-screener"));
        vm.stopBroadcast();

        string memory j = "testnet";
        vm.serializeUint(j, "chainId", vm.parseJsonUint(d, ".chainId"));
        vm.serializeAddress(j, "killSwitch", vm.parseJsonAddress(d, ".killSwitch"));
        vm.serializeAddress(j, "humanTouch", vm.parseJsonAddress(d, ".humanTouch"));
        vm.serializeAddress(j, "venue", vm.parseJsonAddress(d, ".venue"));
        vm.serializeAddress(j, "labels", vm.parseJsonAddress(d, ".labels"));
        vm.serializeAddress(j, "owner", vm.parseJsonAddress(d, ".owner"));
        vm.serializeUint(j, "agent1", 1);
        vm.serializeUint(j, "agent2", 2);
        vm.serializeUint(j, "agent3", 3);
        vm.serializeAddress(j, "refunds", address(rail));
        vm.serializeAddress(j, "mockUsd", address(usd));
        vm.serializeUint(j, "seedSettled", a);
        string memory out = vm.serializeUint(j, "seedOpen", b);
        vm.writeJson(out, "deployments/monad-testnet.json");
        console2.log("refunds", address(rail));
        console2.log("mockUsd", address(usd));
    }
}
