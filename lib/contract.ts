// Everything the mint page needs to talk to the Folks contract.

export const CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? "";

// Robinhood Chain. Override per environment; the page refuses to mint on
// anything else so a wallet on the wrong network fails loudly, not silently.
export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "0");
export const CHAIN_NAME = process.env.NEXT_PUBLIC_CHAIN_NAME ?? "Robinhood Chain";
export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "";
export const EXPLORER = (process.env.NEXT_PUBLIC_EXPLORER ?? "").replace(/\/$/, "");

export const MAX_SUPPLY = 10_000;
export const TEAM_RESERVE = 150;

export const ABI = [
  "function phase() view returns (uint8)",
  "function folklistStart() view returns (uint256)",
  "function publicStart() view returns (uint256)",
  "function folklistPrice() view returns (uint256)",
  "function publicPrice() view returns (uint256)",
  "function platformFee() view returns (uint256)",
  "function totalMinted() view returns (uint256)",
  "function teamMinted() view returns (uint256)",
  "function mintCost(uint256) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function folklistMint(uint256,bytes32[]) payable",
  "function publicMint(uint256) payable",
];

export function txUrl(hash: string): string | null {
  return EXPLORER ? `${EXPLORER}/tx/${hash}` : null;
}

/// Turns a contract revert into something a person can act on.
export function readableError(err: unknown): string {
  const e = err as { code?: number | string; shortMessage?: string; message?: string; data?: string };
  const raw = `${e?.shortMessage ?? ""} ${e?.message ?? ""} ${e?.data ?? ""}`;

  if (e?.code === 4001 || /user rejected|denied/i.test(raw)) return "";
  if (/SaleClosed/.test(raw)) return "This phase isn't open yet.";
  if (/WrongPayment/.test(raw)) return "The amount didn't match the price. Refresh and try again.";
  if (/SoldOut/.test(raw)) return "That would go past the 10,000 supply.";
  if (/NotOnFolklist/.test(raw)) return "This wallet isn't on the folklist.";
  if (/BadInput/.test(raw)) return "Check the quantity and try again.";
  if (/insufficient funds/i.test(raw)) return "Not enough in this wallet to cover the mint and gas.";
  if (/nonce|replacement/i.test(raw)) return "A previous transaction is still pending. Wait for it to finish.";
  if (/network|disconnect|failed to fetch/i.test(raw)) return "Network problem. Check your connection and try again.";
  return "The transaction failed. Try again.";
}
