// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script, console2} from "forge-std/Script.sol";
import {EntryPoint} from "account-abstraction/core/EntryPoint.sol";
import {IEntryPoint} from "account-abstraction/interfaces/IEntryPoint.sol";
import {SimpleAccountFactory} from "account-abstraction/samples/SimpleAccountFactory.sol";
import {AuditAnchor} from "../src/AuditAnchor.sol";
import {LegitifyRegistry as R} from "../src/LegitifyRegistry.sol";

/// Local development only: seeds fictional institutions on anvil using its public test keys.
/// Run through scripts/local-up.sh, which supplies the file hashes as VALID_HASH, REVOKED_HASH
/// and OTHER_HASH, and the smart-account owner as STAFF_OWNER.
contract LocalSeed is Script {
    function run() external {
        uint256 ownerKey = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
        uint256 adminKey = 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d;
        uint256 otherAdminKey = 0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a;
        address operator = vm.addr(0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6);

        vm.startBroadcast(ownerKey);
        EntryPoint entryPoint = new EntryPoint();
        SimpleAccountFactory factory = new SimpleAccountFactory(IEntryPoint(address(entryPoint)));
        R registry = new R(vm.addr(ownerKey));
        AuditAnchor anchor = new AuditAnchor(vm.addr(ownerKey));
        registry.registerInstitution("Kilimani University", vm.addr(adminKey));
        registry.registerInstitution("Pwani College", vm.addr(otherAdminKey));
        vm.stopBroadcast();

        address staff = factory.getAddress(vm.envAddress("STAFF_OWNER"), 0);
        vm.startBroadcast(adminKey);
        registry.addOperator(staff);
        registry.addOperator(operator);
        registry.issue(keccak256("valid"), vm.envBytes32("VALID_HASH"));
        registry.issue(keccak256("revoked"), vm.envBytes32("REVOKED_HASH"));
        registry.revoke(keccak256("revoked"), R.RevocationReason.IssuedInError);
        vm.stopBroadcast();

        vm.startBroadcast(otherAdminKey);
        registry.issue(keccak256("other"), vm.envBytes32("OTHER_HASH"));
        vm.stopBroadcast();

        console2.log("REGISTRY", address(registry));
        console2.log("FACTORY", address(factory));
        console2.log("ANCHOR", address(anchor));
    }
}
