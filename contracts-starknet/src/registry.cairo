//! LegitifyRegistry on Starknet: the same public record as the Solidity registry.
//!
//! Credential IDs and file hashes are 256-bit (keccak256 of the certificate code, and SHA-256
//! of the final PDF), so one certificate code maps to the same ID on every network. Status,
//! role and revocation-reason numbers match the Solidity enums, so readers decode both alike.
//!
//! Trust model, stated plainly:
//! - The owner cannot write or edit a credential directly. It can replace an institution's
//!   admin (needed for lost keys), and that admin can then revoke the institution's
//!   credentials. Every such change emits a public event.
//! - Holds no personal data: only hashes and the institution's name.
//! - Deliberately not upgradeable: there is no replace_class entry point.

use starknet::ContractAddress;

pub const INSTITUTION_NONE: u8 = 0;
pub const INSTITUTION_ACTIVE: u8 = 1;
pub const INSTITUTION_SUSPENDED: u8 = 2;

pub const ROLE_NONE: u8 = 0;
pub const ROLE_OPERATOR: u8 = 1;
pub const ROLE_ADMIN: u8 = 2;

pub const REASON_NONE: u8 = 0;
pub const REASON_OTHER: u8 = 4;

/// Order is the public interface; Revoked > Replaced > IssuerSuspended > Authentic.
pub const STATUS_NOT_FOUND: u8 = 0;
pub const STATUS_AUTHENTIC: u8 = 1;
pub const STATUS_REVOKED: u8 = 2;
pub const STATUS_REPLACED: u8 = 3;
pub const STATUS_ISSUER_SUSPENDED: u8 = 4;

pub const MAX_BATCH: u32 = 200;

#[derive(Copy, Drop, Serde, PartialEq, Debug, starknet::Store)]
pub struct Member {
    pub institution_id: u32,
    pub role: u8,
}

#[derive(Drop, Serde, PartialEq, Debug, starknet::Store)]
pub struct Institution {
    pub admin: ContractAddress,
    pub status: u8,
    pub name: ByteArray,
}

#[derive(Copy, Drop, Serde, PartialEq, Debug, starknet::Store)]
pub struct Credential {
    pub issuer: ContractAddress,
    pub institution_id: u32,
    pub issued_at: u64,
    pub revocation_reason: u8,
    pub revoked_at: u64,
    pub file_hash: u256,
    pub replaced_by: u256,
}

#[derive(Copy, Drop, Serde, PartialEq, Debug)]
pub struct IssueParams {
    pub credential_id: u256,
    pub file_hash: u256,
}

#[derive(Drop, Serde, PartialEq, Debug)]
pub struct Verification {
    pub status: u8,
    pub credential_id: u256,
    pub institution_name: ByteArray,
    pub credential: Credential,
}

#[starknet::interface]
pub trait ILegitifyRegistry<TState> {
    // owner
    fn register_institution(ref self: TState, name: ByteArray, admin: ContractAddress) -> u32;
    fn set_institution_status(ref self: TState, institution_id: u32, status: u8);
    fn set_institution_admin(ref self: TState, institution_id: u32, new_admin: ContractAddress);
    fn transfer_ownership(ref self: TState, new_owner: ContractAddress);
    fn accept_ownership(ref self: TState);
    // institution admin
    fn add_operator(ref self: TState, account: ContractAddress);
    fn remove_operator(ref self: TState, account: ContractAddress);
    // issuing
    fn issue(ref self: TState, credential_id: u256, file_hash: u256);
    fn issue_batch(ref self: TState, items: Array<IssueParams>);
    fn revoke(ref self: TState, credential_id: u256, reason: u8);
    fn supersede(ref self: TState, credential_id: u256, new_credential_id: u256, new_file_hash: u256);
    // reads
    fn verify_by_id(self: @TState, credential_id: u256) -> Verification;
    fn verify_by_hash(self: @TState, file_hash: u256) -> Verification;
    fn credential_id_by_hash(self: @TState, file_hash: u256) -> u256;
    fn get_institution(self: @TState, institution_id: u32) -> Institution;
    fn get_member(self: @TState, account: ContractAddress) -> Member;
    fn can_issue(self: @TState, account: ContractAddress) -> bool;
    fn institution_count(self: @TState) -> u32;
    fn credential_count(self: @TState) -> u256;
    fn owner(self: @TState) -> ContractAddress;
    fn pending_owner(self: @TState) -> ContractAddress;
}

pub mod Errors {
    pub const NOT_OWNER: felt252 = 'Not owner';
    pub const NOT_PENDING_OWNER: felt252 = 'Not pending owner';
    pub const ZERO_ADDRESS: felt252 = 'Zero address';
    pub const EMPTY_NAME: felt252 = 'Empty name';
    pub const UNKNOWN_INSTITUTION: felt252 = 'Unknown institution';
    pub const INVALID_STATUS: felt252 = 'Invalid status';
    pub const ALREADY_MEMBER: felt252 = 'Already member';
    pub const NOT_MEMBER: felt252 = 'Not member';
    pub const NOT_INSTITUTION_ADMIN: felt252 = 'Not institution admin';
    pub const NOT_ACTIVE_MEMBER: felt252 = 'Not active member';
    pub const CANNOT_REMOVE_ADMIN: felt252 = 'Cannot remove admin';
    pub const INVALID_CREDENTIAL: felt252 = 'Invalid credential';
    pub const DUPLICATE_CREDENTIAL: felt252 = 'Duplicate credential';
    pub const DUPLICATE_FILE: felt252 = 'Duplicate file';
    pub const CREDENTIAL_NOT_FOUND: felt252 = 'Credential not found';
    pub const WRONG_INSTITUTION: felt252 = 'Wrong institution';
    pub const ALREADY_REVOKED: felt252 = 'Already revoked';
    pub const ALREADY_REPLACED: felt252 = 'Already replaced';
    pub const INVALID_REASON: felt252 = 'Invalid reason';
    pub const BATCH_SIZE: felt252 = 'Batch size';
}

#[starknet::contract]
pub mod LegitifyRegistry {
    use core::num::traits::Zero;
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePathEntry, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_block_timestamp, get_caller_address};
    use super::{
        Credential, Errors, ILegitifyRegistry, INSTITUTION_ACTIVE, INSTITUTION_NONE, INSTITUTION_SUSPENDED, Institution,
        IssueParams, MAX_BATCH, Member, REASON_NONE, REASON_OTHER, ROLE_ADMIN, ROLE_NONE, ROLE_OPERATOR,
        STATUS_AUTHENTIC, STATUS_ISSUER_SUSPENDED, STATUS_NOT_FOUND, STATUS_REPLACED, STATUS_REVOKED, Verification,
    };

    #[storage]
    struct Storage {
        owner: ContractAddress,
        pending_owner: ContractAddress,
        institution_count: u32,
        credential_count: u256,
        institutions: Map<u32, Institution>,
        members: Map<ContractAddress, Member>,
        credentials: Map<u256, Credential>,
        credential_id_by_hash: Map<u256, u256>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        OwnershipTransferStarted: OwnershipTransferStarted,
        OwnershipTransferred: OwnershipTransferred,
        InstitutionRegistered: InstitutionRegistered,
        InstitutionStatusChanged: InstitutionStatusChanged,
        InstitutionAdminChanged: InstitutionAdminChanged,
        OperatorAdded: OperatorAdded,
        OperatorRemoved: OperatorRemoved,
        CredentialIssued: CredentialIssued,
        CredentialRevoked: CredentialRevoked,
        CredentialSuperseded: CredentialSuperseded,
    }

    #[derive(Drop, starknet::Event)]
    pub struct OwnershipTransferStarted {
        #[key]
        pub previous_owner: ContractAddress,
        #[key]
        pub new_owner: ContractAddress,
    }
    #[derive(Drop, starknet::Event)]
    pub struct OwnershipTransferred {
        #[key]
        pub previous_owner: ContractAddress,
        #[key]
        pub new_owner: ContractAddress,
    }
    #[derive(Drop, starknet::Event)]
    pub struct InstitutionRegistered {
        #[key]
        pub institution_id: u32,
        #[key]
        pub admin: ContractAddress,
        pub name: ByteArray,
    }
    #[derive(Drop, starknet::Event)]
    pub struct InstitutionStatusChanged {
        #[key]
        pub institution_id: u32,
        pub status: u8,
    }
    #[derive(Drop, starknet::Event)]
    pub struct InstitutionAdminChanged {
        #[key]
        pub institution_id: u32,
        #[key]
        pub previous_admin: ContractAddress,
        #[key]
        pub new_admin: ContractAddress,
    }
    #[derive(Drop, starknet::Event)]
    pub struct OperatorAdded {
        #[key]
        pub institution_id: u32,
        #[key]
        pub account: ContractAddress,
    }
    #[derive(Drop, starknet::Event)]
    pub struct OperatorRemoved {
        #[key]
        pub institution_id: u32,
        #[key]
        pub account: ContractAddress,
    }
    #[derive(Drop, starknet::Event)]
    pub struct CredentialIssued {
        #[key]
        pub credential_id: u256,
        #[key]
        pub institution_id: u32,
        #[key]
        pub issuer: ContractAddress,
        pub file_hash: u256,
    }
    #[derive(Drop, starknet::Event)]
    pub struct CredentialRevoked {
        #[key]
        pub credential_id: u256,
        #[key]
        pub institution_id: u32,
        #[key]
        pub by: ContractAddress,
        pub reason: u8,
    }
    #[derive(Drop, starknet::Event)]
    pub struct CredentialSuperseded {
        #[key]
        pub credential_id: u256,
        #[key]
        pub replaced_by: u256,
        #[key]
        pub institution_id: u32,
    }

    #[constructor]
    fn constructor(ref self: ContractState, initial_owner: ContractAddress) {
        assert(initial_owner.is_non_zero(), Errors::ZERO_ADDRESS);
        self.owner.write(initial_owner);
        self.emit(OwnershipTransferred { previous_owner: Zero::zero(), new_owner: initial_owner });
    }

    #[abi(embed_v0)]
    impl RegistryImpl of ILegitifyRegistry<ContractState> {
        // ------------------------------------------------------------ owner

        fn register_institution(ref self: ContractState, name: ByteArray, admin: ContractAddress) -> u32 {
            self.only_owner();
            assert(admin.is_non_zero(), Errors::ZERO_ADDRESS);
            assert(name.len() > 0, Errors::EMPTY_NAME);
            assert(self.members.read(admin).role == ROLE_NONE, Errors::ALREADY_MEMBER);

            let id = self.institution_count.read() + 1;
            self.institution_count.write(id);
            self.institutions.write(id, Institution { admin, status: INSTITUTION_ACTIVE, name: name.clone() });
            self.members.write(admin, Member { institution_id: id, role: ROLE_ADMIN });
            self.emit(InstitutionRegistered { institution_id: id, admin, name });
            id
        }

        fn set_institution_status(ref self: ContractState, institution_id: u32, status: u8) {
            self.only_owner();
            self.assert_existing(institution_id);
            assert(status == INSTITUTION_ACTIVE || status == INSTITUTION_SUSPENDED, Errors::INVALID_STATUS);
            self.institutions.entry(institution_id).status.write(status);
            self.emit(InstitutionStatusChanged { institution_id, status });
        }

        /// Recovery path for a lost or compromised institution admin. The new admin may be a
        /// current operator of the same institution.
        fn set_institution_admin(ref self: ContractState, institution_id: u32, new_admin: ContractAddress) {
            self.only_owner();
            self.assert_existing(institution_id);
            assert(new_admin.is_non_zero(), Errors::ZERO_ADDRESS);
            let existing = self.members.read(new_admin);
            let own_operator = existing.role == ROLE_OPERATOR && existing.institution_id == institution_id;
            assert(existing.role == ROLE_NONE || own_operator, Errors::ALREADY_MEMBER);

            let admin = self.institutions.entry(institution_id).admin;
            let previous_admin = admin.read();
            self.members.write(previous_admin, Member { institution_id: 0, role: ROLE_NONE });
            admin.write(new_admin);
            self.members.write(new_admin, Member { institution_id, role: ROLE_ADMIN });
            self.emit(InstitutionAdminChanged { institution_id, previous_admin, new_admin });
        }

        /// Two steps, so a typo can't hand the registry to an address nobody controls. There is
        /// no renounce: a registry without an owner could never onboard or suspend anyone.
        fn transfer_ownership(ref self: ContractState, new_owner: ContractAddress) {
            self.only_owner();
            assert(new_owner.is_non_zero(), Errors::ZERO_ADDRESS);
            self.pending_owner.write(new_owner);
            self.emit(OwnershipTransferStarted { previous_owner: self.owner.read(), new_owner });
        }

        fn accept_ownership(ref self: ContractState) {
            let caller = get_caller_address();
            assert(caller == self.pending_owner.read(), Errors::NOT_PENDING_OWNER);
            let previous_owner = self.owner.read();
            self.owner.write(caller);
            self.pending_owner.write(Zero::zero());
            self.emit(OwnershipTransferred { previous_owner, new_owner: caller });
        }

        // ------------------------------------------------- institution admin

        fn add_operator(ref self: ContractState, account: ContractAddress) {
            let institution_id = self.admin_institution();
            assert(account.is_non_zero(), Errors::ZERO_ADDRESS);
            assert(self.members.read(account).role == ROLE_NONE, Errors::ALREADY_MEMBER);
            self.members.write(account, Member { institution_id, role: ROLE_OPERATOR });
            self.emit(OperatorAdded { institution_id, account });
        }

        fn remove_operator(ref self: ContractState, account: ContractAddress) {
            let institution_id = self.admin_institution();
            let member = self.members.read(account);
            assert(member.role != ROLE_NONE && member.institution_id == institution_id, Errors::NOT_MEMBER);
            assert(member.role != ROLE_ADMIN, Errors::CANNOT_REMOVE_ADMIN);
            self.members.write(account, Member { institution_id: 0, role: ROLE_NONE });
            self.emit(OperatorRemoved { institution_id, account });
        }

        // ---------------------------------------------------------- issuing

        fn issue(ref self: ContractState, credential_id: u256, file_hash: u256) {
            let institution_id = self.active_institution();
            self.issue_one(institution_id, credential_id, file_hash);
        }

        fn issue_batch(ref self: ContractState, items: Array<IssueParams>) {
            assert(items.len() > 0 && items.len() <= MAX_BATCH, Errors::BATCH_SIZE);
            let institution_id = self.active_institution();
            for item in items {
                self.issue_one(institution_id, item.credential_id, item.file_hash);
            }
        }

        fn revoke(ref self: ContractState, credential_id: u256, reason: u8) {
            assert(reason != REASON_NONE && reason <= REASON_OTHER, Errors::INVALID_REASON);
            let institution_id = self.active_institution();
            let mut credential = self.own_credential(credential_id, institution_id);
            assert(credential.revoked_at == 0, Errors::ALREADY_REVOKED);
            credential.revoked_at = get_block_timestamp();
            credential.revocation_reason = reason;
            self.credentials.write(credential_id, credential);
            self.emit(CredentialRevoked { credential_id, institution_id, by: get_caller_address(), reason });
        }

        /// Issue a corrected credential and link the old one to it.
        fn supersede(ref self: ContractState, credential_id: u256, new_credential_id: u256, new_file_hash: u256) {
            let institution_id = self.active_institution();
            let mut credential = self.own_credential(credential_id, institution_id);
            assert(credential.revoked_at == 0, Errors::ALREADY_REVOKED);
            assert(credential.replaced_by == 0, Errors::ALREADY_REPLACED);
            self.issue_one(institution_id, new_credential_id, new_file_hash);
            credential.replaced_by = new_credential_id;
            self.credentials.write(credential_id, credential);
            self.emit(CredentialSuperseded { credential_id, replaced_by: new_credential_id, institution_id });
        }

        // ------------------------------------------------------------ reads

        fn verify_by_id(self: @ContractState, credential_id: u256) -> Verification {
            let credential = self.credentials.read(credential_id);
            if credential.issued_at == 0 {
                return Verification {
                    status: STATUS_NOT_FOUND, credential_id: 0, institution_name: "", credential: empty_credential(),
                };
            }
            let institution = self.institutions.read(credential.institution_id);
            let status = if credential.revoked_at != 0 {
                STATUS_REVOKED
            } else if credential.replaced_by != 0 {
                STATUS_REPLACED
            } else if institution.status != INSTITUTION_ACTIVE {
                STATUS_ISSUER_SUSPENDED
            } else {
                STATUS_AUTHENTIC
            };
            Verification { status, credential_id, institution_name: institution.name, credential }
        }

        fn verify_by_hash(self: @ContractState, file_hash: u256) -> Verification {
            self.verify_by_id(self.credential_id_by_hash.read(file_hash))
        }

        fn credential_id_by_hash(self: @ContractState, file_hash: u256) -> u256 {
            self.credential_id_by_hash.read(file_hash)
        }

        fn get_institution(self: @ContractState, institution_id: u32) -> Institution {
            self.institutions.read(institution_id)
        }

        fn get_member(self: @ContractState, account: ContractAddress) -> Member {
            self.members.read(account)
        }

        /// True if `account` may issue right now.
        fn can_issue(self: @ContractState, account: ContractAddress) -> bool {
            let member = self.members.read(account);
            member.role != ROLE_NONE
                && self.institutions.entry(member.institution_id).status.read() == INSTITUTION_ACTIVE
        }

        fn institution_count(self: @ContractState) -> u32 {
            self.institution_count.read()
        }

        fn credential_count(self: @ContractState) -> u256 {
            self.credential_count.read()
        }

        fn owner(self: @ContractState) -> ContractAddress {
            self.owner.read()
        }

        fn pending_owner(self: @ContractState) -> ContractAddress {
            self.pending_owner.read()
        }
    }

    fn empty_credential() -> Credential {
        Credential {
            issuer: Zero::zero(),
            institution_id: 0,
            issued_at: 0,
            revocation_reason: REASON_NONE,
            revoked_at: 0,
            file_hash: 0,
            replaced_by: 0,
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn only_owner(self: @ContractState) {
            assert(get_caller_address() == self.owner.read(), Errors::NOT_OWNER);
        }

        fn assert_existing(self: @ContractState, institution_id: u32) {
            let status = self.institutions.entry(institution_id).status.read();
            assert(status != INSTITUTION_NONE, Errors::UNKNOWN_INSTITUTION);
        }

        fn admin_institution(self: @ContractState) -> u32 {
            let member = self.members.read(get_caller_address());
            assert(member.role == ROLE_ADMIN, Errors::NOT_INSTITUTION_ADMIN);
            let status = self.institutions.entry(member.institution_id).status.read();
            assert(status == INSTITUTION_ACTIVE, Errors::NOT_ACTIVE_MEMBER);
            member.institution_id
        }

        fn active_institution(self: @ContractState) -> u32 {
            let member = self.members.read(get_caller_address());
            let status = self.institutions.entry(member.institution_id).status.read();
            assert(member.role != ROLE_NONE && status == INSTITUTION_ACTIVE, Errors::NOT_ACTIVE_MEMBER);
            member.institution_id
        }

        fn own_credential(self: @ContractState, credential_id: u256, institution_id: u32) -> Credential {
            let credential = self.credentials.read(credential_id);
            assert(credential.issued_at != 0, Errors::CREDENTIAL_NOT_FOUND);
            assert(credential.institution_id == institution_id, Errors::WRONG_INSTITUTION);
            credential
        }

        fn issue_one(ref self: ContractState, institution_id: u32, credential_id: u256, file_hash: u256) {
            assert(credential_id != 0 && file_hash != 0, Errors::INVALID_CREDENTIAL);
            assert(self.credentials.entry(credential_id).issued_at.read() == 0, Errors::DUPLICATE_CREDENTIAL);
            assert(self.credential_id_by_hash.read(file_hash) == 0, Errors::DUPLICATE_FILE);

            let issuer = get_caller_address();
            self
                .credentials
                .write(
                    credential_id,
                    Credential {
                        issuer,
                        institution_id,
                        issued_at: get_block_timestamp(),
                        revocation_reason: REASON_NONE,
                        revoked_at: 0,
                        file_hash,
                        replaced_by: 0,
                    },
                );
            self.credential_id_by_hash.write(file_hash, credential_id);
            self.credential_count.write(self.credential_count.read() + 1);
            self.emit(CredentialIssued { credential_id, institution_id, issuer, file_hash });
        }
    }
}
