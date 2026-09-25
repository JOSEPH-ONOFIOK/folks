import { NextResponse } from "next/server";
import addresses from "@/data/folklist.json";
import { proofFromTree, treeFor } from "@/lib/merkle";
import { isValidEvmAddress } from "@/lib/allowlist";

export const runtime = "nodejs";

// The 183k-leaf tree is built once and reused; rebuilding per request would
// add ~700ms to every mint.
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const address = (body as { address?: unknown })?.address;
  if (typeof address !== "string" || !isValidEvmAddress(address)) {
    return NextResponse.json({ error: "Invalid address." }, { status: 400 });
  }

  const { tree, root } = treeFor(addresses as string[]);
  const proof = proofFromTree(tree, address);

  // An empty proof means the address is not a leaf, unless the tree is a
  // single leaf that happens to be this address.
  if (proof.length === 0) {
    return NextResponse.json({ eligible: false, proof: [], root });
  }

  return NextResponse.json({ eligible: true, proof, root });
}
