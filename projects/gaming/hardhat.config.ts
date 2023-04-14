import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-etherscan";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.9", // Your desired Solidity version
    settings: {
      optimizer: {
        enabled: true,
        runs: 200, // Adjust the number of runs according to your needs
      },
    },
  },
  networks: {},
  etherscan: {
    // API key for Etherscan
    // Obtain one at https://etherscan.io/
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
};

export default config;
