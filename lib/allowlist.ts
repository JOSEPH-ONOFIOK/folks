import addresses from "@/data/folklist.json";

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

// A Set of ~184k strings built once at module load. Lookups are O(1), so a
// busy mint doesn't scan the list per request.
const index: Set<string> = new Set(addresses as string[]);

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

  if (!index.has(normalize(trimmed))) {
    return { status: "not_eligible", address: trimmed };
  }
  return { status: "eligible", address: trimmed, tier: "Folklist", points: null };
}
