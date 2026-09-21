import { NextResponse } from "next/server";
import { checkAddress } from "@/lib/allowlist";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ status: "invalid", reason: "Malformed request." }, { status: 400 });
  }

  const address = typeof (body as any)?.address === "string" ? (body as any).address : "";
  const result = checkAddress(address);

  // The allowlist itself never leaves the server; we only return the verdict
  // for the single address that was asked about.
  return NextResponse.json(result);
}
