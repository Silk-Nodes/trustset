// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IStaking, STAKING_PRECOMPILE} from "./interfaces/IStaking.sol";
import {IDutyVerifier} from "./interfaces/IDutyVerifier.sol";
import {BLS} from "./libraries/BLS.sol";

/// @title OperatorRegistry
/// @notice Validators in Monad's consensus set opt in as trust operators: they post a bond, register a BLS key,
///         declare duties, and heartbeat every epoch. Statements they sign can be verified in aggregate with one
///         pairing. A signed statement that a duty contract can prove false costs the operator its bond.
/// @dev Immutable, no admin. Duty verifiers are fixed at construction. Membership in the consensus set is read
///      from the staking precompile, never self reported.
contract OperatorRegistry {
    // ---------- types ----------

    uint8 public constant DUTY_REVOCATION_WITNESS = 1 << 0;
    uint8 public constant DUTY_RECOVERY_GUARDIAN = 1 << 1;
    uint8 public constant DUTY_ATTESTATION_SIGNER = 1 << 2;
    uint8 public constant DUTY_REFUND_RESOLVER = 1 << 3;

    struct Operator {
        uint64 validatorId;
        address authAddress;
        uint8 duties;
        uint64 registeredEpoch;
        uint64 lastHeartbeatEpoch;
        uint64 exitRequestedEpoch; // 0 when not exiting
        uint256 bond;
        bool slashed;
        bytes blsPubkey; // 128 byte uncompressed G1, precompile encoding
    }

    // ---------- storage ----------

    IStaking public immutable staking;
    uint256 public immutable minBond;
    uint64 public immutable exitDelayEpochs;
    /// @dev maximum number of epochs an operator may miss a heartbeat before duties suspend
    uint64 public immutable heartbeatGraceEpochs;

    uint256 public operatorCount;
    mapping(uint256 => Operator) private _operators; // operatorId => Operator, ids start at 1
    mapping(uint64 => uint256) public operatorIdByValidator;
    mapping(address => uint256) public operatorIdByAuth;
    /// @dev duty bit => verifier contract that can prove a signed statement false
    mapping(uint8 => IDutyVerifier) public dutyVerifier;
    /// @dev statementHash => already used to slash, so a statement can only be slashed once
    mapping(bytes32 => bool) public slashedStatement;

    // ---------- events ----------

    event OperatorRegistered(uint256 indexed operatorId, uint64 indexed validatorId, address indexed authAddress, uint8 duties, uint256 bond);
    event Heartbeat(uint256 indexed operatorId, uint64 epoch);
    event DutiesUpdated(uint256 indexed operatorId, uint8 duties);
    event BondIncreased(uint256 indexed operatorId, uint256 bond);
    event ExitRequested(uint256 indexed operatorId, uint64 epoch);
    event Exited(uint256 indexed operatorId, uint256 bondReturned);
    event Slashed(uint256 indexed operatorId, bytes32 indexed statementHash, address indexed challenger, uint256 bond);

    // ---------- errors ----------

    error NotValidatorAuth();
    error NotInConsensusSet();
    error AlreadyRegistered();
    error BondTooLow();
    error BadBlsKey();
    error NotOperator();
    error NotOperatorAuth();
    error NoDutyVerifier();
    error NotContradicted();
    error AlreadySlashed();
    error AlreadyExiting();
    error ExitNotReady();
    error NotExiting();
    error DutyNotHeld();

    constructor(address stakingPrecompile, uint256 minBond_, uint64 exitDelayEpochs_, uint64 heartbeatGraceEpochs_, uint8[] memory dutyBits, address[] memory verifiers) {
        require(dutyBits.length == verifiers.length, "verifier arity");
        staking = IStaking(stakingPrecompile == address(0) ? STAKING_PRECOMPILE : stakingPrecompile);
        minBond = minBond_;
        exitDelayEpochs = exitDelayEpochs_;
        heartbeatGraceEpochs = heartbeatGraceEpochs_;
        for (uint256 i = 0; i < dutyBits.length; i++) {
            dutyVerifier[dutyBits[i]] = IDutyVerifier(verifiers[i]);
        }
    }

    // ---------- registration ----------

    /// @notice Register the caller's validator as an operator. Caller must be the validator's auth address and the
    ///         validator must currently hold consensus stake. The BLS key registered here is a separate signing key,
    ///         never the consensus key.
    function register(uint64 validatorId, bytes calldata blsPubkey, uint8 duties) external payable returns (uint256 operatorId) {
        if (blsPubkey.length != BLS.G1_LEN) revert BadBlsKey();
        if (msg.value < minBond) revert BondTooLow();
        if (operatorIdByValidator[validatorId] != 0) revert AlreadyRegistered();

        (address authAddress,,,,,, uint256 consensusStake,,,,,) = staking.getValidator(validatorId);
        if (msg.sender != authAddress) revert NotValidatorAuth();
        if (consensusStake == 0) revert NotInConsensusSet();

        (uint64 epoch,) = staking.getEpoch();
        operatorId = ++operatorCount;
        Operator storage op = _operators[operatorId];
        op.validatorId = validatorId;
        op.authAddress = authAddress;
        op.duties = duties;
        op.registeredEpoch = epoch;
        op.lastHeartbeatEpoch = epoch;
        op.bond = msg.value;
        op.blsPubkey = blsPubkey;
        operatorIdByValidator[validatorId] = operatorId;
        operatorIdByAuth[authAddress] = operatorId;

        emit OperatorRegistered(operatorId, validatorId, authAddress, duties, msg.value);
    }

    function heartbeat() external {
        uint256 id = _requireAuth();
        (uint64 epoch,) = staking.getEpoch();
        _operators[id].lastHeartbeatEpoch = epoch;
        emit Heartbeat(id, epoch);
    }

    function setDuties(uint8 duties) external {
        uint256 id = _requireAuth();
        _operators[id].duties = duties;
        emit DutiesUpdated(id, duties);
    }

    function increaseBond() external payable {
        uint256 id = _requireAuth();
        _operators[id].bond += msg.value;
        emit BondIncreased(id, _operators[id].bond);
    }

    // ---------- exit ----------

    function requestExit() external {
        uint256 id = _requireAuth();
        Operator storage op = _operators[id];
        if (op.exitRequestedEpoch != 0) revert AlreadyExiting();
        (uint64 epoch,) = staking.getEpoch();
        op.exitRequestedEpoch = epoch;
        emit ExitRequested(id, epoch);
    }

    /// @notice After the exit delay the bond returns. The delay is the window in which a signed statement can still
    ///         be challenged.
    function finalizeExit() external {
        uint256 id = _requireAuth();
        Operator storage op = _operators[id];
        if (op.exitRequestedEpoch == 0) revert NotExiting();
        (uint64 epoch,) = staking.getEpoch();
        if (epoch < op.exitRequestedEpoch + exitDelayEpochs) revert ExitNotReady();
        uint256 bond = op.bond;
        op.bond = 0;
        op.duties = 0;
        delete operatorIdByValidator[op.validatorId];
        delete operatorIdByAuth[op.authAddress];
        emit Exited(id, bond);
        (bool ok,) = op.authAddress.call{value: bond}("");
        require(ok, "bond transfer");
    }

    // ---------- slashing ----------

    /// @notice Anyone can slash an operator by presenting a statement it signed for a duty, when that duty's verifier
    ///         proves the statement false against chain state. The challenger receives the bond.
    /// @param operatorId operator that signed
    /// @param duty the duty bit the statement was signed under
    /// @param statement duty specific encoded statement
    /// @param signature BLS signature over keccak256(abi.encode(address(this), operatorId, duty, statement))
    function slash(uint256 operatorId, uint8 duty, bytes calldata statement, bytes calldata signature) external {
        Operator storage op = _operators[operatorId];
        if (op.validatorId == 0) revert NotOperator();
        if (op.slashed) revert AlreadySlashed();
        IDutyVerifier verifier = dutyVerifier[duty];
        if (address(verifier) == address(0)) revert NoDutyVerifier();

        bytes32 statementHash = statementDigest(operatorId, duty, statement);
        if (slashedStatement[statementHash]) revert AlreadySlashed();
        require(BLS.verify(op.blsPubkey, abi.encodePacked(statementHash), signature), "bad signature");
        if (!verifier.isContradicted(statementHash, statement)) revert NotContradicted();

        slashedStatement[statementHash] = true;
        op.slashed = true;
        op.duties = 0;
        uint256 bond = op.bond;
        op.bond = 0;
        emit Slashed(operatorId, statementHash, msg.sender, bond);
        /* half to whoever proved it, half burned. paying the whole bond to the
           challenger let an operator sign a deliberately false statement, slash
           itself from a second address, and walk out with its bond at once,
           skipping the exit delay. now a slash always costs. */
        uint256 reward = bond / 2;
        (bool ok,) = msg.sender.call{value: reward}("");
        require(ok, "bond transfer");
        (ok,) = BURN.call{value: bond - reward}("");
        require(ok, "burn");
    }

    address constant BURN = 0x000000000000000000000000000000000000dEaD;

    /// @notice The digest operators sign. Domain separated by this contract's address.
    function statementDigest(uint256 operatorId, uint8 duty, bytes calldata statement) public view returns (bytes32) {
        return keccak256(abi.encode(address(this), operatorId, duty, keccak256(statement)));
    }

    // ---------- views ----------

    function getOperator(uint256 operatorId) external view returns (Operator memory) {
        return _operators[operatorId];
    }

    /// @notice An operator is active for a duty when it is registered, not slashed, not exiting, holds the duty,
    ///         heartbeat within grace, and its validator still has consensus stake right now.
    /// @dev Reads the staking precompile, so this is a CALL, not a staticcall.
    function isActiveFor(uint256 operatorId, uint8 duty) public returns (bool) {
        Operator storage op = _operators[operatorId];
        if (op.validatorId == 0 || op.slashed || op.exitRequestedEpoch != 0) return false;
        if (op.duties & duty == 0) return false;
        (uint64 epoch,) = staking.getEpoch();
        if (epoch > op.lastHeartbeatEpoch + heartbeatGraceEpochs) return false;
        (,,,,,, uint256 consensusStake,,,,,) = staking.getValidator(op.validatorId);
        return consensusStake > 0;
    }

    /// @notice Verify an aggregate signature by a set of operators (bitmap over operator ids, bit i = id i+1) on a
    ///         message for a duty. Returns how many signed and their total bond. Consumers choose their threshold.
    /// @dev Aggregates public keys with G1 additions and runs one pairing. Only active operators for the duty count;
    ///      a bitmap that names an inactive operator makes the whole verification fail, so signers must be current.
    function verifyAggregate(uint8 duty, bytes32 message, uint256 signerBitmap, bytes calldata signature)
        external
        returns (uint256 signers, uint256 totalBond)
    {
        bytes memory aggPk;
        uint256 count = operatorCount;
        for (uint256 i = 0; i < count && (signerBitmap >> i) != 0; i++) {
            if ((signerBitmap >> i) & 1 == 0) continue;
            uint256 id = i + 1;
            if (!isActiveFor(id, duty)) revert DutyNotHeld();
            Operator storage op = _operators[id];
            aggPk = signers == 0 ? op.blsPubkey : BLS.g1Add(aggPk, op.blsPubkey);
            signers++;
            totalBond += op.bond;
        }
        require(signers > 0, "no signers");
        bytes32 digest = keccak256(abi.encode(address(this), duty, message));
        require(BLS.verify(aggPk, abi.encodePacked(digest), signature), "bad aggregate signature");
    }

    // ---------- internal ----------

    function _requireAuth() internal view returns (uint256 id) {
        id = operatorIdByAuth[msg.sender];
        if (id == 0) revert NotOperatorAuth();
    }
}
