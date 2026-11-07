// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title AuditAnchor
/// @notice Write-once daily roots of Legitify's off-chain exchange audit log. A root proves
///         the log for that day has not been rewritten since; it reveals nothing about content.
contract AuditAnchor is Ownable2Step {
    mapping(uint32 day => bytes32 root) public roots;

    event Anchored(uint32 indexed day, bytes32 root);

    error InvalidRoot();
    error AlreadyAnchored();

    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @param day Days since the Unix epoch (UTC).
    function anchor(uint32 day, bytes32 root) external onlyOwner {
        if (root == bytes32(0)) revert InvalidRoot();
        if (roots[day] != bytes32(0)) revert AlreadyAnchored();
        roots[day] = root;
        emit Anchored(day, root);
    }
}
