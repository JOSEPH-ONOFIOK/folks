// Runs the compiled contract on an in-memory EVM and asserts the rules that
// matter: phase gating, exact payment, supply cap, allowlist proofs.
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");

const art = JSON.parse(fs.readFileSync(path.join(__dirname,"..",".hh-artifacts-folks.json"), "utf8"));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  PASS", m); } else { fail++; console.log("  FAIL", m); } };
async function reverts(p, m) {
  try { await p; fail++; console.log("  FAIL", m, "(did not revert)"); }
  catch { pass++; console.log("  PASS", m); }
}

(async () => {
  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
  const signers = [];
  for (let i = 0; i < 5; i++) signers.push(await provider.getSigner(i));
  const [owner, alice, bob, carol] = signers;
  const FEE_ADDR = "0x000000000000000000000000000000000000bEEF";

  const leaf = a => keccak256(Buffer.from(a.slice(2), "hex"));
  const listed = [await alice.getAddress(), await bob.getAddress()].map(a => a.toLowerCase());
  const tree = new MerkleTree(listed.map(leaf), keccak256, { sortPairs: true });
  const root = "0x" + tree.getRoot().toString("hex");

  const FEE = ethers.parseEther("0.00004");   // ~$0.10
  const FL  = 0n;                              // folklist free
  const PUB = ethers.parseEther("0.0002");     // ~$0.50

  const F = new ethers.ContractFactory(art.abi, art.bytecode, owner);
  const c = await F.deploy(await owner.getAddress(), FL, PUB, FEE, FEE_ADDR, "ipfs://base/");
  await c.waitForDeployment();
  console.log("\ndeployed", await c.getAddress());

  await (await c.setFolklistRoot(root)).wait();
  ok(await c.folklistRoot() === root, "allowlist root set");

  console.log("\n-- before scheduling --");
  ok(await c.phase() === 0n, "phase 0 when unscheduled");
  await reverts(c.connect(alice).publicMint(1, { value: PUB + FEE }), "public mint blocked when unscheduled");
  await reverts(c.connect(alice).folklistMint(1, tree.getHexProof(leaf(listed[0])), { value: FEE }),
    "folklist mint blocked when unscheduled");

  console.log("\n-- team mint --");
  await (await c.teamMint(150)).wait();
  ok(await c.teamMinted() === 150n, "team minted 150");
  await reverts(c.teamMint(1), "team cannot exceed 150 reserve");
  await reverts(c.connect(alice).teamMint(1), "non-owner cannot team mint");

  console.log("\n-- schedule --");
  const now = (await provider.getBlock("latest")).timestamp;
  await (await c.setFolklistStart(now + 100)).wait();
  ok(await c.phase() === 0n, "still phase 0 before start");
  ok(await c.publicStart() === BigInt(now + 100 + 3600), "public opens exactly 1h after folklist");
  await reverts(c.connect(alice).folklistMint(1, tree.getHexProof(leaf(listed[0])), { value: FEE }),
    "cannot mint before start time");

  console.log("\n-- folklist hour --");
  await provider.send("evm_setNextBlockTimestamp", [now + 200]);
  await provider.send("evm_mine", []);
  ok(await c.phase() === 1n, "phase 1 during folklist");

  const pAlice = tree.getHexProof(leaf(listed[0]));
  await (await c.connect(alice).folklistMint(3, pAlice, { value: (FL + FEE) * 3n })).wait();
  ok(await c.balanceOf(await alice.getAddress()) === 3n, "listed wallet minted 3 (no per-wallet cap)");
  await (await c.connect(alice).folklistMint(5, pAlice, { value: (FL + FEE) * 5n })).wait();
  ok(await c.balanceOf(await alice.getAddress()) === 8n, "same wallet minted again, still no cap");

  await reverts(c.connect(carol).folklistMint(1, pAlice, { value: FL + FEE }),
    "unlisted wallet rejected even with someone else's proof");
  await reverts(c.connect(alice).folklistMint(1, pAlice, { value: 0 }), "underpaying platform fee reverts");
  await reverts(c.connect(alice).folklistMint(1, pAlice, { value: (FL + FEE) * 2n }), "overpaying reverts");
  await reverts(c.connect(alice).publicMint(1, { value: PUB + FEE }), "public mint blocked during folklist hour");

  const pBob = tree.getHexProof(leaf(listed[1]));
  const bn0 = await provider.getBlockNumber();
  const feeBefore = await provider.getBalance(FEE_ADDR, bn0);
  const rcBob = await (await c.connect(bob).folklistMint(2, pBob, { value: (FL + FEE) * 2n })).wait();
  const feeAfter = await provider.getBalance(FEE_ADDR, rcBob.blockNumber);
  ok(feeAfter - feeBefore === FEE * 2n,
     `platform fee forwarded (+${ethers.formatEther(feeAfter - feeBefore)} ETH)`);
  ok(await provider.getBalance(await c.getAddress()) === 0n,
     "contract holds no fees (free folklist leaves nothing behind)");

  console.log("\n-- public --");
  await provider.send("evm_setNextBlockTimestamp", [now + 100 + 3601]);
  await provider.send("evm_mine", []);
  ok(await c.phase() === 2n, "phase 2 after the hour");
  await (await c.connect(carol).publicMint(2, { value: (PUB + FEE) * 2n })).wait();
  ok(await c.balanceOf(await carol.getAddress()) === 2n, "anyone can mint in public");
  await reverts(c.connect(alice).folklistMint(1, pAlice, { value: FL + FEE }), "folklist closed once public opens");
  await reverts(c.connect(carol).publicMint(1, { value: PUB }), "public mint without fee reverts");
  ok(await c.mintCost(2) === (PUB + FEE) * 2n, "mintCost quotes price+fee for the live phase");

  console.log("\n-- admin --");
  await (await c.setPrices(ethers.parseEther("0.001"), ethers.parseEther("0.002"))).wait();
  ok(await c.publicPrice() === ethers.parseEther("0.002"), "owner can change price");
  await reverts(c.connect(alice).setPrices(1, 2), "non-owner cannot change price");
  await reverts(c.connect(alice).setFolklistStart(now), "non-owner cannot change time");
  await reverts(c.connect(alice).setFolklistRoot(root), "non-owner cannot change allowlist");

  console.log("\n-- supply cap --");
  ok(await c.MAX_SUPPLY() === 10000n, "max supply is 10,000");
  ok(await c.totalMinted() === 162n, "minted = 150 team + 10 folklist + 2 public");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("harness error:", e.message); process.exit(1); });
