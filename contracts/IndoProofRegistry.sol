// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IndoProofRegistry
/// @notice Public, append-only record of document proof digests. Stores no document data.
/// @dev Anchoring proves a digest was recorded; it does NOT authenticate an issuer.
contract IndoProofRegistry {
    mapping(bytes32 => uint256) private anchorBlock;

    event ProofAnchored(bytes32 indexed proofDigest, address indexed anchoringAccount);

    function anchor(bytes32 proofDigest) external {
        require(proofDigest != bytes32(0), "Empty digest");
        require(anchorBlock[proofDigest] == 0, "Already anchored");
        anchorBlock[proofDigest] = block.number;
        emit ProofAnchored(proofDigest, msg.sender);
    }

    function getAnchorBlock(bytes32 proofDigest) external view returns (uint256) {
        return anchorBlock[proofDigest];
    }
}
