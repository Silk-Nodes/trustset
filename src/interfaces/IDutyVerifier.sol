// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice A duty contract that can tell whether a statement an operator signed contradicts chain state.
/// @dev statementHash is duty specific. The verifier returns true only when it can prove the statement false.
interface IDutyVerifier {
    function isContradicted(bytes32 statementHash, bytes calldata statement) external view returns (bool);
}
