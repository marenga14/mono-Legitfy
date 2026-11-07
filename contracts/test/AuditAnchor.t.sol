// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AuditAnchor} from "../src/AuditAnchor.sol";

contract AuditAnchorTest is Test {
    AuditAnchor anchor;
    address stranger = makeAddr("stranger");

    function setUp() public {
        anchor = new AuditAnchor(address(this));
    }

    function test_anchorIsWriteOnce() public {
        anchor.anchor(20_000, keccak256("a"));
        assertEq(anchor.roots(20_000), keccak256("a"));
        vm.expectRevert(AuditAnchor.AlreadyAnchored.selector);
        anchor.anchor(20_000, keccak256("b"));
    }

    function test_rejectsZeroRoot() public {
        vm.expectRevert(AuditAnchor.InvalidRoot.selector);
        anchor.anchor(1, bytes32(0));
    }

    function test_onlyOwner() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        anchor.anchor(1, keccak256("a"));
    }
}
