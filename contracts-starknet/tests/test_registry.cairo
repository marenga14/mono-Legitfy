use legitify_starknet::registry::{
    ILegitifyRegistryDispatcher, ILegitifyRegistryDispatcherTrait, ILegitifyRegistrySafeDispatcher,
    ILegitifyRegistrySafeDispatcherTrait, IssueParams, LegitifyRegistry,
};
use starknet::syscalls::deploy_syscall;
use starknet::testing::{set_block_timestamp, set_contract_address};
use starknet::{ContractAddress, SyscallResultTrait};

const ISSUED_AT: u64 = 1_750_000_000;
const ID: u256 = 0xc0de_0000_0000_0000_0000_0000_0000_0000_0000_0000_0000_0000_0000_0000_0000_0001;
const HASH: u256 = 0xf11e_0000_0000_0000_0000_0000_0000_0000_0000_0000_0000_0000_0000_0000_0000_0001;
const ID2: u256 = 0xc0de2;
const HASH2: u256 = 0xf11e2;

fn owner() -> ContractAddress {
    'owner'.try_into().unwrap()
}
fn admin() -> ContractAddress {
    'admin'.try_into().unwrap()
}
fn operator() -> ContractAddress {
    'operator'.try_into().unwrap()
}
fn other_admin() -> ContractAddress {
    'other_admin'.try_into().unwrap()
}
fn outsider() -> ContractAddress {
    'outsider'.try_into().unwrap()
}

#[derive(Copy, Drop)]
struct Setup {
    registry: ILegitifyRegistryDispatcher,
    safe: ILegitifyRegistrySafeDispatcher,
}

/// Owner registers two institutions; the first gets one operator. The caller is left as `owner`.
fn setup() -> Setup {
    set_block_timestamp(ISSUED_AT);
    let calldata = array![owner().into()];
    let (address, _) = deploy_syscall(LegitifyRegistry::TEST_CLASS_HASH.try_into().unwrap(), 0, calldata.span(), false)
        .unwrap_syscall();
    let registry = ILegitifyRegistryDispatcher { contract_address: address };
    set_contract_address(owner());
    assert_eq!(registry.register_institution("University of Dodoma", admin()), 1);
    assert_eq!(registry.register_institution("Mzumbe University", other_admin()), 2);
    set_contract_address(admin());
    registry.add_operator(operator());
    set_contract_address(owner());
    Setup { registry, safe: ILegitifyRegistrySafeDispatcher { contract_address: address } }
}

/// The first word of a failed call's panic data: the short-string error.
fn error_of<T, +Drop<T>>(result: Result<T, Array<felt252>>) -> felt252 {
    match result {
        Result::Ok(_) => panic!("expected the call to fail"),
        Result::Err(data) => *data.at(0),
    }
}

#[test]
#[feature("safe_dispatcher")]
fn only_owner_manages_institutions() {
    let s = setup();
    set_contract_address(outsider());
    assert_eq!(error_of(s.safe.register_institution("X", outsider())), 'Not owner');
    assert_eq!(error_of(s.safe.set_institution_status(1, 2)), 'Not owner');
    assert_eq!(error_of(s.safe.set_institution_admin(1, outsider())), 'Not owner');
    assert_eq!(error_of(s.safe.transfer_ownership(outsider())), 'Not owner');
}

#[test]
#[feature("safe_dispatcher")]
fn register_rejects_bad_input() {
    let s = setup();
    assert_eq!(error_of(s.safe.register_institution("", outsider())), 'Empty name');
    assert_eq!(error_of(s.safe.register_institution("X", 0.try_into().unwrap())), 'Zero address');
    assert_eq!(error_of(s.safe.register_institution("X", operator())), 'Already member');
    let institution = s.registry.get_institution(1);
    assert_eq!(institution.name, "University of Dodoma");
    assert_eq!(institution.admin, admin());
    assert_eq!(institution.status, 1);
    assert_eq!(s.registry.institution_count(), 2);
}

#[test]
#[feature("safe_dispatcher")]
fn ownership_is_two_step() {
    let s = setup();
    s.registry.transfer_ownership(outsider());
    assert_eq!(s.registry.owner(), owner());
    assert_eq!(s.registry.pending_owner(), outsider());
    set_contract_address(admin());
    assert_eq!(error_of(s.safe.accept_ownership()), 'Not pending owner');
    set_contract_address(outsider());
    s.registry.accept_ownership();
    assert_eq!(s.registry.owner(), outsider());
    assert_eq!(s.registry.pending_owner(), 0.try_into().unwrap());
}

#[test]
#[feature("safe_dispatcher")]
fn operators_are_managed_by_their_own_admin_only() {
    let s = setup();
    set_contract_address(admin());
    assert_eq!(error_of(s.safe.add_operator(other_admin())), 'Already member');
    assert_eq!(error_of(s.safe.add_operator(operator())), 'Already member');
    assert_eq!(error_of(s.safe.remove_operator(admin())), 'Cannot remove admin');
    set_contract_address(operator());
    assert_eq!(error_of(s.safe.add_operator(outsider())), 'Not institution admin');
    set_contract_address(other_admin());
    assert_eq!(error_of(s.safe.remove_operator(operator())), 'Not member');
    assert_eq!(error_of(s.safe.remove_operator(outsider())), 'Not member');
}

#[test]
#[feature("safe_dispatcher")]
fn removed_operator_loses_access_but_credential_stays() {
    let s = setup();
    set_contract_address(operator());
    s.registry.issue(ID, HASH);
    set_contract_address(admin());
    s.registry.remove_operator(operator());
    set_contract_address(operator());
    assert_eq!(error_of(s.safe.issue(ID2, HASH2)), 'Not active member');
    assert_eq!(s.registry.verify_by_id(ID).status, 1);
}

#[test]
#[feature("safe_dispatcher")]
fn institution_admin_recovery() {
    let s = setup();
    assert_eq!(error_of(s.safe.set_institution_admin(1, other_admin())), 'Already member');
    assert_eq!(error_of(s.safe.set_institution_admin(2, operator())), 'Already member');
    assert_eq!(error_of(s.safe.set_institution_admin(9, outsider())), 'Unknown institution');
    s.registry.set_institution_admin(1, operator());
    assert_eq!(s.registry.get_member(operator()).role, 2);
    assert_eq!(s.registry.get_member(admin()).role, 0);
    assert_eq!(s.registry.get_institution(1).admin, operator());
    set_contract_address(admin());
    assert_eq!(error_of(s.safe.add_operator(outsider())), 'Not institution admin');
}

#[test]
#[feature("safe_dispatcher")]
fn issue_and_verify_both_paths() {
    let s = setup();
    set_contract_address(operator());
    s.registry.issue(ID, HASH);
    let by_id = s.registry.verify_by_id(ID);
    let by_hash = s.registry.verify_by_hash(HASH);
    assert_eq!(by_id, by_hash);
    assert_eq!(by_id.status, 1);
    assert_eq!(by_id.credential_id, ID);
    assert_eq!(by_id.institution_name, "University of Dodoma");
    assert_eq!(by_id.credential.issuer, operator());
    assert_eq!(by_id.credential.institution_id, 1);
    assert_eq!(by_id.credential.issued_at, ISSUED_AT);
    assert_eq!(by_id.credential.file_hash, HASH);
    assert_eq!(s.registry.credential_id_by_hash(HASH), ID);
    assert_eq!(s.registry.credential_count(), 1);
}

#[test]
#[feature("safe_dispatcher")]
fn outsiders_cannot_issue_and_unknowns_are_not_found() {
    let s = setup();
    set_contract_address(outsider());
    assert_eq!(error_of(s.safe.issue(ID, HASH)), 'Not active member');
    let none = s.registry.verify_by_hash(HASH);
    assert_eq!(none.status, 0);
    assert_eq!(none.credential_id, 0);
    assert_eq!(none.institution_name, "");
}

#[test]
#[feature("safe_dispatcher")]
fn rejects_zero_and_duplicates_across_institutions() {
    let s = setup();
    set_contract_address(operator());
    assert_eq!(error_of(s.safe.issue(0, HASH)), 'Invalid credential');
    assert_eq!(error_of(s.safe.issue(ID, 0)), 'Invalid credential');
    s.registry.issue(ID, HASH);
    assert_eq!(error_of(s.safe.issue(ID, HASH2)), 'Duplicate credential');
    assert_eq!(error_of(s.safe.issue(ID2, HASH)), 'Duplicate file');
    set_contract_address(other_admin());
    assert_eq!(error_of(s.safe.issue(ID, HASH2)), 'Duplicate credential');
    assert_eq!(s.registry.verify_by_id(ID).credential.institution_id, 1);
}

#[test]
#[feature("safe_dispatcher")]
fn issue_batch_is_bounded_and_all_or_nothing() {
    let s = setup();
    set_contract_address(admin());
    assert_eq!(error_of(s.safe.issue_batch(array![])), 'Batch size');
    let mut too_many = array![];
    for i in 1..202_u32 {
        too_many.append(IssueParams { credential_id: i.into(), file_hash: i.into() });
    }
    assert_eq!(error_of(s.safe.issue_batch(too_many)), 'Batch size');

    let clash = array![
        IssueParams { credential_id: ID, file_hash: HASH }, IssueParams { credential_id: ID2, file_hash: HASH },
    ];
    assert_eq!(error_of(s.safe.issue_batch(clash)), 'Duplicate file');
    assert_eq!(s.registry.verify_by_id(ID).status, 0);

    s
        .registry
        .issue_batch(
            array![
                IssueParams { credential_id: ID, file_hash: HASH }, IssueParams { credential_id: ID2, file_hash: HASH2 },
            ],
        );
    assert_eq!(s.registry.verify_by_hash(HASH2).credential_id, ID2);
    assert_eq!(s.registry.credential_count(), 2);
}

#[test]
#[feature("safe_dispatcher")]
fn revoke_and_its_guards() {
    let s = setup();
    set_contract_address(operator());
    s.registry.issue(ID, HASH);
    assert_eq!(error_of(s.safe.revoke(ID, 0)), 'Invalid reason');
    assert_eq!(error_of(s.safe.revoke(ID, 5)), 'Invalid reason');
    assert_eq!(error_of(s.safe.revoke(ID2, 2)), 'Credential not found');
    set_contract_address(other_admin());
    assert_eq!(error_of(s.safe.revoke(ID, 2)), 'Wrong institution');
    set_contract_address(admin());
    set_block_timestamp(ISSUED_AT + 60);
    s.registry.revoke(ID, 2);
    let v = s.registry.verify_by_hash(HASH);
    assert_eq!(v.status, 2);
    assert_eq!(v.credential.revocation_reason, 2);
    assert_eq!(v.credential.revoked_at, ISSUED_AT + 60);
    assert_eq!(error_of(s.safe.revoke(ID, 2)), 'Already revoked');
}

#[test]
#[feature("safe_dispatcher")]
fn supersede_and_its_guards() {
    let s = setup();
    set_contract_address(operator());
    s.registry.issue(ID, HASH);
    assert_eq!(error_of(s.safe.supersede(ID, ID, HASH2)), 'Duplicate credential');
    s.registry.supersede(ID, ID2, HASH2);
    let old = s.registry.verify_by_id(ID);
    assert_eq!(old.status, 3);
    assert_eq!(old.credential.replaced_by, ID2);
    assert_eq!(s.registry.verify_by_id(ID2).status, 1);
    assert_eq!(error_of(s.safe.supersede(ID, 0xc0de3, 0xf11e3)), 'Already replaced');

    // Revoked outranks replaced.
    s.registry.revoke(ID, 1);
    assert_eq!(s.registry.verify_by_id(ID).status, 2);
    assert_eq!(error_of(s.safe.supersede(ID, 0xc0de3, 0xf11e3)), 'Already revoked');
}

#[test]
#[feature("safe_dispatcher")]
fn suspension_blocks_writes_and_flags_past_credentials() {
    let s = setup();
    set_contract_address(operator());
    s.registry.issue(ID, HASH);
    assert!(s.registry.can_issue(operator()));
    assert!(!s.registry.can_issue(outsider()));

    set_contract_address(owner());
    assert_eq!(error_of(s.safe.set_institution_status(1, 0)), 'Invalid status');
    assert_eq!(error_of(s.safe.set_institution_status(1, 3)), 'Invalid status');
    assert_eq!(error_of(s.safe.set_institution_status(9, 2)), 'Unknown institution');
    s.registry.set_institution_status(1, 2);
    assert!(!s.registry.can_issue(operator()));
    assert_eq!(s.registry.verify_by_id(ID).status, 4);

    set_contract_address(operator());
    assert_eq!(error_of(s.safe.issue(ID2, HASH2)), 'Not active member');
    assert_eq!(error_of(s.safe.revoke(ID, 1)), 'Not active member');
    set_contract_address(admin());
    assert_eq!(error_of(s.safe.add_operator(outsider())), 'Not active member');

    set_contract_address(owner());
    s.registry.set_institution_status(1, 1);
    assert_eq!(s.registry.verify_by_id(ID).status, 1);
}
