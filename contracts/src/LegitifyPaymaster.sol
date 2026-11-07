// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IEntryPoint} from "account-abstraction/interfaces/IEntryPoint.sol";
import {VerifyingPaymaster} from "account-abstraction/samples/VerifyingPaymaster.sol";

/// @title LegitifyPaymaster
/// @notice Sponsors UserOperations approved by the Legitify API's signer.
/// @dev Policy (member of an active institution, registry target, quota) lives off-chain
///      in `POST /sponsor`; this contract only checks that signature and its time window.
///      The signer is immutable: if it leaks, the owner withdraws the deposit and deploys
///      a new paymaster. A leaked signer can spend at most the deposit, so keep it small.
contract LegitifyPaymaster is VerifyingPaymaster {
    constructor(IEntryPoint entryPoint, address verifyingSigner) VerifyingPaymaster(entryPoint, verifyingSigner) {}
}
