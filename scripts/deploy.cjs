// Deploys Folks. Reads config from the environment so no key is ever
// committed. Run with DRY_RUN=1 first to rehearse against a local chain.
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const ROOT = path.join(__dirname, "..");
const art = JSON.parse(fs.readFileSync(path.join(ROOT, ".hh-artifacts-folks.json"), "utf8"));
const listRoot = require(path.join(ROOT, "data", "folklist-root.json"));

function need(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing ${name}. See .env.deploy.example.`);
    process.exit(1);
  }
  return v;
}

(async () => {
  const RPC = need("DEPLOY_RPC_URL");
  const KEY = need("DEPLOY_PRIVATE_KEY");
  const OWNER = process.env.OWNER_ADDRESS || "";
  const FEE_RECIPIENT = need("FEE_RECIPIENT");

  // Prices in ETH. Folklist is free; public and the fee are set from the
  // drop plan and can be changed later from the admin panel.
  const FOLKLIST_PRICE = ethers.parseEther(process.env.FOLKLIST_PRICE ?? "0");
  const PUBLIC_PRICE = ethers.parseEther(process.env.PUBLIC_PRICE ?? "0.0002");
  const PLATFORM_FEE = ethers.parseEther(process.env.PLATFORM_FEE ?? "0.00004");
  const BASE_URI = process.env.BASE_URI ?? "";

  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(KEY, provider);
  const owner = OWNER || wallet.address;

  const net = await provider.getNetwork();
  const balance = await provider.getBalance(wallet.address);

  console.log("network       :", net.name === "unknown" ? `chain ${net.chainId}` : net.name, `(${net.chainId})`);
  console.log("deployer      :", wallet.address);
  console.log("balance       :", ethers.formatEther(balance), "ETH");
  console.log("owner         :", owner);
  console.log("fee recipient :", FEE_RECIPIENT);
  console.log("folklist price:", ethers.formatEther(FOLKLIST_PRICE), "ETH");
  console.log("public price  :", ethers.formatEther(PUBLIC_PRICE), "ETH");
  console.log("platform fee  :", ethers.formatEther(PLATFORM_FEE), "ETH");
  console.log("base URI      :", BASE_URI || "(none yet)");
  console.log("folklist root :", listRoot.root, `(${listRoot.count.toLocaleString()} wallets)`);

  if (balance === 0n) {
    console.error("\nDeployer has no funds on this network.");
    process.exit(1);
  }

  const factory = new ethers.ContractFactory(art.abi, art.bytecode, wallet);
  const estimateOnly = await factory.getDeployTransaction(
    owner, FOLKLIST_PRICE, PUBLIC_PRICE, PLATFORM_FEE, FEE_RECIPIENT, BASE_URI,
  );
  const gas = await provider.estimateGas({ data: estimateOnly.data });
  const feeData = await provider.getFeeData();
  const price = feeData.maxFeePerGas ?? feeData.gasPrice ?? 0n;
  console.log("\nest. deploy gas:", gas.toString(), "≈", ethers.formatEther(gas * price), "ETH");

  if (process.env.DRY_RUN === "1") {
    console.log("\nDRY RUN — nothing was sent.");
    return;
  }

  console.log("\nDeploying…");
  const c = await factory.deploy(owner, FOLKLIST_PRICE, PUBLIC_PRICE, PLATFORM_FEE, FEE_RECIPIENT, BASE_URI);
  const deployReceipt = await c.deploymentTransaction().wait();
  const address = await c.getAddress();
  console.log("deployed at   :", address, `(block ${deployReceipt.blockNumber})`);

  console.log("Setting folklist root…");
  // Some nodes report a "pending" nonce behind "latest" right after a
  // deployment, and ethers would then reuse a spent nonce. Take the higher.
  const [latestN, pendingN] = await Promise.all([
    provider.getTransactionCount(wallet.address, "latest"),
    provider.getTransactionCount(wallet.address, "pending"),
  ]);
  await (await c.setFolklistRoot(listRoot.root, {
    nonce: Math.max(latestN, pendingN),
  })).wait();
  const onChainRoot = await c.folklistRoot();
  if (onChainRoot.toLowerCase() !== listRoot.root.toLowerCase()) {
    throw new Error("root did not stick — set it from /admin before the sale");
  }
  console.log("root set and verified.");

  console.log("\nDone. Next:");
  console.log(`  1. Put this in your env:  NEXT_PUBLIC_CONTRACT_ADDRESS=${address}`);
  console.log("  2. Open /admin, connect as owner, set the sale time and team mint.");
  fs.writeFileSync(path.join(ROOT, "deployed.json"),
    JSON.stringify({ address, chainId: Number(net.chainId), root: listRoot.root, at: new Date().toISOString() }, null, 2));
})().catch((e) => { console.error("\nFailed:", e.shortMessage || e.message); process.exit(1); });
