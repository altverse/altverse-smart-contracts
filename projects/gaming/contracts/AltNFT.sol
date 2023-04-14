// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "@thirdweb-dev/contracts/base/ERC1155LazyMint.sol";

contract AltNFT is ERC1155LazyMint {
    // Mapping from tokenId to wallet address to maximum claimable count
    mapping(uint256 => mapping(address => uint256)) public maxClaimableCount;

    // Mapping from tokenId to minter address
    mapping(uint256 => address) public tokenIdToMinter;

    constructor(
        string memory _name,
        string memory _symbol,
        address _royaltyRecipient,
        uint128 _royaltyBps
    ) ERC1155LazyMint(_name, _symbol, _royaltyRecipient, _royaltyBps) {}

    function setMaxClaimableCount(uint256 tokenId, address wallet, uint256 count) external {
        require(msg.sender == owner() || msg.sender == tokenIdToMinter[tokenId], "Not authorized");
        maxClaimableCount[tokenId][wallet] = count;
    }

    function setTokenMinter(uint256 tokenId, address minter) internal {
        tokenIdToMinter[tokenId] = minter;
    }

    function lazyMint(
        uint256 _amount,
        string calldata _baseURIForTokens,
        bytes calldata _data
    ) public virtual override returns (uint256 batchId) {
        batchId = super.lazyMint(_amount, _baseURIForTokens, _data);
        uint256 startId = nextTokenIdToLazyMint - _amount;
        for (uint256 i = 0; i < _amount; i++) {
            setTokenMinter(startId + i, msg.sender);
        }
        return batchId;
    }

    function verifyClaim(
        address _claimer,
        uint256 _tokenId,
        uint256 _quantity
    ) public view virtual override {
        super.verifyClaim(_claimer, _tokenId, _quantity);
        require(balanceOf[_claimer][_tokenId] + _quantity <= maxClaimableCount[_tokenId][_claimer], "Claim exceeds max allowed");
    }
}
