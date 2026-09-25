"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

const SUPPLY = 10000;
const TEAM_RESERVE = 150;
// Gas runs about $0.10 a mint, but the page says "free + gas" rather than
// quoting a figure that moves with the network.
const PUBLIC_PRICE = 0.5;

const ART = [
  "/folk-1.jpg",
  "/folk-2.jpg",
  "/folk-3.jpg",
  "/folk-4.jpg",
  "/folk-5.jpg",
];

// Team mints first, then folklist, then public.
type Phase = "team" | "folklist" | "public";

// Folklist opens at a fixed instant; the countdown reads from it.
const MINT_START = new Date("2026-09-23T16:10:00Z");

function useEthPrice() {
  const [usd, setUsd] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/eth-price");
        const data = (await res.json()) as { usd: number | null };
        if (alive) setUsd(data.usd);
      } catch {
        // leave it null; the page shows dollars only
      }
    };
    load();
    const id = setInterval(load, 60000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return usd;
}

// Enough precision to be honest about a sub-dollar fee.
const eth = (usdAmount: number, rate: number) => {
  const v = usdAmount / rate;
  return v < 0.001 ? v.toFixed(6) : v.toFixed(4);
};

function useCountdown(target: Date) {
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setLeft(target.getTime() - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);

  if (left === null) return null;
  const ms = Math.max(0, left);
  return {
    days: Math.floor(ms / 86400000),
    hours: Math.floor(ms / 3600000) % 24,
    mins: Math.floor(ms / 60000) % 60,
    secs: Math.floor(ms / 1000) % 60,
  };
}

export default function MintPage() {
  const [phase, setPhase] = useState<Phase>("team");
  const [qty, setQty] = useState(1);
  const [active, setActive] = useState(0);
  const [hovering, setHovering] = useState(false);
  const [tookOver, setTookOver] = useState(false);
  const [connected, setConnected] = useState(false);
  const [address, setAddress] = useState("");
  const [listed, setListed] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const cd = useCountdown(MINT_START);
  const ethUsd = useEthPrice();
  // Prices read in ETH first; the swap button flips to USD.
  const [inEth, setInEth] = useState(true);

  // Folklist is gated by the allowlist; public is open to anyone; team
  // never mints from this page.
  const eligible =
    phase === "public" ? true : phase === "folklist" ? listed === true : false;

  const short = (a: string) =>
    a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;

  // Ask the server whether this wallet is on the folklist. The list itself
  // stays server-side; only the verdict for this one address comes back.
  async function check(addr: string) {
    setChecking(true);
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: addr }),
      });
      const data = (await res.json()) as { status: string };
      setListed(data.status === "eligible");
      setConnected(true);
    } catch {
      setListed(null);
    } finally {
      setChecking(false);
    }
  }

  // Cycle the hero art on its own. Hovering pauses it; picking a
  // thumbnail hands control to the viewer for good.
  useEffect(() => {
    if (hovering || tookOver) return;
    const id = setInterval(() => setActive((i) => (i + 1) % ART.length), 1400);
    return () => clearInterval(id);
  }, [hovering, tookOver]);

  // Team is fully minted; the rest share one pool of what's left.
  const minted = phase === "team" ? TEAM_RESERVE : TEAM_RESERVE;
  const cap = phase === "team" ? TEAM_RESERVE : SUPPLY;
  const pct = (minted / cap) * 100;

  return (
    <div className="mintPage">
      <header className="topbar">
        <div className="brandRow">
          <Image
            className="brandMark"
            src="/folk.jpg"
            alt=""
            width={44}
            height={44}
            priority
          />
          <div>
            <h1 className="brandName">FOLKS</h1>
            <div className="brandMeta">
              <span className="tag">SEP 2026</span>
            </div>
          </div>
        </div>

        <div className="headRight">
          {connected ? (
            <button
              className="connectBtn on"
              type="button"
              onClick={() => {
                setConnected(false);
                setListed(null);
                setAddress("");
              }}
              title="Disconnect"
            >
              <span className={`wDot ${listed ? "ok" : "no"}`} />
              {short(address)}
            </button>
          ) : (
            <form
              className="connectForm"
              onSubmit={(e) => {
                e.preventDefault();
                if (address.trim()) check(address.trim());
              }}
            >
              <input
                className="addrInput"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Paste wallet address"
                spellCheck={false}
                autoComplete="off"
                aria-label="Wallet address"
              />
              <button className="connectBtn" type="submit" disabled={checking}>
                {checking ? "CHECKING…" : "CONNECT WALLET"}
              </button>
            </form>
          )}

        <div className="countdown">
          <span className="cdLabel">MINTING IN</span>
          <div className="cdBoxes">
            {(cd
              ? ([
                  ["DAYS", cd.days],
                  ["HOURS", cd.hours],
                  ["MINS", cd.mins],
                  ["SECS", cd.secs],
                ] as const)
              : ([
                  ["DAYS", null],
                  ["HOURS", null],
                  ["MINS", null],
                  ["SECS", null],
                ] as const)
            ).map(([label, v]) => (
              <div className="cdBox" key={label}>
                <b>{v === null ? "--" : String(v).padStart(2, "0")}</b>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>
        </div>
      </header>

      <nav className="tabs">
        <span className="tab on">Mint</span>
      </nav>

      <main className="cols">
        {/* left — artwork */}
        <section className="artCol">
          <div
            className="artFrame"
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
          >
            <Image
              key={ART[active]}
              src={ART[active]}
              alt="A Folks character"
              width={880}
              height={880}
              className="artImg"
              priority
            />
          </div>
          <div className="thumbs">
            {ART.map((src, i) => (
              <button
                key={src}
                className={`thumb ${i === active ? "on" : ""}`}
                onClick={() => {
                  setActive(i);
                  setTookOver(true);
                }}
                aria-label={`View Folk ${i + 1}`}
              >
                <Image src={src} alt="" width={120} height={120} />
              </button>
            ))}
          </div>
          <p className="tagline">be your own type.</p>
          <p className="blurb">
            <strong>10,000</strong> characters for <strong>10,000</strong> folks.
          </p>
        </section>

        {/* right — mint */}
        <section className="mintCol">
          <div className="panel">
            <div className="panelHead">
              <h2 className="panelTitle">
                {phase === "team"
                  ? "TEAM"
                  : phase === "folklist"
                    ? "FOLKLIST"
                    : "PUBLIC"}
              </h2>
              <span className={`badge ${phase}`}>
                {phase === "team"
                  ? "Reserved"
                  : phase === "folklist"
                    ? "Whitelist"
                    : "Open"}
              </span>
            </div>

            <p className="panelNote">
              {phase === "team"
                ? "Reserved. Minted by the team, not open to the public."
                : phase === "folklist"
                  ? !connected
                    ? "Opens 4:10pm UTC · Connect to check eligibility."
                    : eligible
                      ? "You're eligible. Mint is open."
                      : "This wallet isn't on the folklist. You can mint in the public phase."
                  : "Unminted whitelist supply rolls into this phase. Whitelist and public share one pool of the remaining supply."}
            </p>

            {/* progress */}
            <div className="progress">
              <div className="progHead">
                <span>MINTED</span>
                <b>
                  {minted.toLocaleString()} / {cap.toLocaleString()}
                </b>
              </div>
              <div className="track">
                <span className="fill" style={{ width: `${pct}%` }} />
                <i className="tick t25" />
                <i className="tick t50" />
                <i className="tick t75" />
              </div>
              <div className="ticks">
                <span>25%</span>
                <span>50%</span>
                <span>75%</span>
              </div>
            </div>

            {phase !== "team" && (
              <>
                <div className="qtyRow">
                  <button
                    className="qtyBtn"
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    disabled={qty <= 1}
                    aria-label="Decrease quantity"
                  >
                    −
                  </button>
                  <span className="qtyValue" aria-live="polite">
                    {qty}
                  </span>
                  <button
                    className="qtyBtn"
                    onClick={() => setQty((q) => q + 1)}
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>

                <div className="actionRow">
                  <button
                    className="mintBtn"
                    type="button"
                    disabled={connected && !eligible}
                    onClick={() => {
                      if (!connected) {
                        document
                          .querySelector<HTMLInputElement>(".addrInput")
                          ?.focus();
                      }
                    }}
                  >
                    {!connected
                      ? "CONNECT WALLET"
                      : eligible
                        ? "MINT"
                        : "NOT ELIGIBLE"}
                  </button>

                  {connected && (
                    <span className={`elig ${eligible ? "yes" : "no"}`}>
                      {eligible ? "✓ Eligible" : "Not eligible"}
                    </span>
                  )}
                </div>

                <p className="totalLine">
                  {qty} Folk{qty > 1 ? "s" : ""} ={" "}
                  {phase === "public" ? "Price + network gas" : "FREE + network gas"}
                </p>
                {(() => {
                  const due = (phase === "public" ? PUBLIC_PRICE : 0) * qty;
                  const showEth = inEth && ethUsd;
                  const pending = inEth && !ethUsd;
                  return (
                    <p className="totalConv">
                      <strong>
                        {due === 0
                          ? "FREE"
                          : showEth
                            ? `${eth(due, ethUsd)} ETH`
                            : pending
                              ? "… ETH"
                              : `$${due.toFixed(2)}`}
                      </strong>
                      {ethUsd && due > 0 && (
                        <button
                          className="swap"
                          type="button"
                          onClick={() => setInEth((v) => !v)}
                          title={`Show in ${inEth ? "USD" : "ETH"}`}
                          aria-label={`Convert to ${inEth ? "USD" : "ETH"}`}
                        >
                          ⇄
                        </button>
                      )}
                    </p>
                  );
                })()}
              </>
            )}
          </div>

          <div className="schedule">
            <h3 className="schedTitle">MINT SCHEDULE</h3>

            <button
              className={`sched ${phase === "team" ? "on" : ""}`}
              onClick={() => setPhase("team")}
            >
              <span className="dot" />
              <span className="schedBody">
                <span className="schedName">
                  TEAM <span className="pill">Reserved</span>
                </span>
                <span className="schedWhen">
                  Minted by the team, not open to the public
                </span>
              </span>
              <span className="schedCost">FREE</span>
            </button>

            <button
              className={`sched ${phase === "folklist" ? "on" : ""}`}
              onClick={() => {
                setPhase("folklist");
                setQty(1);
              }}
            >
              <span className="dot" />
              <span className="schedBody">
                <span className="schedName">
                  FOLKLIST <span className="pill">Whitelist</span>
                </span>
                <span className="schedWhen">
                  Opens 4:10pm UTC · Connect to check eligibility
                </span>
              </span>
              <span className="schedCost">FREE + gas</span>
            </button>

            <button
              className={`sched ${phase === "public" ? "on" : ""}`}
              onClick={() => {
                setPhase("public");
                setQty(1);
              }}
            >
              <span className="dot" />
              <span className="schedBody">
                <span className="schedName">
                  PUBLIC <span className="pill">Open</span>
                </span>
                <span className="schedWhen">
                  Shares one pool with unminted whitelist supply
                </span>
              </span>
              <span className="schedCost">
                {inEth
                  ? ethUsd
                    ? `${eth(PUBLIC_PRICE, ethUsd)} ETH`
                    : "… ETH"
                  : `$${PUBLIC_PRICE.toFixed(2)}`}{" "}
                + gas
              </span>
            </button>
          </div>

        </section>
      </main>

      <footer className="pageFoot">
        <div className="footInner">
          <div className="footBrand">
            <Image
              src="/folk.jpg"
              alt=""
              width={28}
              height={28}
              className="footMark"
            />
            <span>FOLKS</span>
          </div>

          <p className="footRate">
            {ethUsd ? (
              <>
                <span className="rDot" />
                ETH $
                {ethUsd.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
                <span className="rNote"> · live, updates every 60s</span>
              </>
            ) : (
              <span className="rNote">ETH price unavailable</span>
            )}
          </p>

          <p className="footNote">
            No creator royalties · Secondary on OpenSea · Robinhood Chain
          </p>
        </div>
      </footer>
    </div>
  );
}
