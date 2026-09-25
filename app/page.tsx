"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

type Result =
  | { status: "eligible"; address: string; tier: string | null; points: number | null }
  | { status: "not_eligible"; address: string }
  | { status: "invalid"; reason: string };

export default function Home() {
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onCheck(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const data = (await res.json()) as Result;
      setResult(data);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="wrap">
      <div className="card">
        <Image
          className="avatar"
          src="/folk.jpg"
          alt="A Folks character"
          width={72}
          height={72}
          priority
        />
        <p className="kicker">FOLKS</p>
        <h1>Whitelist Checker</h1>
        <p className="sub">
          Paste a wallet address to see if it&apos;s on the eligibility list.
        </p>

        <form onSubmit={onCheck} className="form">
          <input
            className="input"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="0x…"
            spellCheck={false}
            autoComplete="off"
            aria-label="Wallet address"
          />
          <button className="btn" type="submit" disabled={loading}>
            {loading ? "Checking…" : "Check"}
          </button>
        </form>

        {error && <div className="msg err">{error}</div>}

        {result?.status === "eligible" && (
          <div className="msg ok">
            <div className="big">✓ Eligible</div>
            <div className="mono">{result.address}</div>
            <Link className="toMint" href="/mint">
              Go to mint →
            </Link>
            <div className="meta">
              {result.tier && <span className="pill">{result.tier}</span>}
              {result.points != null && <span className="pill">{result.points.toLocaleString()} pts</span>}
            </div>
          </div>
        )}

        {result?.status === "not_eligible" && (
          <div className="msg no">
            <div className="big">Not on the list</div>
            <div className="mono">{result.address}</div>
            <p className="hint">
              This address isn&apos;t in the current allowlist. You can still
              mint in the public phase.
            </p>
            <Link className="toMint" href="/mint">
              Go to mint →
            </Link>
          </div>
        )}

        {result?.status === "invalid" && <div className="msg err">{result.reason}</div>}

        <p className="foot">
          <Link href="/mint">Mint</Link>
        </p>
      </div>
    </main>
  );
}
