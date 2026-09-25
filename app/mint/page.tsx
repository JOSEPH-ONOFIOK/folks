"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import {
  connect as connectWallet,
  currentAccount,
  currentChainId,
  getProvider,
  isMobile,
  metamaskDeepLink,
  onWallets,
  readyWallets,
  startDiscovery,
  switchChain,
  wallets as listWallets,
  type WalletInfo,
} from "@/lib/wallet";
import {
  ABI,
  CHAIN_ID,
  CHAIN_NAME,
  CONTRACT_ADDRESS,
  EXPLORER,
  MAX_SUPPLY,
  RPC_URL,
  readableError,
  txUrl,
} from "@/lib/contract";

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
  "/folk-6.jpg",
  "/folk-7.jpg",
  "/folk-8.jpg",
  "/folk-9.jpg",
  "/folk-10.jpg",
  "/folk-11.jpg",
  "/folk-12.jpg",
  "/folk-13.jpg",
  "/folk-14.jpg",
  "/folk-15.jpg",
  "/folk-16.jpg",
  "/folk-17.jpg",
  "/folk-18.jpg",
  "/folk-19.jpg",
  "/folk-20.jpg",
  "/folk-21.jpg",
];

// The strip shows a handful; the hero cycles the whole set.
const THUMBS = 5;

// Team mints first, then folklist, then public.
type Phase = "team" | "folklist" | "public";

// Times are WAT, which is UTC+1 year-round, so no DST to account for.
// Team 6pm, folklist 6:30pm, and the contract opens public an hour after
// folklist at 7:30pm.
const TEAM_START = new Date("2026-09-25T17:00:00Z"); // 6:00pm WAT
const MINT_START = new Date("2026-09-25T17:30:00Z"); // 6:30pm WAT

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

type Left = { days: number; hours: number; mins: number; secs: number } | null;

/// Compact "2h 14m" style countdown for a schedule row. Returns null once the
/// phase is open, so the row simply reads as live.
function rowTime(cd: Left): string | null {
  if (!cd) return null;
  const { days, hours, mins, secs } = cd;
  if (days + hours + mins + secs === 0) return null;
  if (days > 0) return `in ${days}d ${hours}h`;
  if (hours > 0) return `in ${hours}h ${mins}m`;
  if (mins > 0) return `in ${mins}m ${secs}s`;
  return `in ${secs}s`;
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
  const [walletError, setWalletError] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [proof, setProof] = useState<string[] | null>(null);
  const [choices, setChoices] = useState<WalletInfo[]>([]);
  const [picking, setPicking] = useState(false);

  // Live contract state. Null until the first read lands.
  const [live, setLive] = useState<{
    phase: 0 | 1 | 2;
    minted: number;
    teamMinted: number;
    folklistPrice: bigint;
    publicPrice: bigint;
    platformFee: bigint;
    folklistStart: number;
  } | null>(null);

  // Mint transaction lifecycle.
  const [minting, setMinting] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [minted, setMinted] = useState<number | null>(null);
  const [mintError, setMintError] = useState<string | null>(null);
  // Before the chain has a schedule, fall back to the announced times.
  const folklistAt = live?.folklistStart
    ? new Date(live.folklistStart * 1000)
    : MINT_START;
  // Team runs 30 minutes ahead of folklist, so count to whichever is next.
  const teamAt = live?.folklistStart
    ? new Date((live.folklistStart - 1800) * 1000)
    : TEAM_START;
  // Public follows folklist by the contract's fixed hour.
  const publicAt = new Date(folklistAt.getTime() + 3600_000);
  const startAt = Date.now() < teamAt.getTime() ? teamAt : folklistAt;
  const cd = useCountdown(startAt);

  // Each row counts to its own opening, so nobody has to work out when
  // their phase starts from a single timer.
  const cdTeam = useCountdown(teamAt);
  const cdFolklist = useCountdown(folklistAt);
  const cdPublic = useCountdown(publicAt);
  const ethUsd = useEthPrice();
  // Prices read in ETH first; the swap button flips to USD.
  const [inEth, setInEth] = useState(true);

  // Folklist is gated by the allowlist; public is open to anyone; team
  // never mints from this page.
  const eligible =
    phase === "public"
      ? true
      : phase === "folklist"
        ? listed === true && proof !== null && proof.length > 0
        : false;

  const short = (a: string) =>
    a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;

  // Ask the server whether this wallet is on the folklist. The list itself
  // stays server-side; only the verdict for this one address comes back.
  const check = useCallback(async (addr: string) => {
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: addr }),
      });
      const data = (await res.json()) as { status: string };
      setListed(data.status === "eligible");
    } catch {
      setListed(null);
    }
  }, []);

  const adopt = useCallback(
    (addr: string) => {
      setAddress(addr);
      setConnected(true);
      void check(addr);
    },
    [check],
  );

  async function onConnect() {
    setWalletError(null);
    setChecking(true);

    // Discovery is an event round-trip, so wait for it rather than reading a
    // list that may still be filling.
    const found = await readyWallets();

    if (found.length === 0) {
      setChecking(false);
      if (isMobile()) {
        window.location.href = metamaskDeepLink();
        return;
      }
      setWalletError("No wallet found. Install MetaMask, or open this page in your wallet's browser.");
      return;
    }

    // More than one wallet installed: ask which, rather than guessing and
    // opening the wrong one.
    if (found.length > 1) {
      setChoices(found);
      setPicking(true);
      setChecking(false);
      return;
    }

    try {
      const addr = await connectWallet(found[0].provider);
      if (addr) adopt(addr);
      else setWalletError("No account returned. Unlock your wallet and try again.");
    } catch (err) {
      const code = (err as { code?: number })?.code;
      // 4001 is the user rejecting the prompt; that is not an error worth shouting about.
      setWalletError(code === 4001 ? null : "Could not connect. Try again.");
    } finally {
      setChecking(false);
    }
  }

  async function onSwitchNetwork() {
    const okSwitch = await switchChain(CHAIN_ID, CHAIN_NAME, RPC_URL, EXPLORER);
    if (!okSwitch) setMintError(`Switch your wallet to ${CHAIN_NAME} to mint.`);
  }

  async function onMint() {
    setMintError(null);
    setTxHash(null);
    setMinted(null);

    if (!CONTRACT_ADDRESS) {
      setMintError("The contract address isn't configured yet.");
      return;
    }
    if (wrongChain) { void onSwitchNetwork(); return; }

    setMinting(true);
    try {
      const { ethers } = await import("ethers");
      const provider = new ethers.BrowserProvider(getProvider()!);
      const signer = await provider.getSigner();
      const c = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);

      // Ask the contract what this costs rather than recomputing it here, so
      // the wallet prompt can never disagree with the chain.
      const value: bigint = await c.mintCost(qty);

      const tx =
        live?.phase === 1
          ? await c.folklistMint(qty, proof ?? [], { value })
          : await c.publicMint(qty, { value });

      setTxHash(tx.hash);
      await tx.wait();
      setMinted(qty);
    } catch (err) {
      const msg = readableError(err);
      if (msg) setMintError(msg);
      setTxHash(null);
    } finally {
      setMinting(false);
    }
  }

  async function pick(w: WalletInfo) {
    setPicking(false);
    setChecking(true);
    setWalletError(null);
    try {
      const addr = await connectWallet(w.provider);
      if (addr) adopt(addr);
      else setWalletError("No account returned. Unlock your wallet and try again.");
    } catch (err) {
      const code = (err as { code?: number })?.code;
      setWalletError(code === 4001 ? null : "Could not connect. Try again.");
    } finally {
      setChecking(false);
    }
  }

  function disconnect() {
    setConnected(false);
    setListed(null);
    setAddress("");
    setWalletError(null);
  }

  // Let every installed wallet announce itself before we offer a choice.
  useEffect(() => {
    startDiscovery();
    setChoices(listWallets());
    return onWallets(setChoices);
  }, []);

  // Restore an already-authorised session, and follow the wallet if the
  // visitor switches or locks their account.
  useEffect(() => {
    let alive = true;
    void readyWallets().then(() =>
      currentAccount().then((addr) => {
        if (alive && addr) adopt(addr);
      }),
    );

    const provider = getProvider();
    if (!provider?.on) return () => { alive = false; };

    const onAccounts = (...args: never[]) => {
      const accounts = args[0] as unknown as string[];
      if (!accounts || accounts.length === 0) {
        setConnected(false);
        setListed(null);
        setAddress("");
      } else {
        adopt(accounts[0]);
      }
    };

    provider.on("accountsChanged", onAccounts);
    return () => {
      alive = false;
      provider.removeListener?.("accountsChanged", onAccounts);
    };
  }, [adopt]);

  // The chain decides which phase is live. Viewing another row is fine, but
  // we never start on a phase the contract disagrees with.
  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    if (!live || pinned) return;
    const onChain = live.phase === 2 ? "public" : live.phase === 1 ? "folklist" : "team";
    // During folklist, a wallet that is not on the list can only mint later,
    // so show it the phase it qualifies for rather than a dead button.
    if (onChain === "folklist" && connected && listed === false) {
      setPhase("public");
      return;
    }
    setPhase(onChain);
  }, [live, pinned, connected, listed]);

  // Poll the contract so supply, phase and prices are the chain's, not ours.
  useEffect(() => {
    if (!CONTRACT_ADDRESS) return;
    let alive = true;

    const read = async () => {
      try {
        const { ethers } = await import("ethers");
        const injected = getProvider();
        const provider = injected
          ? new ethers.BrowserProvider(injected)
          : RPC_URL
            ? new ethers.JsonRpcProvider(RPC_URL)
            : null;
        if (!provider) return;
        const c = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
        const [ph, tm, fp, pp, pf, fs, team] = await Promise.all([
          c.phase(), c.totalMinted(), c.folklistPrice(),
          c.publicPrice(), c.platformFee(), c.folklistStart(), c.teamMinted(),
        ]);
        if (!alive) return;
        setLive({
          phase: Number(ph) as 0 | 1 | 2,
          minted: Number(tm),
          teamMinted: Number(team),
          folklistPrice: fp,
          publicPrice: pp,
          platformFee: pf,
          folklistStart: Number(fs),
        });
      } catch {
        // Leave the last good read in place rather than flashing zeros.
      }
    };

    void read();
    const id = setInterval(read, 12000);
    return () => { alive = false; clearInterval(id); };
  }, [connected]);

  // Track the wallet's network so we can stop a mint on the wrong chain.
  useEffect(() => {
    if (!connected) { setChainId(null); return; }
    let alive = true;
    void currentChainId().then((id) => alive && setChainId(id));
    const provider = getProvider();
    const onChain = () => { void currentChainId().then((id) => alive && setChainId(id)); };
    provider?.on?.("chainChanged", onChain);
    return () => { alive = false; provider?.removeListener?.("chainChanged", onChain); };
  }, [connected]);

  // Fetch this wallet's folklist proof once, so minting doesn't wait on it.
  useEffect(() => {
    if (!connected || !address) { setProof(null); return; }
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/proof", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ address }),
        });
        const data = (await res.json()) as { eligible: boolean; proof: string[] };
        if (alive) setProof(data.eligible ? data.proof : []);
      } catch {
        if (alive) setProof(null);
      }
    })();
    return () => { alive = false; };
  }, [connected, address]);

  // Cycle the hero art on its own. Hovering pauses it; picking a
  // thumbnail hands control to the viewer for good.
  useEffect(() => {
    if (hovering || tookOver) return;
    const id = setInterval(() => setActive((i) => (i + 1) % ART.length), 1400);
    return () => clearInterval(id);
  }, [hovering, tookOver]);

  // Supply comes from the chain once it is readable; before that the bar
  // stays empty rather than showing a number we made up.
  const supplyMinted = live?.minted ?? 0;
  const cap = phase === "team" ? TEAM_RESERVE : MAX_SUPPLY;
  const shown = phase === "team" ? Math.min(supplyMinted, TEAM_RESERVE) : supplyMinted;
  const pct = (shown / cap) * 100;
  const soldOut = live !== null && live.minted >= MAX_SUPPLY;
  const remaining = live ? Math.max(0, MAX_SUPPLY - live.minted) : 20;

  // 21 thumbnails would be postage stamps, so show a window that follows the
  // hero and wraps around the set.
  const thumbWindow = Array.from({ length: Math.min(THUMBS, ART.length) }, (_, n) => {
    const i = (active + n) % ART.length;
    return { src: ART[i], i };
  });
  // No per-wallet cap on-chain, so MAX is what supply allows, kept to a
  // sane batch so one tap cannot build a transaction nobody can afford.
  const MAX_PER_TX = 20;
  const maxForPhase = Math.max(1, Math.min(remaining, MAX_PER_TX));
  const wrongChain = connected && CHAIN_ID > 0 && chainId !== null && chainId !== CHAIN_ID;

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
              onClick={disconnect}
              title="Disconnect"
            >
              <span className={`wDot ${listed ? "ok" : "no"}`} />
              {short(address)}
            </button>
          ) : (
            <button
              className="connectBtn"
              type="button"
              onClick={onConnect}
              disabled={checking}
            >
              {checking ? "CONNECTING…" : "CONNECT WALLET"}
            </button>
          )}
        </div>
      </header>

      {picking && (
        <div className="pickWrap" onClick={() => setPicking(false)}>
          <div className="pickCard" onClick={(e) => e.stopPropagation()}>
            <h2>Choose a wallet</h2>
            {choices.map((w) => (
              <button key={w.uuid} className="pickRow" onClick={() => void pick(w)}>
                {w.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={w.icon} alt="" width={24} height={24} />
                ) : (
                  <span className="pickDot" />
                )}
                {w.name}
              </button>
            ))}
            <button className="pickCancel" onClick={() => setPicking(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {wrongChain && (
        <div className="netWarn">
          <span>Wrong network — this mint runs on {CHAIN_NAME}.</span>
          <button className="netBtn" onClick={() => void onSwitchNetwork()}>
            Switch
          </button>
        </div>
      )}

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
            {thumbWindow.map(({ src, i }) => (
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

          <div className="countdown">
            <span className="cdLabel">
              {cd && cd.days + cd.hours + cd.mins + cd.secs === 0
                ? "MINT IS LIVE"
                : startAt === teamAt
                  ? "TEAM MINT IN"
                  : "MINTING IN"}
            </span>
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
                ? "Opens 6pm WAT. Reserved for the team, not open to the public."
                : phase === "folklist"
                  ? !connected
                    ? "Opens 6:30pm WAT · Connect to check eligibility."
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
                  {shown.toLocaleString()} / {cap.toLocaleString()}
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

            {phase === "team" && (
              <p className="teamNote">
                {live && live.teamMinted >= TEAM_RESERVE
                  ? "The team allocation has been minted."
                  : "Reserved for the team. Nothing to mint here."}
              </p>
            )}

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
                    onClick={() =>
                      setQty((q) => Math.min(q + 1, Math.max(1, remaining)))
                    }
                    disabled={qty >= remaining}
                    aria-label="Increase quantity"
                  >
                    +
                  </button>

                  <button
                    className="maxBtn"
                    type="button"
                    onClick={() => setQty(Math.max(1, maxForPhase))}
                    disabled={qty >= maxForPhase}
                    title={`Mint the most this phase allows (${maxForPhase})`}
                  >
                    MAX
                  </button>
                </div>

                <div className="actionRow">
                  <button
                    className="mintBtn"
                    type="button"
                    disabled={
                      checking ||
                      minting ||
                      soldOut ||
                      (connected && !wrongChain && !eligible)
                    }
                    onClick={() => {
                      if (!connected) void onConnect();
                      else if (wrongChain) void onSwitchNetwork();
                      else void onMint();
                    }}
                  >
                    {soldOut
                      ? "SOLD OUT"
                      : checking
                        ? "CONNECTING…"
                        : minting
                          ? txHash
                            ? "CONFIRMING…"
                            : "CHECK YOUR WALLET…"
                          : !connected
                            ? "CONNECT WALLET"
                            : wrongChain
                              ? `SWITCH TO ${CHAIN_NAME.toUpperCase()}`
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

                {walletError && <p className="walletErr">{walletError}</p>}
                {mintError && <p className="walletErr">{mintError}</p>}

                {minted !== null && (
                  <div className="mintDone">
                    <strong>
                      Minted {minted} Folk{minted > 1 ? "s" : ""}.
                    </strong>
                    {txHash && txUrl(txHash) && (
                      <a href={txUrl(txHash)!} target="_blank" rel="noreferrer">
                        View transaction
                      </a>
                    )}
                  </div>
                )}

                {minting && txHash && (
                  <p className="mintPending">
                    Waiting for confirmation…
                    {txUrl(txHash) && (
                      <>
                        {" "}
                        <a href={txUrl(txHash)!} target="_blank" rel="noreferrer">
                          track it
                        </a>
                      </>
                    )}
                  </p>
                )}

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
                {ethUsd && (
                  <p className="rateNote">
                    <span className="rDot" /> ETH $
                    {ethUsd.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                )}
              </>
            )}
          </div>

          <div className="schedule">
            <h3 className="schedTitle">MINT SCHEDULE</h3>

            <button
              className={`sched ${phase === "team" ? "on" : ""}`}
              onClick={() => { setPinned(true); setPhase("team"); }}
            >
              <span className="dot" />
              <span className="schedBody">
                <span className="schedName">
                  TEAM <span className="pill">Reserved</span>
                </span>
                <span className="schedWhen">
                  6pm WAT · minted by the team, not open to the public
                </span>
                <span className="schedTimer">
                  {rowTime(cdTeam) ?? "live"}
                </span>
              </span>
              <span className="schedCost">FREE</span>
            </button>

            <button
              className={`sched ${phase === "folklist" ? "on" : ""}`}
              onClick={() => {
                setPinned(true);
                setPhase("folklist");
                setQty(1);
              }}
            >
              <span className="dot" />
              <span className="schedBody">
                <span className="schedName">
                  FOLKLIST <span className="pill">Whitelist</span>
                  {connected && listed !== null && (
                    <span className={`rowElig ${listed ? "yes" : "no"}`}>
                      {listed ? "You're in" : "Not listed"}
                    </span>
                  )}
                </span>
                <span className="schedWhen">
                  Opens 6:30pm WAT · Connect to check eligibility
                </span>
                <span className="schedTimer">
                  {rowTime(cdFolklist) ?? "live"}
                </span>
              </span>
              <span className="schedCost">FREE + gas</span>
            </button>

            <button
              className={`sched ${phase === "public" ? "on" : ""}`}
              onClick={() => {
                setPinned(true);
                setPhase("public");
                setQty(1);
              }}
            >
              <span className="dot" />
              <span className="schedBody">
                <span className="schedName">
                  PUBLIC <span className="pill">Open</span>
                  {connected && (
                    <span className="rowElig yes">Open to you</span>
                  )}
                </span>
                <span className="schedWhen">
                  7:30pm WAT · shares one pool with unminted whitelist supply
                </span>
                <span className="schedTimer">
                  {rowTime(cdPublic) ?? "live"}
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
          <a
            className="footLink"
            href="https://x.com/thefolksxyz"
            target="_blank"
            rel="noreferrer"
          >
            X
          </a>
          <a
            className="footLink"
            href="https://opensea.io/collection/folks"
            target="_blank"
            rel="noreferrer"
          >
            OpenSea
          </a>
        </div>
      </footer>
    </div>
  );
}
