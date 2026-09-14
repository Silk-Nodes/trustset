// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @dev Local stand-in for the staking precompile at 0x1000. Only the two views the registry uses.
contract MockStaking {
    struct V {
        address auth;
        uint256 consensusStake;
        bytes bls;
    }

    mapping(uint64 => V) public vals;
    uint64 public epoch = 100;
    bool public inDelay;

    function setValidator(uint64 id, address auth, uint256 consensusStake) external {
        vals[id] = V(auth, consensusStake, hex"");
    }

    function setEpoch(uint64 e, bool delay) external {
        epoch = e;
        inDelay = delay;
    }

    function getValidator(uint64 validatorId)
        external
        view
        returns (address, uint64, uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256, bytes memory, bytes memory)
    {
        V storage v = vals[validatorId];
        return (v.auth, 0, v.consensusStake, 0, 0, 0, v.consensusStake, 0, v.consensusStake, 0, hex"", v.bls);
    }

    function getEpoch() external view returns (uint64, bool) {
        return (epoch, inDelay);
    }
}
