// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title LegitifyRegistry
/// @notice Public record of credentials issued by registered institutions.
/// @dev Deliberately non-upgradeable. Holds no personal data: only hashes and an
///      encrypted file reference.
///
///      Trust model, stated plainly:
///      - The owner cannot write or edit a credential directly. It can, however,
///        replace an institution's admin (needed for lost keys), and that admin can
///        then revoke the institution's credentials. The owner should be a multisig,
///        and every such change emits a public event.
///      - A registered institution could front-run another's pending `issue` with the
///        same hash. Each stamped PDF carries a random id, so its hash is unknowable
///        before submission; the victim's tx reverts visibly and the owner can suspend
///        the offender.
contract LegitifyRegistry is Ownable2Step {
    enum InstitutionStatus {
        None,
        Active,
        Suspended
    }

    enum Role {
        None,
        Operator,
        Admin
    }

    enum RevocationReason {
        None,
        IssuedInError,
        Fraud,
        Withdrawn,
        Other
    }

    /// @dev Order is the on-chain ABI; Revoked > Replaced > IssuerSuspended > Authentic.
    enum CredentialStatus {
        NotFound,
        Authentic,
        Revoked,
        Replaced,
        IssuerSuspended
    }

    struct Institution {
        address admin;
        InstitutionStatus status;
        string name;
    }

    struct Member {
        uint32 institutionId;
        Role role;
    }

    struct Credential {
        address issuer;
        uint32 institutionId;
        uint40 issuedAt;
        RevocationReason revocationReason;
        uint40 revokedAt;
        bytes32 fileHash; // SHA-256 of the final PDF
        bytes32 replacedBy; // credentialId of the corrected version
    }

    struct IssueParams {
        bytes32 credentialId;
        bytes32 fileHash;
    }

    struct Verification {
        CredentialStatus status;
        bytes32 credentialId;
        string institutionName;
        Credential credential;
    }

    uint256 public constant MAX_BATCH = 200;

    uint32 public institutionCount;
    uint256 public credentialCount;

    mapping(uint32 institutionId => Institution) private _institutions;
    mapping(address account => Member) private _members;
    mapping(bytes32 credentialId => Credential) private _credentials;
    mapping(bytes32 fileHash => bytes32 credentialId) public credentialIdByHash;

    event InstitutionRegistered(uint32 indexed institutionId, address indexed admin, string name);
    event InstitutionStatusChanged(uint32 indexed institutionId, InstitutionStatus status);
    event InstitutionAdminChanged(uint32 indexed institutionId, address indexed previousAdmin, address indexed newAdmin);
    event OperatorAdded(uint32 indexed institutionId, address indexed account);
    event OperatorRemoved(uint32 indexed institutionId, address indexed account);
    event CredentialIssued(
        bytes32 indexed credentialId, uint32 indexed institutionId, address indexed issuer, bytes32 fileHash
    );
    event CredentialRevoked(
        bytes32 indexed credentialId, uint32 indexed institutionId, address indexed by, RevocationReason reason
    );
    event CredentialSuperseded(bytes32 indexed credentialId, bytes32 indexed replacedBy, uint32 indexed institutionId);

    error ZeroAddress();
    error EmptyName();
    error UnknownInstitution();
    error InvalidStatus();
    error AlreadyMember();
    error NotMember();
    error NotInstitutionAdmin();
    error NotActiveMember();
    error CannotRemoveAdmin();
    error InvalidCredential();
    error DuplicateCredential();
    error DuplicateFile();
    error CredentialNotFound();
    error WrongInstitution();
    error AlreadyRevoked();
    error AlreadyReplaced();
    error InvalidReason();
    error BatchSize();
    error RenounceDisabled();

    constructor(address initialOwner) Ownable(initialOwner) {}

    // ------------------------------------------------------------------ owner

    function registerInstitution(string calldata name, address admin) external onlyOwner returns (uint32 id) {
        if (admin == address(0)) revert ZeroAddress();
        if (bytes(name).length == 0) revert EmptyName();
        if (_members[admin].role != Role.None) revert AlreadyMember();

        id = ++institutionCount;
        _institutions[id] = Institution({admin: admin, status: InstitutionStatus.Active, name: name});
        _members[admin] = Member({institutionId: id, role: Role.Admin});
        emit InstitutionRegistered(id, admin, name);
    }

    function setInstitutionStatus(uint32 institutionId, InstitutionStatus status) external onlyOwner {
        Institution storage institution = _existing(institutionId);
        if (status == InstitutionStatus.None) revert InvalidStatus();
        institution.status = status;
        emit InstitutionStatusChanged(institutionId, status);
    }

    /// @notice Recovery path for a lost or compromised institution admin.
    /// @dev The new admin may be a current operator of the same institution.
    function setInstitutionAdmin(uint32 institutionId, address newAdmin) external onlyOwner {
        Institution storage institution = _existing(institutionId);
        if (newAdmin == address(0)) revert ZeroAddress();
        Member memory existing = _members[newAdmin];
        bool isOwnOperator = existing.role == Role.Operator && existing.institutionId == institutionId;
        if (existing.role != Role.None && !isOwnOperator) revert AlreadyMember();

        address previous = institution.admin;
        delete _members[previous];
        institution.admin = newAdmin;
        _members[newAdmin] = Member({institutionId: institutionId, role: Role.Admin});
        emit InstitutionAdminChanged(institutionId, previous, newAdmin);
    }

    /// @dev A registry without an owner could never onboard or suspend anyone.
    function renounceOwnership() public view override onlyOwner {
        revert RenounceDisabled();
    }

    // -------------------------------------------------------- institution admin

    function addOperator(address account) external {
        uint32 institutionId = _adminInstitution();
        if (account == address(0)) revert ZeroAddress();
        if (_members[account].role != Role.None) revert AlreadyMember();
        _members[account] = Member({institutionId: institutionId, role: Role.Operator});
        emit OperatorAdded(institutionId, account);
    }

    function removeOperator(address account) external {
        uint32 institutionId = _adminInstitution();
        Member memory member = _members[account];
        if (member.institutionId != institutionId) revert NotMember();
        if (member.role == Role.Admin) revert CannotRemoveAdmin();
        delete _members[account];
        emit OperatorRemoved(institutionId, account);
    }

    // ----------------------------------------------------------------- issuing

    function issue(bytes32 credentialId, bytes32 fileHash) external {
        _issue(_activeInstitution(), credentialId, fileHash);
    }

    function issueBatch(IssueParams[] calldata items) external {
        if (items.length == 0 || items.length > MAX_BATCH) revert BatchSize();
        uint32 institutionId = _activeInstitution();
        for (uint256 i; i < items.length; ++i) {
            _issue(institutionId, items[i].credentialId, items[i].fileHash);
        }
    }

    function revoke(bytes32 credentialId, RevocationReason reason) external {
        if (reason == RevocationReason.None) revert InvalidReason();
        uint32 institutionId = _activeInstitution();
        Credential storage credential = _ownCredential(credentialId, institutionId);
        if (credential.revokedAt != 0) revert AlreadyRevoked();
        credential.revokedAt = uint40(block.timestamp);
        credential.revocationReason = reason;
        emit CredentialRevoked(credentialId, institutionId, msg.sender, reason);
    }

    /// @notice Issue a corrected credential and link the old one to it.
    function supersede(bytes32 credentialId, bytes32 newCredentialId, bytes32 newFileHash) external {
        uint32 institutionId = _activeInstitution();
        Credential storage credential = _ownCredential(credentialId, institutionId);
        if (credential.revokedAt != 0) revert AlreadyRevoked();
        if (credential.replacedBy != bytes32(0)) revert AlreadyReplaced();
        _issue(institutionId, newCredentialId, newFileHash);
        credential.replacedBy = newCredentialId;
        emit CredentialSuperseded(credentialId, newCredentialId, institutionId);
    }

    // ------------------------------------------------------------------- reads

    function verifyById(bytes32 credentialId) public view returns (Verification memory result) {
        Credential memory credential = _credentials[credentialId];
        if (credential.issuedAt == 0) return result;
        Institution storage institution = _institutions[credential.institutionId];
        result.credentialId = credentialId;
        result.institutionName = institution.name;
        result.credential = credential;
        if (credential.revokedAt != 0) result.status = CredentialStatus.Revoked;
        else if (credential.replacedBy != bytes32(0)) result.status = CredentialStatus.Replaced;
        else if (institution.status != InstitutionStatus.Active) result.status = CredentialStatus.IssuerSuspended;
        else result.status = CredentialStatus.Authentic;
    }

    function verifyByHash(bytes32 fileHash) external view returns (Verification memory) {
        return verifyById(credentialIdByHash[fileHash]);
    }

    function getInstitution(uint32 institutionId) external view returns (Institution memory) {
        return _institutions[institutionId];
    }

    function getMember(address account) external view returns (Member memory) {
        return _members[account];
    }

    /// @notice True if `account` may issue right now. Used by the gas sponsorship service.
    function canIssue(address account) external view returns (bool) {
        Member memory member = _members[account];
        return member.role != Role.None && _institutions[member.institutionId].status == InstitutionStatus.Active;
    }

    // --------------------------------------------------------------- internals

    function _issue(uint32 institutionId, bytes32 credentialId, bytes32 fileHash) private {
        if (credentialId == bytes32(0) || fileHash == bytes32(0)) revert InvalidCredential();
        if (_credentials[credentialId].issuedAt != 0) revert DuplicateCredential();
        if (credentialIdByHash[fileHash] != bytes32(0)) revert DuplicateFile();

        Credential storage credential = _credentials[credentialId];
        credential.issuer = msg.sender;
        credential.institutionId = institutionId;
        credential.issuedAt = uint40(block.timestamp);
        credential.fileHash = fileHash;
        credentialIdByHash[fileHash] = credentialId;
        ++credentialCount;
        emit CredentialIssued(credentialId, institutionId, msg.sender, fileHash);
    }

    function _existing(uint32 institutionId) private view returns (Institution storage institution) {
        institution = _institutions[institutionId];
        if (institution.status == InstitutionStatus.None) revert UnknownInstitution();
    }

    function _adminInstitution() private view returns (uint32) {
        Member memory member = _members[msg.sender];
        if (member.role != Role.Admin) revert NotInstitutionAdmin();
        if (_institutions[member.institutionId].status != InstitutionStatus.Active) revert NotActiveMember();
        return member.institutionId;
    }

    function _activeInstitution() private view returns (uint32) {
        Member memory member = _members[msg.sender];
        if (member.role == Role.None || _institutions[member.institutionId].status != InstitutionStatus.Active) {
            revert NotActiveMember();
        }
        return member.institutionId;
    }

    function _ownCredential(bytes32 credentialId, uint32 institutionId)
        private
        view
        returns (Credential storage credential)
    {
        credential = _credentials[credentialId];
        if (credential.issuedAt == 0) revert CredentialNotFound();
        if (credential.institutionId != institutionId) revert WrongInstitution();
    }
}
