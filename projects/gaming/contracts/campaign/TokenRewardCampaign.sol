// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import '@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol';

contract TokenRewardCampaign is Ownable, ReentrancyGuard {
    using SafeMath for uint256;

    enum CampaignType { FCFS, Raffle }
    CampaignType public campaignType;

    mapping(address => uint256) nonces;

    address governer;

    // State variables
    ERC20 public rewardToken;
    bool public started;
    bool public finished;
    uint256 public totalParticipants;

    mapping(address => bool) public hasClaimedRaffleReward;

    uint256 public rewardSeats;

    // For FCFS
    uint256 public rewardPerUser;

    // For Raffle
    address[] public participants;
    mapping(address => bool) public isParticipant;
    address[] public winners;

    // Events
    event CampaignStarted();
    event CampaignFinished();
    event UserParticipated(address user);
    event RewardClaimed(address user, uint256 amount);

    modifier onlyRaffle {
        require(campaignType == CampaignType.Raffle, "Not a raffle campaign");
        _;
    }

    modifier onlyAdmins {
        require(msg.sender == owner() || msg.sender == governer, "Not admins");
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

    constructor(address _owner, address _rewardToken, uint256 _amount, uint256 _rewardSeats, CampaignType _campaignType, address _governer) {
        transferOwnership(_owner);

        rewardToken = ERC20(_rewardToken);
        rewardPerUser = _amount.div(_rewardSeats);
        rewardSeats = _rewardSeats;
        started = false;
        finished = false;
        campaignType = _campaignType;
        governer = _governer;
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
    function withdrawFunds() public onlyOwner whenNotStarted nonReentrant {
        uint256 balance = rewardToken.balanceOf(address(this));
        require(balance > 0, "No funds to withdraw");

        rewardToken.transfer(owner(), balance);
    }

    function getMessageDigest(address user, uint256 nonce) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(user, nonce));
    }

    function recoverSigner(bytes32 message, bytes memory sig) internal pure returns (address) {
        uint8 v;
        bytes32 r;
        bytes32 s;

        if (sig.length != 65) {
            return (address(0));
        }

        assembly {
            r := mload(add(sig, 0x20))
            s := mload(add(sig, 0x40))
            v := byte(0, mload(add(sig, 0x60)))
        }

        if (v < 27) {
            v += 27;
        }

        if (v != 27 && v != 28) {
            return (address(0));
        } else {
            return ecrecover(message, v, r, s);
        }
    }

    // Function to participate in a campaign
    function participate(uint256 nonce, bytes memory signature) public whenStarted nonReentrant {
        require(!finished, "Campaign finished");
        require(!isParticipant[msg.sender], "Already participated");

        bytes32 messageDigest = getMessageDigest(msg.sender, nonce);
        address recoveredAddress = recoverSigner(messageDigest, signature);
        
        require(recoveredAddress == msg.sender, "Invalid signature");
        require(nonce > nonces[msg.sender], "Nonce must be higher than before");

        nonces[msg.sender] = nonce;

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
    function finishRaffleCampaign() public onlyAdmins {
        require(!finished, "Campaign already finished");
        finished = true;

        // Pick the winners
        for (uint i = 0; i < rewardSeats; i++) {
            if (participants.length > 0) {
                uint256 randomIndex = pseudoRandomNumber(participants.length);
                winners.push(participants[randomIndex]);

                // Remove the winner from the participants array to prevent them from being picked again
                participants[randomIndex] = participants[participants.length - 1];
                participants.pop();
            }
        }

        emit CampaignFinished();
    }

    function pseudoRandomNumber(uint256 _range) public view returns (uint256) {
        bytes32 hash = keccak256(abi.encodePacked(block.timestamp, block.difficulty));
        uint256 random = uint256(hash) % _range;
        return random;
    }

    // Function to claim reward for Raffle
    function claimRaffleReward() public nonReentrant returns (bool won) {
        require(finished, "Campaign not finished");
        require(isParticipant[msg.sender], "Not a participant");
        require(!hasClaimedRaffleReward[msg.sender], "Reward already claimed");

        uint256 rewardBalance = rewardToken.balanceOf(address(this));
        require(rewardBalance >= rewardPerUser, "Not enough rewards left");
        
        hasClaimedRaffleReward[msg.sender] = true;
        won = false;

        // Check if the user is a winner
        for (uint i = 0; i < winners.length; i++) {
            if (winners[i] == msg.sender) {
                rewardToken.transfer(msg.sender, rewardPerUser);
                emit RewardClaimed(msg.sender, rewardPerUser);

                won = true;
                break;
            }
        }
    }
}
