// Builds the folklist Merkle root from data/folklist.json.
const fs = require("fs");
const path = require("path");
const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");

const leaf = (a) => keccak256(Buffer.from(a.slice(2), "hex"));

const addrs = JSON.parse(fs.readFileSync(path.join(__dirname,"..","data","folklist.json"), "utf8"));
console.log("addresses:", addrs.length.toLocaleString());

const t0 = Date.now();
const tree = new MerkleTree(addrs.map((a) => leaf(a.toLowerCase())), keccak256, { sortPairs: true });
const root = "0x" + tree.getRoot().toString("hex");
console.log("root      :", root);
console.log("depth     :", tree.getDepth());
console.log("built in  :", ((Date.now() - t0) / 1000).toFixed(1) + "s");

// Spot-check proofs round-trip.
let ok = 0;
for (const i of [0, 1, 500, 90000, addrs.length - 1]) {
  const p = tree.getHexProof(leaf(addrs[i]));
  if (tree.verify(p, leaf(addrs[i]), tree.getRoot())) ok++;
  if (i === 0) console.log("proof len :", p.length, "hashes");
}
console.log("spot check:", ok + "/5 proofs verify");

// An address not on the list must not produce a valid proof.
const bogus = "0x000000000000000000000000000000000000dead";
console.log("outsider  :", tree.verify(tree.getHexProof(leaf(bogus)), leaf(bogus), tree.getRoot()) ? "FAIL (verified!)" : "correctly rejected");

fs.writeFileSync(path.join(__dirname,"..","data","folklist-root.json"), JSON.stringify({ root, count: addrs.length, builtAt: new Date().toISOString() }, null, 2));
console.log("\nwrote data/folklist-root.json");
