import raw from "@/data/allowlist.json";

export type AllowlistEntry = {
  address: string;
  tier?: string;
  points?: number;
};

export type CheckResult =
  | { status: "eligible"; address: string; tier: string | null; points: number | null }
  | { status: "not_eligible"; address: string }
  | { status: "invalid"; reason: string };

// Basic EVM address shape: 0x followed by 40 hex chars. We validate shape only,
// not checksum, so users can paste a lowercase address and still match.
const EVM_RE = /^0x[0-9a-fA-F]{40}$/i;

export function isValidEvmAddress(input: string): boolean {
  return EVM_RE.test(input.trim());
}

// Case-insensitive: the same wallet can be written checksummed or lowercase,
// so we key everything on the lowercase form.
function normalize(address: string): string {
  return address.trim().toLowerCase();
}

// Build the lookup once at module load rather than scanning the array per request.
const index: Map<string, AllowlistEntry> = (() => {
  const m = new Map<string, AllowlistEntry>();
  const entries = (raw.entries ?? []) as AllowlistEntry[];
  for (const e of entries) {
    if (!e?.address || !isValidEvmAddress(e.address)) continue;
    m.set(normalize(e.address), e);
  }
  return m;
})();

export function eligibleCount(): number {
  return index.size;
}

export function checkAddress(input: string): CheckResult {
  const trimmed = (input ?? "").trim();
  if (!trimmed) {
    return { status: "invalid", reason: "Enter a wallet address." };
  }
  if (!isValidEvmAddress(trimmed)) {
    return { status: "invalid", reason: "That doesn't look like a valid EVM address (0x + 40 hex characters)." };
  }

  const hit = index.get(normalize(trimmed));
  if (!hit) {
    return { status: "not_eligible", address: trimmed };
  }
  return {
    status: "eligible",
    address: trimmed,
    tier: hit.tier ?? null,
    points: typeof hit.points === "number" ? hit.points : null,
  };
}
