// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {AuditAnchor} from "../src/AuditAnchor.sol";
import {LegitifyRegistry} from "../src/LegitifyRegistry.sol";

/// forge script script/Deploy.s.sol --rpc-url bot_testnet --broadcast
/// Requires DEPLOYER_PRIVATE_KEY; PLATFORM_OWNER defaults to the deployer.
contract Deploy is Script {
    function run() external {
        uint256 key = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address owner = vm.envOr("PLATFORM_OWNER", vm.addr(key));
        vm.startBroadcast(key);
        LegitifyRegistry registry = new LegitifyRegistry(owner);
        AuditAnchor anchor = new AuditAnchor(owner);
        vm.stopBroadcast();
        console2.log("LegitifyRegistry", address(registry));
        console2.log("AuditAnchor", address(anchor));
    }
}
