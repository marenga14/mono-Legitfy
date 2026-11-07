// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Test} from "forge-std/Test.sol";
import {EntryPoint} from "account-abstraction/core/EntryPoint.sol";
import {IEntryPoint} from "account-abstraction/interfaces/IEntryPoint.sol";
import {PackedUserOperation} from "account-abstraction/interfaces/PackedUserOperation.sol";
import {SimpleAccount} from "account-abstraction/samples/SimpleAccount.sol";
import {SimpleAccountFactory} from "account-abstraction/samples/SimpleAccountFactory.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {LegitifyPaymaster} from "../src/LegitifyPaymaster.sol";
import {LegitifyRegistry as R} from "../src/LegitifyRegistry.sol";

/// Full ERC-4337 path with the same contract types BOT Chain runs: a zero-balance operator
/// issues a credential, with account deployment and gas paid by the Legitify paymaster.
contract SponsorshipTest is Test {
    EntryPoint entryPoint;
    SimpleAccountFactory factory;
    LegitifyPaymaster paymaster;
    R registry;

    uint256 signerKey = 0xA11CE;
    uint256 ownerKey = 0xB0B;
    uint256 attackerKey = 0xBAD;
    address payable bundler = payable(makeAddr("bundler"));
    address adminA = makeAddr("adminA");

    bytes32 constant ID = keccak256("id");
    bytes32 constant FILE = keccak256("file");

    function setUp() public {
        vm.warp(1_800_000_000);
        entryPoint = new EntryPoint();
        factory = new SimpleAccountFactory(IEntryPoint(address(entryPoint)));
        paymaster = new LegitifyPaymaster(IEntryPoint(address(entryPoint)), vm.addr(signerKey));
        paymaster.deposit{value: 1 ether}();
        registry = new R(address(this));
        registry.registerInstitution("University A", adminA);
    }

    function _userOp(address owner, bytes memory callData)
        internal
        view
        returns (PackedUserOperation memory op, address sender)
    {
        sender = factory.getAddress(owner, 0);
        bytes memory initCode;
        if (sender.code.length == 0) {
            initCode = abi.encodePacked(address(factory), abi.encodeCall(factory.createAccount, (owner, 0)));
        }
        op = PackedUserOperation({
            sender: sender,
            nonce: entryPoint.getNonce(sender, 0),
            initCode: initCode,
            callData: callData,
            accountGasLimits: bytes32((uint256(600_000) << 128) | 300_000),
            preVerificationGas: 60_000,
            gasFees: bytes32((uint256(20 gwei) << 128) | 20 gwei),
            paymasterAndData: "",
            signature: ""
        });
    }

    function _sponsorAndSign(PackedUserOperation memory op, uint256 sponsorKey, uint256 accountKey, uint48 validUntil)
        internal
        view
    {
        uint48 validAfter = 0;
        bytes memory header = abi.encodePacked(address(paymaster), uint128(200_000), uint128(50_000));
        op.paymasterAndData = abi.encodePacked(header, abi.encode(validUntil, validAfter), new bytes(65));
        bytes32 hash = MessageHashUtils.toEthSignedMessageHash(paymaster.getHash(op, validUntil, validAfter));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(sponsorKey, hash);
        op.paymasterAndData = abi.encodePacked(header, abi.encode(validUntil, validAfter), r, s, v);

        bytes32 opHash = MessageHashUtils.toEthSignedMessageHash(entryPoint.getUserOpHash(op));
        (v, r, s) = vm.sign(accountKey, opHash);
        op.signature = abi.encodePacked(r, s, v);
    }

    function _issueCall() internal view returns (bytes memory) {
        bytes memory inner = abi.encodeCall(R.issue, (ID, FILE));
        return abi.encodeCall(SimpleAccount.execute, (address(registry), 0, inner));
    }

    function _send(PackedUserOperation memory op) internal {
        PackedUserOperation[] memory ops = new PackedUserOperation[](1);
        ops[0] = op;
        vm.prank(bundler, bundler);
        entryPoint.handleOps(ops, bundler);
    }

    function test_zeroBalanceOperatorIssuesWithSponsoredGas() public {
        address owner = vm.addr(ownerKey);
        (PackedUserOperation memory op, address sender) = _userOp(owner, _issueCall());
        assertEq(sender.code.length, 0, "address is known before deployment");

        vm.prank(adminA);
        registry.addOperator(sender);

        uint256 depositBefore = paymaster.getDeposit();
        _sponsorAndSign(op, signerKey, ownerKey, uint48(block.timestamp + 300));
        vm.recordLogs();
        _send(op);

        assertGt(sender.code.length, 0, "account deployed by first op");
        assertEq(sender.balance, 0, "operator paid nothing");
        assertLt(paymaster.getDeposit(), depositBefore, "paymaster paid");
        assertEq(uint8(registry.verifyByHash(FILE).status), uint8(R.CredentialStatus.Authentic));
        assertEq(registry.verifyById(ID).credential.issuer, sender);

        emit log_named_uint("first-op cost (wei)", depositBefore - paymaster.getDeposit());
    }

    function test_rejectsOpNotSignedBySponsor() public {
        address owner = vm.addr(ownerKey);
        (PackedUserOperation memory op, address sender) = _userOp(owner, _issueCall());
        vm.prank(adminA);
        registry.addOperator(sender);
        _sponsorAndSign(op, attackerKey, ownerKey, uint48(block.timestamp + 300));

        vm.expectRevert(abi.encodeWithSelector(IEntryPoint.FailedOp.selector, 0, "AA34 signature error"));
        this.sendExternal(op);
    }

    function test_rejectsExpiredSponsorship() public {
        address owner = vm.addr(ownerKey);
        (PackedUserOperation memory op, address sender) = _userOp(owner, _issueCall());
        vm.prank(adminA);
        registry.addOperator(sender);
        _sponsorAndSign(op, signerKey, ownerKey, uint48(block.timestamp + 300));
        vm.warp(block.timestamp + 301);

        vm.expectRevert(abi.encodeWithSelector(IEntryPoint.FailedOp.selector, 0, "AA32 paymaster expired or not due"));
        this.sendExternal(op);
    }

    function test_rejectsCallDataSwappedAfterSponsorship() public {
        address owner = vm.addr(ownerKey);
        (PackedUserOperation memory op, address sender) = _userOp(owner, _issueCall());
        vm.prank(adminA);
        registry.addOperator(sender);
        _sponsorAndSign(op, signerKey, ownerKey, uint48(block.timestamp + 300));
        op.callData = abi.encodeCall(SimpleAccount.execute, (address(0xdead), 0, ""));
        bytes32 opHash = MessageHashUtils.toEthSignedMessageHash(entryPoint.getUserOpHash(op));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerKey, opHash);
        op.signature = abi.encodePacked(r, s, v);

        vm.expectRevert(abi.encodeWithSelector(IEntryPoint.FailedOp.selector, 0, "AA34 signature error"));
        this.sendExternal(op);
    }

    function test_nonMemberAccountStillCannotIssueEvenIfSponsored() public {
        address owner = vm.addr(ownerKey);
        (PackedUserOperation memory op,) = _userOp(owner, _issueCall());
        _sponsorAndSign(op, signerKey, ownerKey, uint48(block.timestamp + 300));
        _send(op);
        assertEq(uint8(registry.verifyByHash(FILE).status), uint8(R.CredentialStatus.NotFound));
    }

    function test_ownerCanWithdrawDeposit() public {
        address payable sink = payable(makeAddr("sink"));
        paymaster.withdrawTo(sink, 1 ether);
        assertEq(sink.balance, 1 ether);
    }

    function test_strangerCannotWithdrawDeposit() public {
        vm.prank(makeAddr("stranger"));
        vm.expectRevert();
        paymaster.withdrawTo(payable(address(1)), 1 ether);
    }

    function sendExternal(PackedUserOperation memory op) external {
        _send(op);
    }
}
