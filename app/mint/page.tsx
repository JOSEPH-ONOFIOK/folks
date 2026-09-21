"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

const SUPPLY = 10000;
const TEAM_RESERVE = 120;
const FOLKLIST_SUPPLY = 8000;
const PLATFORM_FEE = 0.18;
const PUBLIC_PRICE = 1.5;

const ART = [
  "/folk-1.jpg",
  "/folk-2.jpg",
  "/folk-3.jpg",
  "/folk-4.jpg",
  "/folk-5.jpg",
];

type Phase = "folklist" | "public";
type Tab = "Mint" | "Items" | "Holders" | "Traits" | "Activity";

const TABS: Tab[] = ["Mint", "Items", "Holders", "Traits", "Activity"];

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

// Mint opens at a fixed instant; the countdown reads from it.
const MINT_START = new Date("2026-09-23T09:30:00-07:00");

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
  const [phase, setPhase] = useState<Phase>("folklist");
  const [tab, setTab] = useState<Tab>("Mint");
  const [qty, setQty] = useState(1);
  const [active, setActive] = useState(0);
  const [hovering, setHovering] = useState(false);
  const [tookOver, setTookOver] = useState(false);
  const [minted] = useState(0);
  const cd = useCountdown(MINT_START);

  // Cycle the hero art on its own. Hovering pauses it; picking a
  // thumbnail hands control to the viewer for good.
  useEffect(() => {
    if (hovering || tookOver) return;
    const id = setInterval(
      () => setActive((i) => (i + 1) % ART.length),
      1400,
    );
    return () => clearInterval(id);
  }, [hovering, tookOver]);

  const unitPrice = phase === "folklist" ? 0 : PUBLIC_PRICE;
  const total = (unitPrice + PLATFORM_FEE) * qty;

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
              <span>BY FOLKS</span>
              <span className="tag">SEP 2026</span>
              <span className="tag live">MINTING SOON</span>
            </div>
          </div>
        </div>

        <div className="countdown">
          <span className="cdLabel">MINTING IN</span>
          {cd ? (
            <div className="cdBoxes">
              {[
                ["DAYS", cd.days],
                ["HOURS", cd.hours],
                ["MINS", cd.mins],
                ["SECS", cd.secs],
              ].map(([label, v]) => (
                <div className="cdBox" key={label as string}>
                  <b>{String(v).padStart(2, "0")}</b>
                  <span>{label as string}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="cdBoxes">
              {["DAYS", "HOURS", "MINS", "SECS"].map((l) => (
                <div className="cdBox" key={l}>
                  <b>--</b>
                  <span>{l}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </header>

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t}
            className={`tab ${tab === t ? "on" : ""}`}
            onClick={() => setTab(t)}
            aria-current={tab === t ? "page" : undefined}
          >
            {t}
          </button>
        ))}
      </nav>

      {tab !== "Mint" ? (
        <main className="panelView">
          {tab === "Items" ? (
            <>
              <p className="viewNote">
                Preview art · full collection reveals after mint.
              </p>
              <div className="itemGrid">
                {ART.map((src, i) => (
                  <figure className="item" key={src}>
                    <Image src={src} alt="" width={400} height={400} />
                    <figcaption>Folk #{String(i + 1).padStart(4, "0")}</figcaption>
                  </figure>
                ))}
              </div>
            </>
          ) : (
            <div className="empty">
              <h2>{tab}</h2>
              <p>
                {tab === "Holders"
                  ? "No holders yet — the collection hasn't minted."
                  : tab === "Traits"
                    ? "Trait rarity publishes at reveal."
                    : "No activity yet. Mint opens September 23."}
              </p>
            </div>
          )}
        </main>
      ) : (
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
              <div>
                <h2 className="panelTitle">
                  {phase === "folklist" ? "FOLKLIST MINT" : "PUBLIC MINT"}
                </h2>
                <p className="panelPrice">
                  {phase === "folklist" ? "FREE" : "$1.50"}
                </p>
              </div>
              <span className={`badge ${phase}`}>
                {phase === "folklist" ? "Folklist" : "Public"}
              </span>
            </div>

            <dl className="specs">
              {phase === "folklist" && (
                <div className="spec">
                  <dt>Supply</dt>
                  <dd>10,000</dd>
                </div>
              )}
              <div className="spec">
                <dt>{phase === "folklist" ? "Mint Price" : "Price"}</dt>
                <dd className={phase === "folklist" ? "free" : ""}>
                  {phase === "folklist" ? "FREE" : "$1.50"}
                </dd>
              </div>
              <div className="spec">
                <dt>Platform Fee</dt>
                <dd>$0.18 / mint</dd>
              </div>
              <div className="spec">
                <dt>Network</dt>
                <dd>Robinhood Chain</dd>
              </div>
              <div className="spec">
                <dt>Minted</dt>
                <dd>
                  {minted.toLocaleString()} / {SUPPLY.toLocaleString()}
                </dd>
              </div>
            </dl>

            <div className="bar">
              <span style={{ width: `${(minted / SUPPLY) * 100}%` }} />
            </div>

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
                onClick={() => setQty((q) => Math.min(20, q + 1))}
                disabled={qty >= 20}
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>

            <button className="mintBtn" type="button">
              CONNECT WALLET
            </button>

            <p className="totalLine">
              {qty} Folk{qty > 1 ? "s" : ""} = <strong>{usd(total)}</strong> +
              network gas
            </p>
          </div>

          <div className="schedule">
            <h3 className="schedTitle">MINT SCHEDULE</h3>

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
                  FOLKLIST <span className="pill">Allowlist</span>
                </span>
                <span className="schedWhen">
                  Starts: September 23 at 9:30 AM PDT
                </span>
                <span className="schedCost">
                  FREE + $0.18 fee · {FOLKLIST_SUPPLY.toLocaleString()} SUPPLY
                </span>
              </span>
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
                  Starts: after Folklist ends
                </span>
                <span className="schedCost">$1.50 + $0.18 fee · LIMIT 20</span>
              </span>
            </button>

            <div className="sched static">
              <span className="dot" />
              <span className="schedBody">
                <span className="schedName">
                  TEAM RESERVE <span className="pill">Reserved</span>
                </span>
                <span className="schedWhen">Held back from supply</span>
                <span className="schedCost">{TEAM_RESERVE} FOLKS</span>
              </span>
            </div>
          </div>

          <footer className="fineprint">
            <p>No creator royalties.</p>
            <p>Secondary trading on OpenSea.</p>
            <p>Folklist: FREE + $0.18 platform fee</p>
            <p>Public: $1.50 + $0.18 platform fee</p>
            <p>Secondary: OpenSea, 0% creator royalty</p>
            <p>Mint: thefolks.xyz/mint</p>
            <p>Chain: Robinhood · Supply: 10,000 · Team reserve: 120</p>
          </footer>
        </section>
      </main>
      )}
    </div>
  );
}
