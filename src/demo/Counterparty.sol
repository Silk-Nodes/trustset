// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {KillSwitch} from "../KillSwitch.sol";

/// @notice Demo venue. Accepts a trade only from an agent the kill switch says is active right now.
contract Counterparty {
    KillSwitch public immutable killSwitch;
    uint256 public trades;

    event TradeAccepted(uint256 indexed agentId, uint256 n);

    error AgentNotTrusted(uint256 agentId);

    constructor(KillSwitch ks) {
        killSwitch = ks;
    }

    function trade(uint256 agentId) external {
        // a refused trade reverts, so nothing here persists; the revert reason is the record
        if (killSwitch.agentIdByKey(msg.sender) != agentId || !killSwitch.isTrusted(agentId)) {
            revert AgentNotTrusted(agentId);
        }
        trades++;
        emit TradeAccepted(agentId, trades);
    }
}
