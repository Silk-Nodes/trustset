// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {KillSwitch} from "../src/KillSwitch.sol";
import {AgentLabels} from "../src/AgentLabels.sol";
import {Counterparty} from "../src/demo/Counterparty.sol";

/// @notice Ten real agents on the deployed switch, one per state, so the
///         explorer shows the product working instead of invented rows.
///
/// @dev    This does NOT deploy anything. It reads the addresses already in
///         deployments/monad-testnet.json and registers against them, so it can
///         be run again later without moving the switch out from under the
///         indexer, the sdk, or anybody's bookmark.
///
///         Every agent here is owned by the deployer, which the explorer prints
///         in its owner column. Ten agents sharing one cold key reads as one
///         operator's fleet, which is what it is. Nothing about this is meant
///         to look like adoption.
///
///         The order matters and is the whole reason this is one script. An
///         agent has to be trusted to trade, so every trade and beat happens
///         BEFORE the limits, pauses and stops that end those agents. Reverse
///         it and half the activity reverts.
///
///         Two of the ten cannot be created outright, because the contract
///         refuses to register an agent that is already out of time: setLimits
///         rejects an expiry in the past, exactly as register does. So they are
///         given a sixty second clock and left to run out on their own, which
///         is the honest way round and also the thing the limits layer is for.
contract Populate is Script {
    struct Spec {
        string key;      // the label its private key is derived from
        string name;     // what the console calls it, empty for the unnamed one
        string purpose;
        uint8 guardians; // how many guardians, 0 for none
        uint64 expires;  // seconds from now, 0 for none
        uint64 window;   // heartbeat window in seconds, 0 for none
        uint8 trades;    // how many trades to send while it is still trusted
        uint8 beats;     // how many heartbeats to send
    }

    KillSwitch ks;
    AgentLabels labels;
    Counterparty venue;
    address cold;
    uint256 coldPk;

    /* gas for an agent's own transactions. it signs its own trades and beats,
       so it needs to be able to pay for them; the switch never holds a key. */
    uint256 constant FUND = 0.02 ether;
    /* short enough that the two time based states settle while somebody is
       still looking at the page, long enough that the activity below lands
       first. */
    uint64 constant SHORT = 90;

    function run() external {
        coldPk = vm.envUint("DEPLOYER_PK");
        cold = vm.addr(coldPk);
        string memory dep = vm.readFile("deployments/monad-testnet.json");
        ks = KillSwitch(vm.parseJsonAddress(dep, ".killSwitch"));
        labels = AgentLabels(vm.parseJsonAddress(dep, ".labels"));
        venue = Counterparty(vm.parseJsonAddress(dep, ".venue"));
        require(vm.parseJsonAddress(dep, ".owner") == cold, "DEPLOYER_PK is not the cold key in deployments");

        Spec[10] memory specs = [
            Spec("ts:usd-market-maker", "usd-market-maker", "Quotes both sides of the USDC book", 3, 30 days, 1 hours, 6, 2),
            Spec("ts:eth-basis", "eth-basis", "Carries the perp basis on ETH", 0, 0, 0, 4, 0),
            Spec("ts:payments-relay", "payments-relay", "Pays per call through the refund rail", 3, 60 days, 1 days, 2, 3),
            Spec("ts:index-rebalancer", "index-rebalancer", "Holds the index to its weights", 3, SHORT, 0, 3, 0),
            Spec("ts:bridge-watcher", "bridge-watcher", "Watches the bridge for stuck messages", 0, 0, SHORT, 2, 1),
            Spec("ts:treasury-ops", "treasury-ops", "Moves the treasury between vaults", 3, 21 days, 0, 3, 0),
            Spec("ts:collateral-bot", "collateral-bot", "Tops up collateral before liquidation", 1, 0, 0, 2, 0),
            Spec("ts:nft-sweeper", "nft-sweeper", "Swept floors until it was stopped", 3, 0, 0, 4, 0),
            Spec("ts:legacy-mm", "legacy-mm", "The market maker usd-market-maker replaced", 0, 0, 0, 2, 0),
            Spec("ts:unnamed", "", "", 0, 0, 0, 0, 0)
        ];

        uint256[10] memory ids;

        // ---------- register, name, and give each one gas ----------
        for (uint256 i = 0; i < specs.length; i++) {
            ids[i] = _register(specs[i]);
            console2.log("registered", specs[i].name, ids[i]);
        }

        // ---------- everything they do, while they are all still trusted ----------
        for (uint256 i = 0; i < specs.length; i++) {
            /* a resumed run finds some of these already stopped or lapsed, and
               the venue refuses a trade from an agent the switch does not
               trust. that refusal is the product working; it is not something
               to send on purpose. */
            if (!ks.isTrusted(ids[i])) continue;
            uint256 pk = _pk(specs[i].key);
            for (uint8 t = 0; t < specs[i].trades; t++) {
                vm.broadcast(pk);
                venue.trade(ids[i]);
            }
            for (uint8 b = 0; b < specs[i].beats; b++) {
                vm.broadcast(pk);
                ks.beat(ids[i]);
            }
        }

        // ---------- and only now, the things that end them ----------
        /* every one of these is skipped when it has already been applied, so
           the script can be run twice without reverting on the second pass. */

        /* the two clocks. set last so the trades above were not refused. */
        if (_status(ids[3]) == KillSwitch.Status.Active && ks.getAgent(ids[3]).expiresAt > uint64(block.timestamp) + SHORT) {
            vm.broadcast(coldPk);
            ks.setLimits(ids[3], uint64(block.timestamp) + SHORT, 0); // runs out on its own
        }
        if (_status(ids[4]) == KillSwitch.Status.Active && ks.getAgent(ids[4]).heartbeatWindow != SHORT) {
            vm.broadcast(coldPk);
            ks.setLimits(ids[4], 0, SHORT);                           // goes quiet on its own
        }

        /* paused by its own cold key: reversible, and the console says so */
        if (_status(ids[5]) == KillSwitch.Status.Active) {
            vm.broadcast(coldPk);
            ks.setStatus(ids[5], KillSwitch.Status.Paused, keccak256("scheduled maintenance"));
        }

        /* paused by a guardian instead, which is a different thing: the cold
           key can undo it and the guardian cannot. threshold one, so a single
           vote carries. the guardian needs gas of its own to vote. */
        if (_status(ids[6]) == KillSwitch.Status.Active) {
            address g1 = vm.addr(_pk("ts:guardian-1"));
            if (g1.balance < FUND / 2) {
                vm.broadcast(coldPk);
                (bool ok,) = g1.call{value: FUND}("");
                require(ok, "funding the guardian failed");
            }
            vm.broadcast(_pk("ts:guardian-1"));
            ks.guardianPause(ids[6]);
        }

        /* stopped for good. terminal, and every app that checks refuses it
           from the next block. */
        if (_status(ids[7]) == KillSwitch.Status.Active) {
            vm.broadcast(coldPk);
            ks.setStatus(ids[7], KillSwitch.Status.Revoked, keccak256("key rotation policy"));
        }

        /* retired in favour of the first one, so trust moves rather than dies */
        if (_status(ids[8]) == KillSwitch.Status.Active) {
            vm.broadcast(coldPk);
            ks.rotate(ids[8], ids[0], keccak256("replaced by usd-market-maker"));
        }

        console2.log("done. two of these settle on their own within", SHORT, "seconds");
    }

    /// @dev registers one agent, labels it, and funds its key so it can act.
    ///      re-runnable: an agent key already in the registry is reused rather
    ///      than registered again, which would revert with AgentKeyInUse and
    ///      take the rest of the run down with it. the first attempt at this
    ///      script died a third of the way through, and a populate script that
    ///      cannot be resumed is a populate script you get one try at.
    function _register(Spec memory s) internal returns (uint256 id) {
        uint256 pk = _pk(s.key);
        address key = vm.addr(pk);

        id = ks.agentIdByKey(key);
        if (id == 0) {
            address[] memory g = new address[](s.guardians);
            for (uint8 i = 0; i < s.guardians; i++) g[i] = vm.addr(_pk(string.concat("ts:guardian-", vm.toString(uint256(i + 1)))));

            /* the agent consents to its own registration. without this signature
               whoever learned an agent's address first could register it under
               their own cold key and lock the real owner out. */
            (uint8 v, bytes32 r, bytes32 ss) = vm.sign(pk, ks.registrationDigest(key, cold));
            bytes memory sig = abi.encodePacked(r, ss, v);
            uint8 threshold = s.guardians == 0 ? 0 : (s.guardians > 1 ? 2 : 1);

            vm.broadcast(coldPk);
            id = s.expires == 0 && s.window == 0
                ? ks.register(key, cold, g, threshold, sig)
                : ks.registerWithLimits(key, cold, g, threshold, sig,
                    s.expires == 0 ? 0 : uint64(block.timestamp) + s.expires, s.window);
        }

        if (bytes(s.name).length > 0 && bytes(labels.labelOf(id).name).length == 0) {
            vm.broadcast(coldPk);
            labels.label(id, s.name, s.purpose);
        }

        /* gas, only for the ones that are going to spend it, and only if they
           do not already have some.

           this is a call and not `transfer`, which is what broke the first
           run. `transfer` caps its inner call at the 2300 gas stipend, so
           forge sized the whole transaction at 21000 + 2300 + a little and
           monad, which charges the entire gas limit, took the lot and returned
           a failed receipt. a plain call lets forge estimate it properly. */
        if ((s.trades > 0 || s.beats > 0) && key.balance < FUND / 2) {
            vm.broadcast(coldPk);
            (bool ok,) = key.call{value: FUND}("");
            require(ok, "funding the agent key failed");
        }
    }

    function _status(uint256 id) internal view returns (KillSwitch.Status) {
        return ks.getAgent(id).status;
    }

    /// @dev a key derived from its own name, so it is reproducible from this
    ///      file alone and nothing secret is stored anywhere. testnet only.
    function _pk(string memory label_) internal pure returns (uint256) {
        return uint256(keccak256(bytes(label_)));
    }
}
