// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Monad staking precompile at 0x1000. CALL only; views are declared nonpayable by the precompile.
/// @dev Signatures from docs.monad.xyz/reference/staking/api (selectors 0x2b6d639a, 0x757991a8).
interface IStaking {
    function getValidator(uint64 validatorId)
        external
        returns (
            address authAddress,
            uint64 flags,
            uint256 stake,
            uint256 accRewardPerToken,
            uint256 commission,
            uint256 unclaimedRewards,
            uint256 consensusStake,
            uint256 consensusCommission,
            uint256 snapshotStake,
            uint256 snapshotCommission,
            bytes memory secpPubkey,
            bytes memory blsPubkey
        );

    function getEpoch() external returns (uint64 epoch, bool inEpochDelayPeriod);
}

address constant STAKING_PRECOMPILE = address(0x1000);
