import { MerkleTree } from "merkletreejs";
import keccak256 from "keccak256";

// Leaves are keccak256(address) over the 20 raw bytes, matching the
// contract's keccak256(abi.encodePacked(msg.sender)).
function leafOf(address: string): Buffer {
  return keccak256(Buffer.from(address.slice(2), "hex"));
}

export function buildTree(addresses: string[]): MerkleTree {
  const leaves = addresses.map((a) => leafOf(a.toLowerCase()));
  // sortPairs matches OpenZeppelin's MerkleProof, which sorts each pair.
  return new MerkleTree(leaves, keccak256, { sortPairs: true });
}

export function rootOf(addresses: string[]): string {
  return "0x" + buildTree(addresses).getRoot().toString("hex");
}

export function proofFor(addresses: string[], address: string): string[] {
  const tree = buildTree(addresses);
  return tree.getHexProof(leafOf(address.toLowerCase()));
}

// Building a 183k-leaf tree per request is wasteful; keep one in memory.
let cached: { tree: MerkleTree; root: string } | null = null;

export function treeFor(addresses: string[]) {
  if (!cached) {
    const tree = buildTree(addresses);
    cached = { tree, root: "0x" + tree.getRoot().toString("hex") };
  }
  return cached;
}

export function resetTree() {
  cached = null;
}

export function proofFromTree(tree: MerkleTree, address: string): string[] {
  return tree.getHexProof(leafOf(address.toLowerCase()));
}
