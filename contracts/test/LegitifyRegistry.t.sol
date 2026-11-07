// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {LegitifyRegistry as R} from "../src/LegitifyRegistry.sol";

contract LegitifyRegistryTest is Test {
    R registry;
    address owner = makeAddr("owner");
    address adminA = makeAddr("adminA");
    address adminB = makeAddr("adminB");
    address opA = makeAddr("opA");
    address outsider = makeAddr("outsider");
    uint32 instA;
    uint32 instB;

    bytes32 constant ID = keccak256("id");
    bytes32 constant FILE = keccak256("file");

    function setUp() public {
        vm.warp(1_800_000_000);
        registry = new R(owner);
        vm.startPrank(owner);
        instA = registry.registerInstitution("University A", adminA);
        instB = registry.registerInstitution("University B", adminB);
        vm.stopPrank();
        vm.prank(adminA);
        registry.addOperator(opA);
    }

    function _issue() internal {
        vm.prank(opA);
        registry.issue(ID, FILE);
    }

    // ---- institutions and roles

    function test_onlyOwnerManagesInstitutions() public {
        vm.startPrank(outsider);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, outsider));
        registry.registerInstitution("Fake", outsider);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, outsider));
        registry.setInstitutionStatus(instA, R.InstitutionStatus.Suspended);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, outsider));
        registry.setInstitutionAdmin(instA, outsider);
    }

    function test_registerRejectsBadInput() public {
        vm.startPrank(owner);
        vm.expectRevert(R.ZeroAddress.selector);
        registry.registerInstitution("X", address(0));
        vm.expectRevert(R.EmptyName.selector);
        registry.registerInstitution("", outsider);
        vm.expectRevert(R.AlreadyMember.selector);
        registry.registerInstitution("X", opA);
    }

    function test_renounceDisabled() public {
        vm.prank(owner);
        vm.expectRevert(R.RenounceDisabled.selector);
        registry.renounceOwnership();
    }

    function test_ownershipIsTwoStep() public {
        vm.prank(owner);
        registry.transferOwnership(outsider);
        assertEq(registry.owner(), owner);
        vm.prank(outsider);
        registry.acceptOwnership();
        assertEq(registry.owner(), outsider);
    }

    /// Regression: the 2024 contract let addOperator overwrite any account's role.
    function test_addOperatorCannotOverwriteAnyRole() public {
        vm.startPrank(adminB);
        vm.expectRevert(R.AlreadyMember.selector);
        registry.addOperator(adminA);
        vm.expectRevert(R.AlreadyMember.selector);
        registry.addOperator(opA);
        vm.expectRevert(R.AlreadyMember.selector);
        registry.addOperator(adminB);
    }

    function test_onlyAdminManagesOperators() public {
        vm.prank(opA);
        vm.expectRevert(R.NotInstitutionAdmin.selector);
        registry.addOperator(outsider);
        vm.prank(outsider);
        vm.expectRevert(R.NotInstitutionAdmin.selector);
        registry.removeOperator(opA);
    }

    function test_adminCannotRemoveOtherInstitutionsOperator() public {
        vm.prank(adminB);
        vm.expectRevert(R.NotMember.selector);
        registry.removeOperator(opA);
    }

    function test_adminCannotBeRemoved() public {
        vm.prank(adminA);
        vm.expectRevert(R.CannotRemoveAdmin.selector);
        registry.removeOperator(adminA);
    }

    function test_removedOperatorLosesAccessButCredentialStays() public {
        _issue();
        vm.prank(adminA);
        registry.removeOperator(opA);
        vm.prank(opA);
        vm.expectRevert(R.NotActiveMember.selector);
        registry.issue(keccak256("2"), keccak256("f2"));
        assertEq(uint8(registry.verifyById(ID).status), uint8(R.CredentialStatus.Authentic));
    }

    function test_setInstitutionAdmin_recovery() public {
        address fresh = makeAddr("fresh");
        vm.prank(owner);
        registry.setInstitutionAdmin(instA, fresh);
        assertEq(registry.getInstitution(instA).admin, fresh);
        assertEq(uint8(registry.getMember(adminA).role), uint8(R.Role.None));
        assertEq(uint8(registry.getMember(fresh).role), uint8(R.Role.Admin));
    }

    function test_setInstitutionAdmin_promotesOwnOperatorOnly() public {
        vm.startPrank(owner);
        vm.expectRevert(R.AlreadyMember.selector);
        registry.setInstitutionAdmin(instB, opA);
        registry.setInstitutionAdmin(instA, opA);
        assertEq(uint8(registry.getMember(opA).role), uint8(R.Role.Admin));
    }

    // ---- issuing

    function test_issueAndVerifyBothPaths() public {
        vm.expectEmit(true, true, true, true);
        emit R.CredentialIssued(ID, instA, opA, FILE);
        _issue();

        R.Verification memory byId = registry.verifyById(ID);
        R.Verification memory byHash = registry.verifyByHash(FILE);
        assertEq(uint8(byId.status), uint8(R.CredentialStatus.Authentic));
        assertEq(byHash.credentialId, ID);
        assertEq(byId.institutionName, "University A");
        assertEq(byId.credential.issuer, opA);
        assertEq(byId.credential.issuedAt, block.timestamp);
        assertEq(registry.credentialCount(), 1);
    }

    /// Regression: the 2024 contract returned true for anything anyone had stored.
    function test_outsiderCannotIssue() public {
        vm.prank(outsider);
        vm.expectRevert(R.NotActiveMember.selector);
        registry.issue(ID, FILE);
        assertEq(uint8(registry.verifyByHash(FILE).status), uint8(R.CredentialStatus.NotFound));
    }

    function test_unknownReturnsNotFound() public view {
        R.Verification memory v = registry.verifyByHash(keccak256("nope"));
        assertEq(uint8(v.status), uint8(R.CredentialStatus.NotFound));
        assertEq(v.credentialId, bytes32(0));
    }

    function test_rejectsZeroAndDuplicates() public {
        vm.startPrank(opA);
        vm.expectRevert(R.InvalidCredential.selector);
        registry.issue(bytes32(0), FILE);
        vm.expectRevert(R.InvalidCredential.selector);
        registry.issue(ID, bytes32(0));
        registry.issue(ID, FILE);
        vm.expectRevert(R.DuplicateCredential.selector);
        registry.issue(ID, keccak256("other"));
        vm.expectRevert(R.DuplicateFile.selector);
        registry.issue(keccak256("other"), FILE);
    }

    /// Regression: storeDocument used to overwrite existing records.
    function test_otherInstitutionCannotOverwrite() public {
        _issue();
        vm.prank(adminB);
        vm.expectRevert(R.DuplicateCredential.selector);
        registry.issue(ID, keccak256("evil"));
        assertEq(registry.verifyById(ID).credential.fileHash, FILE);
    }

    function test_issueBatch() public {
        R.IssueParams[] memory items = new R.IssueParams[](3);
        for (uint256 i; i < 3; ++i) {
            items[i] = R.IssueParams(keccak256(abi.encode("id", i)), keccak256(abi.encode("f", i)));
        }
        vm.prank(opA);
        registry.issueBatch(items);
        assertEq(registry.credentialCount(), 3);
    }

    function test_issueBatchIsAllOrNothing() public {
        R.IssueParams[] memory items = new R.IssueParams[](2);
        items[0] = R.IssueParams(ID, FILE);
        items[1] = R.IssueParams(ID, keccak256("x"));
        vm.prank(opA);
        vm.expectRevert(R.DuplicateCredential.selector);
        registry.issueBatch(items);
        assertEq(registry.credentialCount(), 0);
    }

    function test_issueBatchSizeBounds() public {
        vm.startPrank(opA);
        vm.expectRevert(R.BatchSize.selector);
        registry.issueBatch(new R.IssueParams[](0));
        vm.expectRevert(R.BatchSize.selector);
        registry.issueBatch(new R.IssueParams[](201));
    }

    // ---- lifecycle

    function test_revoke() public {
        _issue();
        vm.warp(block.timestamp + 100);
        vm.prank(adminA);
        registry.revoke(ID, R.RevocationReason.Fraud);
        R.Verification memory v = registry.verifyByHash(FILE);
        assertEq(uint8(v.status), uint8(R.CredentialStatus.Revoked));
        assertEq(v.credential.revokedAt, block.timestamp);
        assertEq(uint8(v.credential.revocationReason), uint8(R.RevocationReason.Fraud));
    }

    function test_revokeGuards() public {
        vm.prank(adminA);
        vm.expectRevert(R.CredentialNotFound.selector);
        registry.revoke(ID, R.RevocationReason.Fraud);
        _issue();
        vm.prank(adminB);
        vm.expectRevert(R.WrongInstitution.selector);
        registry.revoke(ID, R.RevocationReason.Fraud);
        vm.prank(outsider);
        vm.expectRevert(R.NotActiveMember.selector);
        registry.revoke(ID, R.RevocationReason.Fraud);
        vm.startPrank(adminA);
        vm.expectRevert(R.InvalidReason.selector);
        registry.revoke(ID, R.RevocationReason.None);
        registry.revoke(ID, R.RevocationReason.Other);
        vm.expectRevert(R.AlreadyRevoked.selector);
        registry.revoke(ID, R.RevocationReason.Other);
    }

    function test_supersede() public {
        _issue();
        bytes32 newId = keccak256("new");
        bytes32 newFile = keccak256("newFile");
        vm.prank(opA);
        registry.supersede(ID, newId, newFile);
        R.Verification memory old = registry.verifyById(ID);
        assertEq(uint8(old.status), uint8(R.CredentialStatus.Replaced));
        assertEq(old.credential.replacedBy, newId);
        assertEq(uint8(registry.verifyByHash(newFile).status), uint8(R.CredentialStatus.Authentic));
    }

    function test_supersedeGuards() public {
        _issue();
        vm.prank(adminB);
        vm.expectRevert(R.WrongInstitution.selector);
        registry.supersede(ID, keccak256("n"), keccak256("nf"));

        vm.startPrank(opA);
        registry.supersede(ID, keccak256("n"), keccak256("nf"));
        vm.expectRevert(R.AlreadyReplaced.selector);
        registry.supersede(ID, keccak256("n2"), keccak256("nf2"));
        registry.revoke(keccak256("n"), R.RevocationReason.IssuedInError);
        vm.expectRevert(R.AlreadyRevoked.selector);
        registry.supersede(keccak256("n"), keccak256("n3"), keccak256("nf3"));
    }

    function test_supersedeCannotReplaceWithItself() public {
        _issue();
        vm.prank(opA);
        vm.expectRevert(R.DuplicateCredential.selector);
        registry.supersede(ID, ID, keccak256("nf"));
    }

    function test_revokedOutranksReplaced() public {
        _issue();
        vm.startPrank(opA);
        registry.supersede(ID, keccak256("n"), keccak256("nf"));
        registry.revoke(ID, R.RevocationReason.Fraud);
        assertEq(uint8(registry.verifyById(ID).status), uint8(R.CredentialStatus.Revoked));
    }

    function test_suspensionBlocksWritesAndFlagsPastCredentials() public {
        _issue();
        vm.prank(owner);
        registry.setInstitutionStatus(instA, R.InstitutionStatus.Suspended);

        assertEq(uint8(registry.verifyById(ID).status), uint8(R.CredentialStatus.IssuerSuspended));
        assertFalse(registry.canIssue(opA));

        vm.startPrank(opA);
        vm.expectRevert(R.NotActiveMember.selector);
        registry.issue(keccak256("2"), keccak256("f2"));
        vm.expectRevert(R.NotActiveMember.selector);
        registry.revoke(ID, R.RevocationReason.Fraud);
        vm.stopPrank();

        vm.prank(adminA);
        vm.expectRevert(R.NotActiveMember.selector);
        registry.addOperator(outsider);

        vm.prank(owner);
        registry.setInstitutionStatus(instA, R.InstitutionStatus.Active);
        assertEq(uint8(registry.verifyById(ID).status), uint8(R.CredentialStatus.Authentic));
    }

    function test_setStatusGuards() public {
        vm.startPrank(owner);
        vm.expectRevert(R.UnknownInstitution.selector);
        registry.setInstitutionStatus(99, R.InstitutionStatus.Active);
        vm.expectRevert(R.InvalidStatus.selector);
        registry.setInstitutionStatus(instA, R.InstitutionStatus.None);
    }

    function test_canIssue() public view {
        assertTrue(registry.canIssue(opA));
        assertTrue(registry.canIssue(adminA));
        assertFalse(registry.canIssue(outsider));
    }

    // ---- fuzz

    function testFuzz_issuedCredentialRoundTrips(bytes32 id, bytes32 fileHash) public {
        vm.assume(id != bytes32(0) && fileHash != bytes32(0));
        vm.prank(opA);
        registry.issue(id, fileHash);
        R.Verification memory v = registry.verifyByHash(fileHash);
        assertEq(v.credentialId, id);
    }

    function testFuzz_nonMemberCannotWrite(address caller, bytes32 id, bytes32 fileHash) public {
        vm.assume(caller != adminA && caller != adminB && caller != opA);
        vm.startPrank(caller);
        vm.expectRevert(R.NotActiveMember.selector);
        registry.issue(id, fileHash);
        vm.expectRevert(R.NotActiveMember.selector);
        registry.revoke(id, R.RevocationReason.Fraud);
    }
}
