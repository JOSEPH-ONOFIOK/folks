import { NextResponse } from "next/server";
import { rootOf } from "@/lib/merkle";

export const runtime = "nodejs";

// Computes a Merkle root from an uploaded address list. This only hashes what
// it is given and stores nothing; the root still has to be signed on-chain by
// the owner, so this endpoint cannot change the live allowlist by itself.
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const addresses = (body as { addresses?: unknown })?.addresses;
  if (!Array.isArray(addresses) || addresses.length === 0) {
    return NextResponse.json({ error: "Send a non-empty address list." }, { status: 400 });
  }
  if (addresses.length > 500_000) {
    return NextResponse.json({ error: "List too large." }, { status: 413 });
  }

  const valid: string[] = [];
  for (const a of addresses) {
    if (typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a)) {
      valid.push(a.toLowerCase());
    }
  }
  if (valid.length === 0) {
    return NextResponse.json({ error: "No valid addresses found." }, { status: 400 });
  }

  const unique = Array.from(new Set(valid));
  return NextResponse.json({ root: rootOf(unique), count: unique.length });
}
