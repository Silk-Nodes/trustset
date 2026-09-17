// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {RefundRail} from "../src/RefundRail.sol";
import {MockUSD} from "./mocks/MockUSD.sol";

/// @dev takes one percent on every transfer, the way some stables do
contract FeeUSD is MockUSD {
    function transferFrom(address from, address to, uint256 amount) external override returns (bool) {
        require(allowance[from][msg.sender] >= amount && balanceOf[from] >= amount, "no");
        allowance[from][msg.sender] -= amount; balanceOf[from] -= amount;
        balanceOf[to] += amount - amount / 100;
        return true;
    }
}

contract Reenterer {
    RefundRail rail;
    uint256 id;
    constructor(RefundRail r) { rail = r; }
    function pay() external payable { id = rail.pay{value: msg.value}(address(this), address(0), msg.value, 60, bytes32(0)); }
    function go() external { rail.release(id, bytes32(0)); }
    receive() external payable { rail.refund(id); } // tries to re-enter during the push
}

contract RefundRailTest is Test {
    RefundRail rail;
    MockUSD usd;
    uint256 payerPk = 0xA11CE;
    address payer;
    address service = makeAddr("service");
    address stranger = makeAddr("stranger");
    bytes32 req = keccak256("GET /smart-money-flows");
    bytes32 receipt = keccak256("200 OK, 4kb, 120ms");

    event Paid(uint256 indexed id, address indexed payer, address indexed service, address token, uint256 amount, uint64 deadline, bytes32 requestHash);
    event Settled(uint256 indexed id, bytes32 receiptHash);
    event Refunded(uint256 indexed id, address indexed to);

    function setUp() public {
        rail = new RefundRail();
        usd = new MockUSD();
        payer = vm.addr(payerPk);
        vm.deal(payer, 10 ether);
        usd.mint(payer, 1_000_000e6);
        vm.prank(payer);
        usd.approve(address(rail), type(uint256).max);
    }

    function _sign(uint256 id, bytes32 rh) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(payerPk, rail.receiptDigest(id, rh));
        return abi.encodePacked(r, s, v);
    }

    // ---------- pay ----------

    function test_payNative() public {
        vm.expectEmit(true, true, true, true);
        emit Paid(1, payer, service, address(0), 0.004 ether, uint64(block.timestamp) + 30, req);
        vm.prank(payer);
        uint256 id = rail.pay{value: 0.004 ether}(service, address(0), 0.004 ether, 30, req);
        assertEq(id, 1);
        assertEq(address(rail).balance, 0.004 ether);
        RefundRail.Payment memory p = rail.get(id);
        assertEq(uint8(p.state), uint8(RefundRail.State.Open));
        assertEq(p.payer, payer);
    }

    function test_payERC20() public {
        vm.prank(payer);
        uint256 id = rail.pay(service, address(usd), 4000, 30, req);
        assertEq(usd.balanceOf(address(rail)), 4000);
        assertEq(rail.get(id).token, address(usd));
    }

    function test_payRejectsWrongValue() public {
        vm.prank(payer);
        vm.expectRevert(RefundRail.WrongValue.selector);
        rail.pay{value: 1}(service, address(0), 2, 30, req);
        vm.prank(payer);
        vm.expectRevert(RefundRail.WrongValue.selector);
        rail.pay{value: 1}(service, address(usd), 1, 30, req);
    }

    function test_payRejectsBadWindow() public {
        vm.startPrank(payer);
        vm.expectRevert(RefundRail.BadWindow.selector);
        rail.pay{value: 1}(service, address(0), 1, 5, req);
        vm.expectRevert(RefundRail.BadWindow.selector);
        rail.pay{value: 1}(service, address(0), 1, 31 days, req);
        vm.stopPrank();
    }

    function test_payRejectsZero() public {
        vm.startPrank(payer);
        vm.expectRevert(RefundRail.ZeroAmount.selector);
        rail.pay(service, address(0), 0, 30, req);
        vm.expectRevert(RefundRail.ZeroService.selector);
        rail.pay{value: 1}(address(0), address(0), 1, 30, req);
        vm.stopPrank();
    }

    // ---------- settle ----------

    function test_payerReleases() public {
        vm.prank(payer);
        uint256 id = rail.pay{value: 1 ether}(service, address(0), 1 ether, 30, req);
        vm.expectEmit(true, false, false, true);
        emit Settled(id, receipt);
        vm.prank(payer);
        rail.release(id, receipt);
        assertEq(service.balance, 1 ether);
        assertEq(uint8(rail.get(id).state), uint8(RefundRail.State.Settled));
    }

    function test_strangerCannotRelease() public {
        vm.prank(payer);
        uint256 id = rail.pay{value: 1 ether}(service, address(0), 1 ether, 30, req);
        vm.prank(stranger);
        vm.expectRevert(RefundRail.NotPayer.selector);
        rail.release(id, receipt);
    }

    function test_serviceSettlesWithPayerSignature() public {
        vm.prank(payer);
        uint256 id = rail.pay(service, address(usd), 4000, 30, req);
        vm.prank(service);
        rail.settle(id, receipt, _sign(id, receipt));
        assertEq(usd.balanceOf(service), 4000);
    }

    function test_signatureBoundToPayment() public {
        vm.startPrank(payer);
        uint256 a = rail.pay{value: 1 ether}(service, address(0), 1 ether, 30, req);
        uint256 b = rail.pay{value: 1 ether}(service, address(0), 1 ether, 30, req);
        vm.stopPrank();
        bytes memory sigA = _sign(a, receipt);
        vm.prank(service);
        vm.expectRevert(RefundRail.BadSignature.selector);
        rail.settle(b, receipt, sigA);
    }

    function test_signatureBoundToReceipt() public {
        vm.prank(payer);
        uint256 id = rail.pay{value: 1 ether}(service, address(0), 1 ether, 30, req);
        bytes memory sig = _sign(id, receipt);
        vm.prank(service);
        vm.expectRevert(RefundRail.BadSignature.selector);
        rail.settle(id, keccak256("a different receipt"), sig);
    }

    function test_wrongSignerRejected() public {
        vm.prank(payer);
        uint256 id = rail.pay{value: 1 ether}(service, address(0), 1 ether, 30, req);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xB0B, rail.receiptDigest(id, receipt));
        vm.prank(service);
        vm.expectRevert(RefundRail.BadSignature.selector);
        rail.settle(id, receipt, abi.encodePacked(r, s, v));
    }

    function test_settleAfterDeadlineStillWorksIfNotRefunded() public {
        // the deadline opens refund; it does not close settlement. a late receipt
        // still pays the service as long as nobody has sent the money home yet.
        vm.prank(payer);
        uint256 id = rail.pay{value: 1 ether}(service, address(0), 1 ether, 30, req);
        vm.warp(block.timestamp + 31);
        vm.prank(service);
        rail.settle(id, receipt, _sign(id, receipt));
        assertEq(service.balance, 1 ether);
    }

    // ---------- refund ----------

    function test_refundBeforeDeadlineReverts() public {
        vm.prank(payer);
        uint256 id = rail.pay{value: 1 ether}(service, address(0), 1 ether, 30, req);
        vm.warp(block.timestamp + 29);
        vm.expectRevert(RefundRail.NotYet.selector);
        rail.refund(id);
        assertFalse(rail.refundable(id));
    }

    function test_anyoneRefundsAfterDeadline() public {
        vm.prank(payer);
        uint256 id = rail.pay{value: 1 ether}(service, address(0), 1 ether, 30, req);
        vm.warp(block.timestamp + 30);
        assertTrue(rail.refundable(id));
        uint256 before = payer.balance;
        vm.expectEmit(true, true, false, true);
        emit Refunded(id, payer);
        vm.prank(stranger);
        rail.refund(id);
        assertEq(payer.balance, before + 1 ether);
        assertEq(uint8(rail.get(id).state), uint8(RefundRail.State.Refunded));
    }

    function test_refundERC20() public {
        vm.prank(payer);
        uint256 id = rail.pay(service, address(usd), 4000, 30, req);
        vm.warp(block.timestamp + 30);
        rail.refund(id);
        assertEq(usd.balanceOf(payer), 1_000_000e6);
    }

    // ---------- one of three, forever ----------

    function test_cannotSettleTwice() public {
        vm.prank(payer);
        uint256 id = rail.pay{value: 1 ether}(service, address(0), 1 ether, 30, req);
        vm.prank(payer);
        rail.release(id, receipt);
        vm.prank(payer);
        vm.expectRevert(RefundRail.NotOpen.selector);
        rail.release(id, receipt);
        bytes memory sig = _sign(id, receipt);
        vm.prank(service);
        vm.expectRevert(RefundRail.NotOpen.selector);
        rail.settle(id, receipt, sig);
    }

    function test_cannotRefundSettled() public {
        vm.prank(payer);
        uint256 id = rail.pay{value: 1 ether}(service, address(0), 1 ether, 30, req);
        vm.prank(payer);
        rail.release(id, receipt);
        vm.warp(block.timestamp + 31);
        vm.expectRevert(RefundRail.NotOpen.selector);
        rail.refund(id);
    }

    function test_cannotSettleRefunded() public {
        vm.prank(payer);
        uint256 id = rail.pay{value: 1 ether}(service, address(0), 1 ether, 30, req);
        vm.warp(block.timestamp + 31);
        rail.refund(id);
        bytes memory sig = _sign(id, receipt);
        vm.prank(service);
        vm.expectRevert(RefundRail.NotOpen.selector);
        rail.settle(id, receipt, sig);
    }

    function test_unknownIdNotOpen() public {
        vm.expectRevert(RefundRail.NotOpen.selector);
        rail.refund(999);
    }

    function test_reentrancyBlocked() public {
        Reenterer r = new Reenterer(rail);
        vm.deal(address(r), 1 ether);
        r.pay{value: 1 ether}();
        // the push to the service (r itself) re-enters refund, which must fail and
        // therefore fail the whole release.
        vm.expectRevert(RefundRail.TransferFailed.selector);
        r.go();
    }

    // ---------- fuzz ----------

    function testFuzz_moneyIsConserved(uint96 amount, uint64 window, bool settleIt) public {
        amount = uint96(bound(amount, 1, 5 ether));
        window = uint64(bound(window, 10, 30 days));
        vm.prank(payer);
        uint256 id = rail.pay{value: amount}(service, address(0), amount, window, req);
        uint256 pBefore = payer.balance;
        uint256 sBefore = service.balance;
        if (settleIt) {
            vm.prank(service);
            rail.settle(id, receipt, _sign(id, receipt));
            assertEq(service.balance, sBefore + amount);
            assertEq(payer.balance, pBefore);
        } else {
            vm.warp(block.timestamp + window);
            rail.refund(id);
            assertEq(payer.balance, pBefore + amount);
            assertEq(service.balance, sBefore);
        }
        assertEq(address(rail).balance, 0);
    }

    // ---------- audit: what arrived is what is held ----------

    function test_feeOnTransferTokenHoldsWhatArrived() public {
        FeeUSD fee = new FeeUSD();
        fee.mint(payer, 10_000);
        vm.startPrank(payer);
        fee.approve(address(rail), type(uint256).max);
        uint256 id = rail.pay(service, address(fee), 1000, 30, req);
        vm.stopPrank();
        assertEq(rail.get(id).amount, 990, "held the 990 that arrived, not the 1000 asked");
        vm.warp(block.timestamp + 30);
        rail.refund(id); // must not revert: the rail only pays out what it holds
        assertEq(fee.balanceOf(address(rail)), 0);
    }
}
