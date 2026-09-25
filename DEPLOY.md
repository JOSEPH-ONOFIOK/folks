# Deploying Folks

Everything below has been rehearsed end to end on a local chain. The only
step that cannot be rehearsed is the real network, which needs an RPC URL
and a funded deployer key.

## 1. What you need

| | |
|---|---|
| RPC URL | Robinhood Chain endpoint |
| Deployer key | a private key with gas on that chain |
| Fee recipient | optional — leave blank and both the fee and the proceeds go to the deployer |
| Owner address | defaults to `0x9EC2C380297945e5db978319fCD6155cfB384BAB` |

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

**Connect the owner wallet `0x9EC2…4BAB`.** The deploy key cannot do any of
this; it signs the deployment and nothing else. Any other wallet sees the
panel read-only.

Then:

1. **Team mint** — 150 to the team wallet. Do this before the sale opens.
2. **Sale time** — set folklist to **6:00pm WAT (17:00 UTC)**. Public opens
   automatically an hour later at 7pm. Team is expected at 5:30pm, so mint
   the team allocation before then.
3. **Prices** — folklist 0, public as agreed.
4. **Platform fee** — the per-mint fee and where it goes.

Secondary trading is **locked at deploy**: Folks can be minted but not
transferred or listed. Open it from the **Secondary trading** card once the
mint is done. That is one-way — trading cannot be locked again, so holders
never have to worry about being frozen.

The contract enforces all of this. Nothing can mint early or underpay by
calling the contract directly.

## Where the money goes

Every mint is `price + platform fee`, and both halves end up with you:

- **Platform fee** is forwarded the moment someone mints, to `FEE_RECIPIENT`.
  Leave that blank and it goes to the deployer.
- **Sale price** accumulates in the contract until the owner calls
  `withdraw(address)`, which sweeps the balance anywhere you choose.

Keeping them separate means `withdraw()` only ever moves sale proceeds, so a
withdrawal can never accidentally claw back fees already paid out. To split
the revenue later, change the fee recipient from `/admin`.

## Known gaps

- **The contract has not been audited.** It is covered by 49 tests, which is
  not the same as an adversarial review, and it will custody real money.
- `BASE_URI` can be left empty at deploy and set later with `setBaseURI`
  once the art is pinned.
