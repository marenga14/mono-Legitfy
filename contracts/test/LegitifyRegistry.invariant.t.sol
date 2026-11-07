// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {LegitifyRegistry as R} from "../src/LegitifyRegistry.sol";

/// Drives legitimate activity plus a stream of attacks from outsiders and from a rival
/// institution. Ghost state records what honest members did; attacks must never show up.
contract Handler is Test {
    R public registry;
    address public adminA = address(0xA1);
    address public opA = address(0xA2);
    address public adminB = address(0xB1);
    address[] public outsiders = [address(0xC1), address(0xC2), address(0xC3)];

    bytes32[] public ids;
    mapping(bytes32 => bytes32) public ghostFile;
    mapping(bytes32 => bool) public ghostRevoked;
    mapping(bytes32 => bytes32) public ghostReplaced;
    uint256 public ghostIssued;

    constructor(R r) {
        registry = r;
    }

    function idCount() external view returns (uint256) {
        return ids.length;
    }

    function _pick(uint256 seed) private view returns (bytes32) {
        return ids.length == 0 ? bytes32(seed) : ids[seed % ids.length];
    }

    function issueHonest(uint256 seed) external {
        bytes32 id = keccak256(abi.encode("id", ids.length, seed));
        bytes32 fileHash = keccak256(abi.encode("file", ids.length, seed));
        vm.prank(opA);
        registry.issue(id, fileHash);
        ids.push(id);
        ghostFile[id] = fileHash;
        ++ghostIssued;
    }

    function revokeHonest(uint256 seed) external {
        bytes32 id = _pick(seed);
        vm.prank(adminA);
        try registry.revoke(id, R.RevocationReason.Fraud) {
            ghostRevoked[id] = true;
        } catch {}
    }

    function supersedeHonest(uint256 seed) external {
        bytes32 id = _pick(seed);
        bytes32 newId = keccak256(abi.encode("new", ids.length, seed));
        bytes32 newFile = keccak256(abi.encode("newfile", ids.length, seed));
        vm.prank(opA);
        try registry.supersede(id, newId, newFile) {
            ids.push(newId);
            ghostFile[newId] = newFile;
            ghostReplaced[id] = newId;
            ++ghostIssued;
        } catch {}
    }

    function attackAsOutsider(uint256 seed, bytes32 fileHash) external {
        bytes32 id = _pick(seed);
        vm.startPrank(outsiders[seed % outsiders.length]);
        try registry.issue(keccak256(abi.encode(seed, "evil")), fileHash) {
            revert("outsider issued");
        } catch {}
        try registry.issue(id, fileHash) {
            revert("outsider overwrote");
        } catch {}
        try registry.revoke(id, R.RevocationReason.Fraud) {
            revert("outsider revoked");
        } catch {}
        try registry.supersede(id, keccak256(abi.encode(seed)), fileHash) {
            revert("outsider superseded");
        } catch {}
        try registry.addOperator(outsiders[0]) {
            revert("outsider joined");
        } catch {}
        vm.stopPrank();
    }

    function attackAsRival(uint256 seed) external {
        bytes32 id = _pick(seed);
        vm.startPrank(adminB);
        if (ids.length != 0) {
            try registry.revoke(id, R.RevocationReason.Fraud) {
                revert("rival revoked");
            } catch {}
            try registry.supersede(id, keccak256(abi.encode(seed, "r")), keccak256(abi.encode(seed, "rf"))) {
                revert("rival superseded");
            } catch {}
            try registry.issue(id, keccak256(abi.encode(seed, "rf2"))) {
                revert("rival overwrote");
            } catch {}
        }
        vm.stopPrank();
    }
}

contract LegitifyRegistryInvariantTest is Test {
    R registry;
    Handler handler;

    function setUp() public {
        vm.warp(1_800_000_000);
        registry = new R(address(this));
        handler = new Handler(registry);
        registry.registerInstitution("A", handler.adminA());
        registry.registerInstitution("B", handler.adminB());
        address adminA = handler.adminA();
        address opA = handler.opA();
        vm.prank(adminA);
        registry.addOperator(opA);
        targetContract(address(handler));
    }

    /// Every credential is exactly what honest members wrote.
    function invariant_recordsMatchHonestHistory() public view {
        uint256 n = handler.idCount();
        for (uint256 i; i < n; ++i) {
            bytes32 id = handler.ids(i);
            R.Verification memory v = registry.verifyById(id);
            assertEq(v.credential.fileHash, handler.ghostFile(id));
            assertEq(v.credential.institutionId, 1);
            assertEq(v.credential.revokedAt != 0, handler.ghostRevoked(id));
            assertEq(v.credential.replacedBy, handler.ghostReplaced(id));
            assertEq(registry.credentialIdByHash(v.credential.fileHash), id);
        }
    }

    function invariant_countMatches() public view {
        assertEq(registry.credentialCount(), handler.ghostIssued());
    }

    function invariant_noExtraMembers() public view {
        assertEq(uint8(registry.getMember(address(0xC1)).role), 0);
        assertEq(uint8(registry.getMember(address(0xC2)).role), 0);
        assertEq(uint8(registry.getMember(address(0xC3)).role), 0);
    }
}
