import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Cache the upstream price so a busy mint doesn't burn the keyless
// rate limit — every visitor shares one lookup per minute.
export const revalidate = 60;

type Payload = { usd: number | null; at: string };

async function fromCoinGecko(): Promise<number | null> {
  const res = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
    { next: { revalidate: 60 } },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { ethereum?: { usd?: number } };
  const usd = data?.ethereum?.usd;
  return typeof usd === "number" ? usd : null;
}

async function fromCoinbase(): Promise<number | null> {
  const res = await fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot", {
    next: { revalidate: 60 },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { data?: { amount?: string } };
  const usd = Number(data?.data?.amount);
  return Number.isFinite(usd) ? usd : null;
}

export async function GET() {
  let usd: number | null = null;

  for (const source of [fromCoinGecko, fromCoinbase]) {
    try {
      usd = await source();
      if (usd !== null) break;
    } catch {
      // try the next source
    }
  }

  const body: Payload = { usd, at: new Date().toISOString() };

  // A missing price is not an error here; the page just falls back to
  // showing dollars only rather than printing a wrong ETH figure.
  return NextResponse.json(body, {
    headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" },
  });
}
