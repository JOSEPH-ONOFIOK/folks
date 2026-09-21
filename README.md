# Folks — Whitelist Checker

A Next.js app that checks whether a wallet address is on **your** eligibility allowlist.
The list lives server-side and is never shipped to the browser — the API only returns
a verdict for the single address that was asked about.

## Run

```bash
npm install
npm run dev      # http://localhost:3000
```

## Update the allowlist

Edit [`data/allowlist.json`](data/allowlist.json). Each entry needs an `address`;
`tier` and `points` are optional and shown in the result when present.

```json
{
  "entries": [
    { "address": "0xabc...def", "tier": "OG", "points": 5000 },
    { "address": "0x123...789" }
  ]
}
```

- Addresses are matched **case-insensitively** — paste checksummed, lowercase, or
  `0X`-uppercase, surrounding whitespace is trimmed.
- Only shape is validated (`0x` + 40 hex chars), not EIP-55 checksum, so lowercase
  lists work fine.

## Deploy

Any Next.js host (Vercel, etc.). The `/api/check` route runs on the Node runtime.

## Notes

This is **your own allowlist**, independent of the Folks backend. It does not read
or scrape thefolks.xyz — you control who's eligible by editing the JSON.
