import { KalypsoSdk } from "kalypso-sdk";
import { ethers } from "ethers";
import BigNumber from "bignumber.js";
import dotenv from "dotenv";

const kalypsoConfig = {
  payment_token: "0x01d84D33CC8636F83d2bb771e184cE57d8356863",
  staking_token: "0xdb69299dDE4A00c99b885D9f8748B2AeD1Fe4Ed4",
  mock_attestation_verifier: "0x1dC40628443D93eA82945a9206e0b527BA3EA028",
  attestation_verifier: "0x63EEf1576b477Aa60Bfd7300B2C85b887639Ac1b",
  entity_registry: "0xFFf22f221B9dB47a43cA5c8f48f7915c7957539c",
  generator_registry: "0xCf30295AfC4F12FfAC6EE96Da3607e7749881BA7",
  dispute: "0x48b28BC18E9d9EcDFa7A2CF8b1DDa2668bC005b2",
  proof_market_place: "0xBD3700b9e4292C4842e6CB87205192Fa96e8Ed05",
  transfer_verifier_wrapper: "0x30A5fFf0D0d54fab407a409467835e56830a7471",
  zkb_verifier_wrapper: "0xeE89C22838a691d03fB3b6f47C387d06917C0bBD",
  priority_list: "0x138e29f7804Bfe8225E431c79764663620AEac54",
  input_and_proof_format: "0x43F4159c011f6d05957182748C1F2b77C74fFDB5",
  tee_verifier_deployer: "0x5acCC2F599045D13EA03e4c2b7b0Ed9F8C7Fb99C",
  generatorEnclave: {
    url: "http://3.109.54.190:5000",
    utilityUrl: "http://3.109.54.190:1500"
  },
  ivsEnclave: {
    url: "http://not deployed yet:5000",
    utilityUrl: "http://not deployed yet:1500"
  },
  matchingEngineEnclave: {
    url: "http://13.201.131.193:5000",
    utilityUrl: "http://13.201.131.193:1500"
  },
  checkInputUrl: "http://not deployed yet:3030",
  attestationVerifierEndPoint: "http://13.201.207.60:1400"
};

dotenv.config();

type createAskAndGetProofParams = {
  pub: any;
  sec: any;
};

const createAskAndGetProof = async (
  createAskAndGetProofParams: createAskAndGetProofParams,
) => {
  try {
    if (
      process.env.PRIVATE_KEY == null ||
      process.env.PRIVATE_KEY == undefined
    ) {
      throw new Error(
        "PRIVATE_KEY not found in the .env file. Please make sure to setup environment variables in your project.",
      );
    }

    if (process.env.RPC == null || process.env.RPC == undefined) {
      throw new Error(
        "RPC not found in the .env file. Please make sure to setup environment variables in your project.",
      );
    }

    if (process.env.MARKET_ID == null || process.env.MARKET_ID == undefined) {
      throw new Error("MARKET_ID not found in .env file");
    }

    if (
      process.env.PROOF_REWARD == null ||
      process.env.PROOF_REWARD == undefined
    ) {
      throw new Error("PROOF_REWARD not found in .env file");
    }

    if (
      createAskAndGetProofParams.pub == null ||
      createAskAndGetProofParams.pub == undefined
    ) {
      throw new Error("Public input not found");
    }

    if (
      createAskAndGetProofParams.sec == null ||
      createAskAndGetProofParams.sec == undefined
    ) {
      throw new Error("Secret input not found");
    }

    let input = createAskAndGetProofParams.pub;
    let secret = createAskAndGetProofParams.sec;

    const provider = new ethers.JsonRpcProvider(process.env.RPC);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

    console.log("using address", await wallet.getAddress());

    let abiCoder = new ethers.AbiCoder();

    let inputBytes = abiCoder.encode(["string[1]"], [[input]]);
    console.log({ inputBytes });

    const reward = process.env.PROOF_REWARD;

    const kalypso = new KalypsoSdk(wallet, kalypsoConfig);

    const secretString = JSON.stringify(secret);

    const latestBlock = await provider.getBlockNumber();

    const marketId = process.env.MARKET_ID;
    const assignmentDeadline = new BigNumber(latestBlock).plus(10000000000);
    console.log({
      latestBlock,
      assignmentDeadline: assignmentDeadline.toFixed(0),
    });
    const proofGenerationTimeInBlocks = new BigNumber(10000000000);

    // Create ASK request
    const askRequest = await kalypso.MarketPlace().createAsk(
      marketId,
      inputBytes,
      reward,
      assignmentDeadline.toFixed(0),
      proofGenerationTimeInBlocks.toFixed(0),
      await wallet.getAddress(),
      0, // TODO: keep this 0 for now
      Buffer.from(secretString),
      false,
    );
    await askRequest.wait();
    console.log("Ask Request Hash: ", askRequest.hash);

    let receipt = await provider.getTransactionReceipt(askRequest.hash);

    let askId = await kalypso.MarketPlace().getAskId(receipt!);
    console.log("Ask ID :", askId);

    if (askId) {
      return await new Promise((resolve) => {
        console.log("\nTrying to fetch proof...\n");
        let intervalId = setInterval(async () => {
          let data = await kalypso
            .MarketPlace()
            .getProofByAskId(askId.toString(), receipt?.blockNumber || 0);
          if (data?.proof_generated) {
            console.log(data.message);
            let abiCoder = new ethers.AbiCoder();
            const decoded = abiCoder.decode(
              ["bytes", "bytes", "bytes"],
              data.proof,
            );

            const inputs = decoded[0];
            const proof = decoded[1];
            const signature = decoded[2];

            console.log({ inputs, proof, signature });

            const proofBuffer = Buffer.from(proof.split('0x')[1], "hex");
            const decoder = new TextDecoder("utf-8");
            const proofString = decoder.decode(proofBuffer);
            console.log({ proofString });
            resolve(proofString);
            clearInterval(intervalId);
          } else {
            console.log(`Proof not submitted yet for askId : ${askId}.`);
          }
        }, 10000);
      });
    }
  } catch (err) {
    console.log(err);
  }
};

//Get version
export const getVersion = async (req: any, res: any) => {
  try {
    res.status(200).json({
      ref: "test",
      commitHash: "test",
    });
  } catch (error) {
    console.log(error);
  }
};

//Generate Proof for the public and secret input
export const proveTransaction = async (req: any, res: any) => {
  try {
    let public_input = req.body?.public;
    let secret_input = req.body?.secret;
    let proof = await createAskAndGetProof({
      pub: public_input,
      sec: secret_input,
    });
    res.status(200).send(proof);
  } catch (error) {
    console.log(error);
  }
};
