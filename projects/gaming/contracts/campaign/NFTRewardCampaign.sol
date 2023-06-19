// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import '@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol';
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

import "hardhat/console.sol";

contract NFTRewardCampaign is Ownable, ReentrancyGuard, EIP712 {
    using ECDSA for bytes32;
    using SafeMath for uint256;

    enum CampaignType { FCFS, Raffle }
    enum TokenType { ERC721, ERC1155 }

    struct CampaignDetails {
        address nftAddress;
        uint256[] tokenIds;
        TokenType tokenType;
        uint256 rewardAmount; // Only used for ERC1155
        address owner;
        CampaignType campaignType;
    }

    struct ClaimData {
        uint256 campaignId;
        uint256 tokenId;
        uint256 rewardAmount;
        address creator;
    }
    bytes32 internal constant TYPEHASH = keccak256("ClaimData(uint256 campaignId,uint256 tokenId,uint256 rewardAmount,address creator)");

    // Mapping of campaignId to CampaignDetails
    mapping(uint256 => CampaignDetails) public campaigns;
    mapping(address => uint256[]) public campaignsByOwner;    // owner -> campaignId


    constructor() EIP712("NFTRewardCampaign", "1") 
    {
        
    }

    // Function to create a new campaign
    function createCampaign(address _nftAddress, uint256[] memory _tokenIds, uint256 _rewardAmount, TokenType _tokenType) public {
        if (_tokenType == TokenType.ERC721) {
            IERC721 nftContract = IERC721(_nftAddress);

            // Transfer each NFT from campaign creator to contract
            for (uint256 i = 0; i < _tokenIds.length; i++) {
                nftContract.transferFrom(msg.sender, address(this), _tokenIds[i]);
            }
        } 
        else if (_tokenType == TokenType.ERC1155) {
            IERC1155 nftContract = IERC1155(_nftAddress);

            // Transfer each token from campaign creator to contract
            for (uint256 i = 0; i < _tokenIds.length; i++) {
                nftContract.safeTransferFrom(msg.sender, address(this), _tokenIds[i], _rewardAmount, "");
            }
        }
        else {
            revert();
        }

        // Store campaign details
        CampaignDetails memory newCampaign;
        newCampaign.nftAddress = _nftAddress;
        newCampaign.tokenIds = _tokenIds;
        newCampaign.rewardAmount = _rewardAmount;
        newCampaign.tokenType = _tokenType;
        newCampaign.owner = msg.sender;

        // Generate a campaignId
        uint256 campaignId = uint256(keccak256(abi.encodePacked(_nftAddress, _tokenIds, _rewardAmount, _tokenType, msg.sender)));

        // Save the campaign details
        campaigns[campaignId] = newCampaign;
        campaignsByOwner[msg.sender].push(campaignId);
    }

    // Function to claim reward
    function claimReward(ClaimData calldata data, bytes calldata signature) nonReentrant external {
        require(verifySignature(data, signature), "Invalid signature"); 

        CampaignDetails storage campaign = campaigns[data.campaignId];

         // Verify the token is part of the campaign
        bool tokenExists = false;
        uint256 tokenIndex;
        for (uint256 i = 0; i < campaign.tokenIds.length; i++) {
            if (campaign.tokenIds[i] == data.tokenId) {
                tokenExists = true;
                tokenIndex = i;
                break;
            }
        }
        require(tokenExists, "Invalid token");

        if (campaign.tokenType == TokenType.ERC721) {
            // Transfer the NFT to the claimer
            IERC721 nftContract = IERC721(campaign.nftAddress);
            nftContract.transferFrom(address(this), msg.sender, data.tokenId);

            // Remove the token from the campaign
            campaign.tokenIds[tokenIndex] = campaign.tokenIds[campaign.tokenIds.length - 1];
            campaign.tokenIds.pop();
        } else if (campaign.tokenType == TokenType.ERC1155) {
            // Check if the campaign has enough rewards left
            require(campaign.rewardAmount >= data.rewardAmount, "Not enough rewards left");

            // Transfer the tokens to the claimer
            IERC1155 nftContract = IERC1155(campaign.nftAddress);
            nftContract.safeTransferFrom(address(this), msg.sender, data.tokenId, data.rewardAmount, "");

            // Update the campaign's reward amount
            campaign.rewardAmount  -= data.rewardAmount;
        }

         // Update the campaign's record
        campaigns[data.campaignId] = campaign;
    }

    function verifySignature(ClaimData calldata _data, bytes calldata _signature) public view returns (bool) {
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            TYPEHASH,
            _data.campaignId,
            _data.tokenId,
            _data.rewardAmount,
            _data.creator
        )));

        return owner() == digest.recover(_signature) && _data.creator == msg.sender;
    }

    function emergencyWithdraw(uint256 campaignId) external onlyOwner {
        CampaignDetails memory campaign = campaigns[campaignId];

        if (campaign.tokenType == TokenType.ERC721) {
            IERC721 nftContract = IERC721(campaign.nftAddress);

            // Transfer each NFT from campaign creator to contract
            for (uint256 i = 0; i < campaign.tokenIds.length; i++) {
                nftContract.transferFrom(msg.sender, address(this), campaign.tokenIds[i]);
            }
        } 
        else if (campaign.tokenType == TokenType.ERC1155) {
            IERC1155 nftContract = IERC1155(campaign.nftAddress);

            // Transfer each token from campaign creator to contract
            for (uint256 i = 0; i < campaign.tokenIds.length; i++) {
                nftContract.safeTransferFrom(msg.sender, address(this), campaign.tokenIds[i], campaign.rewardAmount, "");
            }
        }
        else {
            revert();
        }
    }
}
