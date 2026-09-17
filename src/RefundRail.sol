// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title RefundRail
/// @notice Escrow for agent payments. Paid in, released on a receipt both sides signed,
///         refunded to the payer on a timeout. Nobody to ask, nothing to appeal.
///
/// The third of the three problems the product names: an agent that paid for something
/// and got nothing had no way to get the money back. x402 settles a payment the moment
/// the request is made, so a service that never answers keeps the money. This puts the
/// payment in a box first. The service is paid when it can show a receipt the payer
/// signed. If the window closes without one, anyone can send the money home.
///
/// Native MON when `token` is zero, any ERC20 otherwise. No owner, no fee, no upgrade.
/// A payment is exactly one of: open, settled, refunded. It cannot be both, and it cannot
/// move once it has been either.
contract RefundRail {
    enum State {
        None,
        Open,
        Settled,
        Refunded
    }

    struct Payment {
        address payer;
        address service;
        address token; // zero for native
        uint256 amount;
        uint64 deadline; // after this, refund is open to anyone
        bytes32 requestHash; // what was paid for, as the payer describes it
        State state;
    }

    /// @dev Bounds on the window so a payer cannot lock funds forever, and a service
    ///      cannot be given a window too short to answer in.
    uint64 public constant MIN_WINDOW = 10 seconds;
    uint64 public constant MAX_WINDOW = 30 days;

    uint256 public count;
    mapping(uint256 => Payment) private _payments;

    /// @dev A minimal reentrancy latch. The transfers here go to addresses the payer
    ///      chose, which may be contracts.
    uint256 private _lock = 1;

    event Paid(uint256 indexed id, address indexed payer, address indexed service, address token, uint256 amount, uint64 deadline, bytes32 requestHash);
    event Settled(uint256 indexed id, bytes32 receiptHash);
    event Refunded(uint256 indexed id, address indexed to);

    error BadWindow();
    error ZeroAmount();
    error ZeroService();
    error WrongValue();
    error NotOpen();
    error NotYet();
    error NotPayer();
    error BadSignature();
    error TransferFailed();
    error Reentered();

    modifier latch() {
        if (_lock != 1) revert Reentered();
        _lock = 2;
        _;
        _lock = 1;
    }

    // ---------- pay ----------

    /// @notice Put a payment in escrow for `service`. Send `amount` as value for native,
    ///         or approve this contract for `amount` of `token` first.
    /// @param requestHash Whatever identifies the request. Free-form; the rail does not read it.
    /// @param window Seconds the service has to produce a receipt before refund opens.
    function pay(address service, address token, uint256 amount, uint64 window, bytes32 requestHash)
        external
        payable
        latch
        returns (uint256 id)
    {
        if (service == address(0)) revert ZeroService();
        if (amount == 0) revert ZeroAmount();
        if (window < MIN_WINDOW || window > MAX_WINDOW) revert BadWindow();
        if (token == address(0)) {
            if (msg.value != amount) revert WrongValue();
        } else {
            if (msg.value != 0) revert WrongValue();
            /* what arrived is what is held. a token that takes a fee on transfer
               delivers less than `amount`, and holding the number asked for rather
               than the number received would make both settle and refund fail
               forever, with the money stuck in here. */
            amount = _pull(token, msg.sender, amount);
            if (amount == 0) revert ZeroAmount();
        }
        id = ++count;
        _payments[id] = Payment({
            payer: msg.sender,
            service: service,
            token: token,
            amount: amount,
            deadline: uint64(block.timestamp) + window,
            requestHash: requestHash,
            state: State.Open
        });
        emit Paid(id, msg.sender, service, token, amount, uint64(block.timestamp) + window, requestHash);
    }

    // ---------- settle ----------

    /// @notice The payer releases the money themselves. Their transaction is the receipt.
    function release(uint256 id, bytes32 receiptHash) external latch {
        Payment storage p = _payments[id];
        if (p.state != State.Open) revert NotOpen();
        if (p.payer != msg.sender) revert NotPayer();
        _settle(id, p, receiptHash);
    }

    /// @notice Anyone, usually the service, settles with a receipt the payer signed.
    ///         The signature is over the personal-sign digest of (rail, chain, id, receiptHash),
    ///         so a receipt for one payment cannot be replayed on another, here or elsewhere.
    function settle(uint256 id, bytes32 receiptHash, bytes calldata payerSig) external latch {
        Payment storage p = _payments[id];
        if (p.state != State.Open) revert NotOpen();
        if (_recover(receiptDigest(id, receiptHash), payerSig) != p.payer) revert BadSignature();
        _settle(id, p, receiptHash);
    }

    /// @notice What the payer signs to release a payment.
    function receiptDigest(uint256 id, bytes32 receiptHash) public view returns (bytes32) {
        bytes32 inner = keccak256(abi.encode(address(this), block.chainid, id, receiptHash));
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", inner));
    }

    // ---------- refund ----------

    /// @notice After the deadline, anyone may send an open payment back to the payer.
    ///         Mechanical: there is no party whose approval this waits on.
    function refund(uint256 id) external latch {
        Payment storage p = _payments[id];
        if (p.state != State.Open) revert NotOpen();
        if (block.timestamp < p.deadline) revert NotYet();
        p.state = State.Refunded;
        _push(p.token, p.payer, p.amount);
        emit Refunded(id, p.payer);
    }

    // ---------- read ----------

    function get(uint256 id) external view returns (Payment memory) {
        return _payments[id];
    }

    /// @notice Is refund open right now for this payment.
    function refundable(uint256 id) external view returns (bool) {
        Payment storage p = _payments[id];
        return p.state == State.Open && block.timestamp >= p.deadline;
    }

    // ---------- internals ----------

    function _settle(uint256 id, Payment storage p, bytes32 receiptHash) private {
        p.state = State.Settled;
        _push(p.token, p.service, p.amount);
        emit Settled(id, receiptHash);
    }

    function _pull(address token, address from, uint256 amount) private returns (uint256 received) {
        uint256 before = _balance(token);
        (bool ok, bytes memory ret) =
            token.call(abi.encodeWithSelector(0x23b872dd, from, address(this), amount)); // transferFrom
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
        received = _balance(token) - before;
    }

    function _balance(address token) private view returns (uint256) {
        (bool ok, bytes memory ret) = token.staticcall(abi.encodeWithSelector(0x70a08231, address(this))); // balanceOf
        if (!ok || ret.length < 32) revert TransferFailed();
        return abi.decode(ret, (uint256));
    }

    function _push(address token, address to, uint256 amount) private {
        if (token == address(0)) {
            (bool ok,) = to.call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            (bool ok, bytes memory ret) = token.call(abi.encodeWithSelector(0xa9059cbb, to, amount)); // transfer
            if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
        }
    }

    function _recover(bytes32 digest, bytes calldata sig) private pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 r = bytes32(sig[0:32]);
        bytes32 s = bytes32(sig[32:64]);
        uint8 v = uint8(sig[64]);
        if (v < 27) v += 27;
        // reject high-s so a signature has one canonical form
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) return address(0);
        return ecrecover(digest, v, r, s);
    }
}
