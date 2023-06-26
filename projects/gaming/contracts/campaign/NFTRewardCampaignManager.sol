// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import '@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol';

import "./NFTRewardCampaign.sol";

contract NFTRewardCampaignManager is Ownable {
    // State variables
    NFTRewardCampaign[] public campaigns;
    mapping(address => NFTRewardCampaign[]) public campaignsByCreator;
    mapping(address => bool) public isCampaign;

    // Events
    event CampaignCreated(address campaign);
    event CampaignApproved(address campaign);
    event CampaignDisapproved(address campaign);

    modifier onlyCampaignOwner(address campaignAddress) {
        NFTRewardCampaign targetCampaign = NFTRewardCampaign(campaignAddress);

        require(msg.sender == targetCampaign.owner(), "Only owner can approve campaigns");
        _;
    }

    function getCampaignsByCreator(address creator) external view returns (NFTRewardCampaign[] memory creatorCampagins) {
        creatorCampagins = campaignsByCreator[creator];
    }

    // Function to create a new campaign
    function createCampaign(address _nftAddress, uint256[] calldata _tokenIds, uint256 _amount, NFTRewardCampaign.TokenType _tokenType, uint256 _rewardSeats, NFTRewardCampaign.CampaignType _campaignType) public {
        NFTRewardCampaign newCampaign = new NFTRewardCampaign(msg.sender, _nftAddress, _tokenIds, _amount, _tokenType, _rewardSeats, _campaignType, address(this), owner());
        campaigns.push(newCampaign);
        campaignsByCreator[msg.sender].push(newCampaign);
        isCampaign[address(newCampaign)] = true;

        if (_tokenType == NFTRewardCampaign.TokenType.ERC721) {
            IERC721 nftContract = IERC721(_nftAddress);

            // Transfer each NFT from campaign creator to contract
            for (uint256 i = 0; i < _tokenIds.length; i++) {
                nftContract.approve(address(newCampaign), _tokenIds[i]);               
                nftContract.transferFrom(msg.sender, address(this), _tokenIds[i]);
            }
        } 
        else if (_tokenType == NFTRewardCampaign.TokenType.ERC1155) {
            IERC1155 nftContract = IERC1155(_nftAddress);

            nftContract.setApprovalForAll(address(newCampaign), true);

            // Transfer each token from campaign creator to contract
            for (uint256 i = 0; i < _tokenIds.length; i++) {
                nftContract.safeTransferFrom(msg.sender, address(this), _tokenIds[i], _amount, "");
            }
        }

        require(_rewardSeats == _tokenIds.length, "Reward seat not match rewards amount");

        emit CampaignCreated(address(newCampaign));
    }

    function forceFinishCampaign(address campaignAddress) public onlyCampaignOwner(campaignAddress) {
        NFTRewardCampaign newCampaign = NFTRewardCampaign(campaignAddress);
        newCampaign.finishRaffleCampaign();
    }
 
    // Function to approve a campaign
    function approveCampaign(address campaignAddress) public onlyCampaignOwner(campaignAddress) {
        require(isCampaign[campaignAddress], "Campaign does not exist");

        NFTRewardCampaign(campaignAddress).startCampaign();

        emit CampaignApproved(campaignAddress);
    }

    // Function to disapprove a campaign
    function disapproveCampaign(address campaignAddress) public onlyCampaignOwner(campaignAddress) {
        require(isCampaign[campaignAddress], "Campaign does not exist");

        NFTRewardCampaign(campaignAddress).withdrawRewards();

        emit CampaignDisapproved(campaignAddress);
    }
}
