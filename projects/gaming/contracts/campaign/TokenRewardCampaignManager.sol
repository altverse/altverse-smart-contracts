// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import '@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol';

import "./TokenRewardCampaign.sol";

contract TokenRewardCampaignManager is Ownable {
    // State variables
    TokenRewardCampaign[] public campaigns;
    mapping(address => bool) public isCampaign;

    // Events
    event CampaignCreated(address campaign);
    event CampaignApproved(address campaign);
    event CampaignDisapproved(address campaign);
    event CampaignStopped(address campaign);
    event CampaignResumed(address campaign);

    modifier onlyCampaignOwner(address campaignAddress) {
        TokenRewardCampaign targetCampaign = TokenRewardCampaign(campaignAddress);

        require(msg.sender == targetCampaign.owner(), "Only owner can approve campaigns");
        _;
    }

    // Function to create a new campaign
    function createCampaign(address _rewardToken, uint256 _rewardAmount, uint256 _goal, uint256 _rewardPerUser, TokenRewardCampaign.CampaignType _campaignType) public {
        TokenRewardCampaign newCampaign = new TokenRewardCampaign(msg.sender, _rewardToken, _goal, _rewardPerUser, _campaignType);
        campaigns.push(newCampaign);
        isCampaign[address(newCampaign)] = true;

        TransferHelper.safeApprove(
            _rewardToken,
            address(newCampaign),
            _rewardAmount
        );

        TransferHelper.safeTransferFrom(
            _rewardToken,
            msg.sender,
            address(newCampaign),
            _rewardAmount
        );

        emit CampaignCreated(address(newCampaign));
    }

    // Function to approve a campaign
    function approveCampaign(address campaignAddress) public onlyCampaignOwner(campaignAddress) {
        require(isCampaign[campaignAddress], "Campaign does not exist");

        TokenRewardCampaign(campaignAddress).startCampaign();

        emit CampaignApproved(campaignAddress);
    }

    // Function to disapprove a campaign
    function disapproveCampaign(address campaignAddress) public onlyCampaignOwner(campaignAddress) {
        require(isCampaign[campaignAddress], "Campaign does not exist");

        TokenRewardCampaign(campaignAddress).withdrawFunds();

        emit CampaignDisapproved(campaignAddress);
    }

    // Function to stop a campaign
    // function stopCampaign(address campaignAddress) public onlyOwner {
    //     require(isCampaign[campaignAddress], "Campaign does not exist");

    //     Campaign(campaignAddress).stopCampaign();

    //     emit CampaignStopped(campaignAddress);
    // }

    // Function to resume a campaign
    // function resumeCampaign(address campaignAddress) public onlyOwner {
    //     require(isCampaign[campaignAddress], "Campaign does not exist");

    //     Campaign(campaignAddress).startCampaign();

    //     emit CampaignResumed(campaignAddress);
    // }
}
