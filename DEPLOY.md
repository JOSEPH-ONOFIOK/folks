# Deploying Folks

Everything below has been rehearsed end to end on a local chain. The only
step that cannot be rehearsed is the real network, which needs an RPC URL
and a funded deployer key.

## 1. What you need

| | |
|---|---|
| RPC URL | Robinhood Chain endpoint |
| Deployer key | a private key with gas on that chain |
| Fee recipient | address that receives the $0.10 platform fee per mint |
| Owner address | who controls the contract afterwards (defaults to deployer) |

Deployment costs roughly **1,897,338 gas** — about 0.0057 ETH at 3 gwei.

## 2. Set the environment

```bash
cp .env.deploy.example .env.deploy
# fill it in, then:
set -a && source .env.deploy && set +a
```

`.env.deploy` is gitignored. Never commit a real key.

## 3. Build the folklist root

```bash
npm run merkle:build
```

Reads `data/folklist.json` (184,061 wallets) and writes the root to
`data/folklist-root.json`. Re-run this whenever the list changes, then set
the new root from `/admin`.

## 4. Compile and test

```bash
npm run contracts:compile
npm run chain                  # separate terminal
npm run contracts:test         # 30 checks
npm run contracts:test-withdraw # 9 checks
```

Each suite needs a freshly started chain; balances carry over otherwise and
assertions about deltas will read wrong.

## 5. Dry run

```bash
npm run deploy:dry
```

Prints the network, deployer balance, every constructor value and the gas
estimate. Sends nothing. **Check the numbers before going further.**

## 6. Deploy

```bash
npm run deploy
```

Deploys, sets the folklist root, verifies the root stuck, and writes
`deployed.json`.

## 7. Point the site at it

```
NEXT_PUBLIC_CONTRACT_ADDRESS=0x...   # from the deploy output
NEXT_PUBLIC_CHAIN_ID=...
NEXT_PUBLIC_CHAIN_NAME=Robinhood Chain
NEXT_PUBLIC_RPC_URL=...
NEXT_PUBLIC_EXPLORER=https://...
NEXT_PUBLIC_SITE_URL=https://thefolks.xyz
```

Set these in Vercel, then redeploy. Without the contract address the mint
page renders but refuses to mint.

## 8. Open /admin and finish the setup

Connect as the owner, then:

1. **Team mint** — 150 to the team wallet. Do this before the sale opens.
2. **Sale time** — set folklist to **6:00pm WAT (17:00 UTC)**. Public opens
   automatically an hour later at 7pm. Team is expected at 5:30pm, so mint
   the team allocation before then.
3. **Prices** — folklist 0, public as agreed.
4. **Platform fee** — the per-mint fee and where it goes.

The contract enforces all of this. Nothing can mint early or underpay by
calling the contract directly.

## After the sale

`withdraw(address)` sends the proceeds anywhere the owner chooses. Platform
fees are forwarded per mint and never mix with proceeds.

## Known gaps

- **The contract has not been audited.** It is covered by 49 tests, which is
  not the same as an adversarial review, and it will custody real money.
- `BASE_URI` can be left empty at deploy and set later with `setBaseURI`
  once the art is pinned.
