// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import '@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol';
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

import "hardhat/console.sol";


contract NFTRewardCampaign is Ownable, ReentrancyGuard, EIP712, IERC721Receiver, IERC1155Receiver  {
    using ECDSA for bytes32;
    using SafeMath for uint256;

    enum CampaignType { FCFS, Raffle }
    CampaignType public campaignType;

    enum TokenType { ERC721, ERC1155 }

    address governer;
    address creator;

    // State variables
    address public nftAddress;
    uint256[] public tokenIds;
    TokenType public tokenType;
    uint256 public rewardAmount; // Only used for ERC1155
    bool public started;
    bool public finished;
    uint256 public totalParticipants;

    mapping(address => bool) public hasClaimedRaffleReward;

    uint256 public rewardSeats;

    // For Raffle
    address[] public participants;
    mapping(address => bool) public isParticipant;
    address[] public winners;

    // Events
    event CampaignStarted();
    event CampaignFinished();
    event UserParticipated(address indexed user);
    event RewardClaimed(address indexed user, uint256 tokenId);
    
    struct ClaimData {
        address user;
        uint256 campaignId;
        uint256 tokenId;
        uint256 rewardAmount;
        address creator;
    }
    bytes32 internal constant TYPEHASH = keccak256("ClaimData(address user,uint256 campaignId,uint256 tokenId,uint256 rewardAmount,address creator)");

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

    constructor(address _owner, address _nftAddress, uint256[] memory _tokenIds, uint256 _amount, TokenType _tokenType, uint256 _rewardSeats, CampaignType _campaignType, address _governer, address _creator)
        EIP712("NFTRewardCampaign", "1") 
    {
        transferOwnership(_owner);

        require(_tokenIds.length == _rewardSeats, "Actual reward must match seats");

        nftAddress = _nftAddress;
        tokenIds = _tokenIds;
        tokenType = _tokenType;
        rewardSeats = _rewardSeats;
        rewardAmount = _amount;   // ERC1155 only.        

        started = false;
        finished = false;
        campaignType = _campaignType;
        governer = _governer;
        creator = _creator;
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
    function withdrawRewards() public onlyOwner whenNotStarted nonReentrant {
        if (tokenType == TokenType.ERC721) {
            IERC721 nftContract = IERC721(nftAddress);

            // Transfer each NFT from contract to owner
            for (uint256 i = 0; i < tokenIds.length; i++) {
                nftContract.transferFrom(address(this), owner(), tokenIds[i]);
            }

            finished = true;
        } 
        else if (tokenType == TokenType.ERC1155) {
            IERC1155 nftContract = IERC1155(nftAddress);

            // Transfer each token from contract to owner
            for (uint256 i = 0; i < tokenIds.length; i++) {
                nftContract.safeTransferFrom(address(this), owner(), tokenIds[i], rewardAmount, "");
            }

            finished = true;
        }
        else {
            revert();
        }
    }

    // Function to participate in a campaign
    function participate(ClaimData calldata data, bytes calldata signature) public whenStarted nonReentrant {
        require(!finished, "Campaign finished");
        require(!isParticipant[msg.sender], "Already participated");
        require(verifySignature(data, signature), "Invalid signature"); 
        
        totalParticipants += 1;
        participants.push(msg.sender);
        isParticipant[msg.sender] = true;

        emit UserParticipated(msg.sender);

        // Verify the token is part of the campaign
        bool tokenExists = false;
        uint256 tokenIndex;
        for (uint256 i = 0; i < tokenIds.length; i++) {
            if (tokenIds[i] == data.tokenId) {
                tokenExists = true;
                tokenIndex = i;
                break;
            }
        }
        require(tokenExists, "Invalid token");

        // If it's FCFS, distribute reward immediately
        if (campaignType == CampaignType.FCFS) {
            if (tokenType == TokenType.ERC721) {
                // Check if the campaign has enough rewards left
                require(tokenIds.length > 0, "Not enough rewards left");

                // Transfer the NFT to the claimer
                IERC721 nftContract = IERC721(nftAddress);
                nftContract.transferFrom(address(this), msg.sender, data.tokenId);

                // Remove the token from the campaign
                tokenIds[tokenIndex] = tokenIds[tokenIds.length - 1];
                tokenIds.pop();
            } else if (tokenType == TokenType.ERC1155) {
                // Check if the campaign has enough rewards left
                require(rewardAmount >= data.rewardAmount, "Not enough rewards left");

                // Transfer the tokens to the claimer
                IERC1155 nftContract = IERC1155(nftAddress);
                nftContract.safeTransferFrom(address(this), msg.sender, data.tokenId, data.rewardAmount, "");

                // Update the campaign's reward amount
                rewardAmount -= data.rewardAmount;
            }
        }
    }

    function verifySignature(ClaimData calldata _data, bytes calldata _signature) public view returns (bool) {
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            TYPEHASH,
            _data.user,
            _data.campaignId,
            _data.tokenId,
            _data.rewardAmount,
            _data.creator
        )));

        return creator == digest.recover(_signature) && _data.user == msg.sender;
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

        hasClaimedRaffleReward[msg.sender] = true;
        won = false;

        // Check if the user is a winner
        for (uint i = 0; i < winners.length; i++) {
            if (winners[i] == msg.sender) {
                if (tokenType == TokenType.ERC721) {
                    // Check if the campaign has enough rewards left
                    require(tokenIds.length > 0, "Not enough rewards left");
                    
                    // Transfer the NFT to the claimer
                    IERC721 nftContract = IERC721(nftAddress);
                    nftContract.transferFrom(address(this), msg.sender, tokenIds[i]);
                } else if (tokenType == TokenType.ERC1155) {
                    // Check if the campaign has enough rewards left
                    require(rewardAmount >= rewardAmount, "Not enough rewards left");

                    // Transfer the tokens to the claimer
                    IERC1155 nftContract = IERC1155(nftAddress);
                    nftContract.safeTransferFrom(address(this), msg.sender, tokenIds[i], rewardAmount, "");

                    // Update the campaign's reward amount
                    rewardAmount -= rewardAmount;
                }

                emit RewardClaimed(msg.sender, tokenIds[i]);

                won = true;
                break;
            }
        }
    }

    function getParticipants() external view returns (address[] memory) {
        return participants;
    }  

    function getWinners() external view returns (address[] memory) {
        return winners;
    } 

    function onERC721Received(address, address, uint256, bytes calldata)
        external pure override returns(bytes4) {
        return this.onERC721Received.selector;
    }

    function onERC1155Received(
        address,
        address,
        uint256,
        uint256,
        bytes calldata
    )
        external
        pure
        override
        returns(bytes4)
    {
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(
        address,
        address,
        uint256[] calldata,
        uint256[] calldata,
        bytes calldata
    )
        external
        pure
        override
        returns(bytes4)
    {
        return this.onERC1155BatchReceived.selector;
    }
    
    function supportsInterface(bytes4 interfaceId) public pure override(IERC165) returns (bool) {
        return interfaceId == type(IERC721Receiver).interfaceId
            || interfaceId == type(IERC1155Receiver).interfaceId;
    }
}
