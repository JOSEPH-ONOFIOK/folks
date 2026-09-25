"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CHAIN_ID,
  CHAIN_NAME,
  CONTRACT_ADDRESS,
  EXPLORER,
  RPC_URL,
} from "@/lib/contract";
import {
  connect as connectWallet,
  currentAccount,
  currentChainId,
  getProvider,
  switchChain,
  readyWallets,
} from "@/lib/wallet";

type Phase = 0 | 1 | 2;

const PHASE_LABEL: Record<Phase, string> = {
  0: "Not started",
  1: "Folklist",
  2: "Public",
};

// Minimal ABI: only what the panel calls.
const ABI = [
  "function owner() view returns (address)",
  "function phase() view returns (uint8)",
  "function folklistStart() view returns (uint256)",
  "function publicStart() view returns (uint256)",
  "function folklistPrice() view returns (uint256)",
  "function publicPrice() view returns (uint256)",
  "function platformFee() view returns (uint256)",
  "function feeRecipient() view returns (address)",
  "function folklistRoot() view returns (bytes32)",
  "function totalMinted() view returns (uint256)",
  "function teamMinted() view returns (uint256)",
  "function setFolklistStart(uint256)",
  "function setPrices(uint256,uint256)",
  "function setPlatformFee(uint256,address)",
  "function setFolklistRoot(bytes32)",
  "function teamMint(uint256)",
  "function withdraw(address)",
];

type Chain = {
  owner: string;
  phase: Phase;
  folklistStart: bigint;
  publicStart: bigint;
  folklistPrice: bigint;
  publicPrice: bigint;
  platformFee: bigint;
  feeRecipient: string;
  folklistRoot: string;
  totalMinted: bigint;
  teamMinted: bigint;
  transfersLocked: boolean;
};

const fmtTime = (ts: bigint) =>
  ts === 0n ? "not scheduled" : new Date(Number(ts) * 1000).toLocaleString();

export default function AdminPage() {
  const [address, setAddress] = useState("");
  const [contract, setContract] = useState("");
  const [chain, setChain] = useState<Chain | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // form state
  const [startAt, setStartAt] = useState("");
  const [flPrice, setFlPrice] = useState("");
  const [pubPrice, setPubPrice] = useState("");
  const [fee, setFee] = useState("");
  const [feeTo, setFeeTo] = useState("");
  const [rootInput, setRootInput] = useState("");
  const [csvName, setCsvName] = useState("");
  const [csvCount, setCsvCount] = useState(0);
  const [teamQty, setTeamQty] = useState("");

  const isOwner =
    chain && address && chain.owner.toLowerCase() === address.toLowerCase();

  useEffect(() => {
    // Prefer the deployed address from the environment, so a fresh browser
    // lands on the right contract without anyone pasting it.
    const saved = localStorage.getItem("folks.contract");
    setContract(CONTRACT_ADDRESS || saved || "");
    void currentAccount().then((a) => a && setAddress(a));
  }, []);

  // The panel reads through the wallet, so a wallet on another chain finds
  // nothing at this address. Track it and say so plainly.
  useEffect(() => {
    if (!address) { setChainId(null); return; }
    let alive = true;
    void currentChainId().then((id) => alive && setChainId(id));
    const provider = getProvider();
    const onChain = () => { void currentChainId().then((id) => alive && setChainId(id)); };
    provider?.on?.("chainChanged", onChain);
    return () => { alive = false; provider?.removeListener?.("chainChanged", onChain); };
  }, [address]);

  const wrongChain =
    address !== "" && CHAIN_ID > 0 && chainId !== null && chainId !== CHAIN_ID;

  const load = useCallback(async () => {
    if (!contract) return;
    setMsg(null);
    try {
      const { ethers } = await import("ethers");
      const provider = new ethers.BrowserProvider(getProvider()!);
      const c = new ethers.Contract(contract, ABI, provider);
      const [
        owner, ph, fs, ps, fp, pp, pf, fr, root, tm, team,
      ] = await Promise.all([
        c.owner(), c.phase(), c.folklistStart(), c.publicStart(),
        c.folklistPrice(), c.publicPrice(), c.platformFee(), c.feeRecipient(),
        c.folklistRoot(), c.totalMinted(), c.teamMinted(),
      ]);
      const locked = await c.transfersLocked();
      setChain({
        owner, phase: Number(ph) as Phase,
        folklistStart: fs, publicStart: ps,
        folklistPrice: fp, publicPrice: pp,
        platformFee: pf, feeRecipient: fr,
        folklistRoot: root, totalMinted: tm, teamMinted: team,
        transfersLocked: locked,
      });
      localStorage.setItem("folks.contract", contract);
    } catch (e) {
      setChain(null);
      // Ask the wallet directly rather than trusting state captured when this
      // callback was created.
      const onChain = await currentChainId();
      setMsg({
        kind: "err",
        text:
          CHAIN_ID > 0 && onChain !== null && onChain !== CHAIN_ID
            ? `Your wallet is on chain ${onChain}. Switch it to ${CHAIN_NAME} (${CHAIN_ID}) to manage this contract.`
            : "Could not read that contract on this network.",
      });
    }
  }, [contract]);

  useEffect(() => {
    if (contract && address) void load();
  }, [contract, address, load]);

  async function send(label: string, fn: (c: never) => Promise<{ wait: () => Promise<unknown> }>) {
    setBusy(label);
    setMsg(null);
    try {
      const { ethers } = await import("ethers");
      const provider = new ethers.BrowserProvider(getProvider()!);
      const signer = await provider.getSigner();
      const c = new ethers.Contract(contract, ABI, signer);
      const tx = await fn(c as never);
      await tx.wait();
      setMsg({ kind: "ok", text: `${label} confirmed.` });
      await load();
    } catch (e) {
      const m = (e as { shortMessage?: string; message?: string });
      setMsg({ kind: "err", text: m.shortMessage ?? m.message ?? "Transaction failed." });
    } finally {
      setBusy(null);
    }
  }

  // Parse a CSV/TXT of addresses and compute the root in the browser.
  async function onCsv(file: File) {
    setMsg(null);
    setCsvName(file.name);
    const text = await file.text();
    const found = text.match(/0x[0-9a-fA-F]{40}/g) ?? [];
    const unique = Array.from(new Set(found.map((a) => a.toLowerCase())));
    setCsvCount(unique.length);
    if (unique.length === 0) {
      setMsg({ kind: "err", text: "No wallet addresses found in that file." });
      return;
    }
    const res = await fetch("/api/admin/root", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ addresses: unique }),
    });
    const data = (await res.json()) as { root?: string; error?: string };
    if (data.root) {
      setRootInput(data.root);
      setMsg({ kind: "ok", text: `Root computed from ${unique.length.toLocaleString()} addresses. Review it, then save on-chain.` });
    } else {
      setMsg({ kind: "err", text: data.error ?? "Could not compute the root." });
    }
  }

  return (
    <div className="adminPage">
      <header className="adminHead">
        <div>
          <h1>Folks admin</h1>
          <p className="adminSub">Sale timing, pricing and the folklist.</p>
        </div>
        {address ? (
          <span className="adminWallet">
            <span className="wDot ok" />
            {address.slice(0, 6)}…{address.slice(-4)}
          </span>
        ) : (
          <button
            className="aBtn primary"
            onClick={async () => {
              const found = await readyWallets();
              if (found.length === 0) {
                setMsg({ kind: "err", text: "No wallet found in this browser." });
                return;
              }
              const a = await connectWallet(found[0].provider);
              if (a) setAddress(a);
            }}
          >
            CONNECT WALLET
          </button>
        )}
      </header>

      {wrongChain && (
        <div className="netWarn">
          <span>
            Wrong network — this contract lives on {CHAIN_NAME} ({CHAIN_ID}),
            your wallet is on {chainId}.
          </span>
          <button
            className="netBtn"
            onClick={() => void switchChain(CHAIN_ID, CHAIN_NAME, RPC_URL, EXPLORER)}
          >
            Switch
          </button>
        </div>
      )}

      <section className="aCard">
        <label className="aLabel">Contract address</label>
        <div className="aRow">
          <input
            className="aInput mono"
            value={contract}
            onChange={(e) => setContract(e.target.value.trim())}
            placeholder="0x…"
            spellCheck={false}
          />
          <button className="aBtn" onClick={() => void load()} disabled={!contract}>
            Load
          </button>
        </div>
      </section>

      {msg && <p className={`aMsg ${msg.kind}`}>{msg.text}</p>}

      {chain && !isOwner && (
        <p className="aMsg err">
          This wallet is not the contract owner. Connect {chain.owner.slice(0, 6)}…
          {chain.owner.slice(-4)} to make changes.
        </p>
      )}

      {chain && (
        <>
          <section className="aCard">
            <h2 className="aTitle">Live state</h2>
            <dl className="aStats">
              <div><dt>Phase</dt><dd>{PHASE_LABEL[chain.phase]}</dd></div>
              <div><dt>Minted</dt><dd>{chain.totalMinted.toString()} / 10,000</dd></div>
              <div><dt>Team minted</dt><dd>{chain.teamMinted.toString()} / 150</dd></div>
              <div><dt>Folklist opens</dt><dd>{fmtTime(chain.folklistStart)}</dd></div>
              <div><dt>Public opens</dt><dd>{fmtTime(chain.publicStart)}</dd></div>
              <div>
                <dt>Trading</dt>
                <dd>{chain.transfersLocked ? "Locked" : "Open"}</dd>
              </div>
              <div><dt>Folklist root</dt><dd className="mono tiny">{chain.folklistRoot}</dd></div>
            </dl>
          </section>

          <section className="aCard">
            <h2 className="aTitle">Sale time</h2>
            <p className="aHint">
              Public opens automatically one hour after folklist.
            </p>
            <div className="aRow">
              <input
                className="aInput"
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
              />
              <button
                className="aBtn primary"
                disabled={!isOwner || !startAt || busy !== null}
                onClick={() =>
                  send("Sale time", (c) =>
                    (c as never as { setFolklistStart: (t: bigint) => Promise<{ wait: () => Promise<unknown> }> })
                      .setFolklistStart(BigInt(Math.floor(new Date(startAt).getTime() / 1000))),
                  )
                }
              >
                {busy === "Sale time" ? "Saving…" : "Set start"}
              </button>
            </div>
          </section>

          <section className="aCard">
            <h2 className="aTitle">Prices</h2>
            <p className="aHint">In ETH. Folklist is usually 0.</p>
            <div className="aGrid">
              <label>
                <span>Folklist</span>
                <input className="aInput" value={flPrice} onChange={(e) => setFlPrice(e.target.value)} placeholder="0" />
              </label>
              <label>
                <span>Public</span>
                <input className="aInput" value={pubPrice} onChange={(e) => setPubPrice(e.target.value)} placeholder="0.0002" />
              </label>
            </div>
            <button
              className="aBtn primary"
              disabled={!isOwner || busy !== null}
              onClick={() =>
                send("Prices", async (c) => {
                  const { ethers } = await import("ethers");
                  return (c as never as { setPrices: (a: bigint, b: bigint) => Promise<{ wait: () => Promise<unknown> }> })
                    .setPrices(ethers.parseEther(flPrice || "0"), ethers.parseEther(pubPrice || "0"));
                })
              }
            >
              {busy === "Prices" ? "Saving…" : "Update prices"}
            </button>
          </section>

          <section className="aCard">
            <h2 className="aTitle">Platform fee</h2>
            <div className="aGrid">
              <label>
                <span>Fee per mint (ETH)</span>
                <input className="aInput" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="0.00004" />
              </label>
              <label>
                <span>Paid to</span>
                <input className="aInput mono" value={feeTo} onChange={(e) => setFeeTo(e.target.value)} placeholder="0x…" />
              </label>
            </div>
            <button
              className="aBtn primary"
              disabled={!isOwner || busy !== null}
              onClick={() =>
                send("Platform fee", async (c) => {
                  const { ethers } = await import("ethers");
                  return (c as never as { setPlatformFee: (a: bigint, b: string) => Promise<{ wait: () => Promise<unknown> }> })
                    .setPlatformFee(ethers.parseEther(fee || "0"), feeTo);
                })
              }
            >
              {busy === "Platform fee" ? "Saving…" : "Update fee"}
            </button>
          </section>

          <section className="aCard">
            <h2 className="aTitle">Folklist</h2>
            <p className="aHint">
              Upload a CSV or text file of wallet addresses. The root is computed
              from the file; the addresses themselves never go on-chain.
            </p>
            <input
              className="aFile"
              type="file"
              accept=".csv,.txt"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onCsv(f);
              }}
            />
            {csvName && (
              <p className="aHint">
                {csvName} — {csvCount.toLocaleString()} unique addresses
              </p>
            )}
            <input
              className="aInput mono"
              value={rootInput}
              onChange={(e) => setRootInput(e.target.value.trim())}
              placeholder="0x… merkle root"
              spellCheck={false}
            />
            <button
              className="aBtn primary"
              disabled={!isOwner || !rootInput || busy !== null}
              onClick={() =>
                send("Folklist", (c) =>
                  (c as never as { setFolklistRoot: (r: string) => Promise<{ wait: () => Promise<unknown> }> })
                    .setFolklistRoot(rootInput),
                )
              }
            >
              {busy === "Folklist" ? "Saving…" : "Save root on-chain"}
            </button>
          </section>

          <section className="aCard">
            <h2 className="aTitle">Secondary trading</h2>
            {chain.transfersLocked ? (
              <>
                <p className="aHint">
                  Folks cannot be transferred or listed yet. Minting is
                  unaffected. Open this once the mint is done — it cannot be
                  locked again.
                </p>
                <button
                  className="aBtn primary"
                  disabled={!isOwner || busy !== null}
                  onClick={() => {
                    if (!confirm("Open secondary trading? This is permanent.")) return;
                    void send("Trading", (c) =>
                      (c as never as { openTransfers: () => Promise<{ wait: () => Promise<unknown> }> })
                        .openTransfers(),
                    );
                  }}
                >
                  {busy === "Trading" ? "Opening…" : "Open trading"}
                </button>
              </>
            ) : (
              <p className="aHint">Trading is open. This cannot be undone.</p>
            )}
          </section>

          <section className="aCard">
            <h2 className="aTitle">Team mint</h2>
            <p className="aHint">
              Mints to the owner wallet. 150 reserved in total.
            </p>
            <div className="aGrid">
              <label>
                <span>Quantity</span>
                <input className="aInput" value={teamQty} onChange={(e) => setTeamQty(e.target.value)} placeholder="150" />
              </label>
            </div>
            <button
              className="aBtn"
              disabled={!isOwner || busy !== null}
              onClick={() =>
                send("Team mint", (c) =>
                  (c as never as { teamMint: (q: bigint) => Promise<{ wait: () => Promise<unknown> }> })
                    .teamMint(BigInt(teamQty || "0")),
                )
              }
            >
              {busy === "Team mint" ? "Minting…" : "Team mint"}
            </button>
          </section>
        </>
      )}
    </div>
  );
}
