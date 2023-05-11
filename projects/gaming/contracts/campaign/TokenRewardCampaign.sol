// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./RandomNumber.sol";

contract TokenRewardCampaign is Ownable {
    enum CampaignType { FCFS, Raffle }
    CampaignType public campaignType;

    // State variables
    ERC20 public rewardToken;
    uint256 public goal;
    bool public started;
    bool public finished;
    uint256 public totalParticipants;
    
    // RandomNumber public randomNumberContract;
    mapping(uint256 => address) public raffleWinners;
    mapping(address => bool) public hasClaimedRaffleReward;

    // For FCFS
    uint256 public rewardPerUser;

    // For Raffle
    address[] public participants;
    mapping(address => bool) public isParticipant;

    // Events
    event CampaignStarted();
    event CampaignFinished();
    event UserParticipated(address user);
    event RewardClaimed(address user, uint256 amount);

    modifier onlyRaffle {
        require(campaignType == CampaignType.Raffle, "Not a raffle campaign");
        _;
    }

    modifier whenStarted {
        require(started, "Campaign not started");
        _;
    }

    modifier whenNotStarted {
        require(!started, "Campaign already started");
        _;
    }

    constructor(address _owner, address _rewardToken, uint256 _goal, uint256 _rewardPerUser, CampaignType _campaignType) {
        transferOwnership(_owner);
        rewardToken = ERC20(_rewardToken);
        goal = _goal;
        rewardPerUser = _rewardPerUser;
        started = false;
        finished = false;
        campaignType = _campaignType;
    }

    // Function to start a campaign
    function startCampaign() public onlyOwner whenNotStarted {
        started = true;

        emit CampaignStarted();
    }

    // Function to stop the campaign
    function stopCampaign() public onlyOwner whenStarted {
        started = false;
    }

    // Function to resume the campaign
    function resumeCampaign() public onlyOwner whenNotStarted {
        started = true;
    }

    // Function to withdraw funds by the owner
    function withdrawFunds() public onlyOwner whenNotStarted{
        uint256 balance = rewardToken.balanceOf(address(this));
        require(balance > 0, "No funds to withdraw");

        rewardToken.transfer(owner, balance);
    }

    // Function to participate in a campaign
    function participate() public whenStarted {
        require(!finished, "Campaign finished");
        require(!isParticipant[msg.sender], "Already participated");

        totalParticipants += 1;
        participants.push(msg.sender);
        isParticipant[msg.sender] = true;

        emit UserParticipated(msg.sender);

        // If it's FCFS, distribute reward immediately
        if (campaignType == CampaignType.FCFS) {
            require(rewardToken.balanceOf(address(this)) >= rewardPerUser, "Not enough rewards left");

            rewardToken.transfer(msg.sender, rewardPerUser);
            emit RewardClaimed(msg.sender, rewardPerUser);

            // Check if all rewards are distributed
            if (rewardToken.balanceOf(address(this)) < rewardPerUser) {
                finished = true;
                emit CampaignFinished();
            }
        }
    }
    
    // Function to finish a raffle campaign
    function finishRaffleCampaign() public onlyOwner onlyRaffle whenStarted {
        require(!finished, "Campaign already finished");

        finished = true;

        // Request a random number
        // randomNumberContract.getRandomNumber(block.timestamp);

        emit CampaignFinished();
    }

    function pseudoRandomNumber(uint256 _range) public view returns (uint256) {
        bytes32 hash = keccak256(abi.encodePacked(block.timestamp, block.difficulty));
        uint256 random = uint256(hash) % _range;
        return random;
    }

    // Function to claim reward for Raffle
    function claimRaffleReward() public onlyRaffle returns (bool won) {
        require(finished, "Campaign not finished");
        require(isParticipant[msg.sender], "Not a participant");
        require(!hasClaimedRaffleReward[msg.sender], "Reward already claimed");
        require(rewardToken.balanceOf(address(this)) >= rewardPerUser, "Not enough rewards left");
        
        hasClaimedRaffleReward[msg.sender] = true;
        won = false;

        // Get the random number
        // uint256 random = randomNumberContract.randomResult();

        // Select a winner based on the random number
        // address winner = participants[random % participants.length];

        // Get a pseudo-random number
        uint256 random = pseudoRandomNumber(participants.length);

        // Select a winner based on the random number
        address winner = participants[random];

        // Check if the user is a winner
        if (msg.sender == winner) {
            raffleWinners[campaignID] = winner;
            rewardToken.transfer(msg.sender, rewardPerUser);
            emit RewardClaimed(msg.sender, rewardPerUser);

            won = true;
        }
    }
}
