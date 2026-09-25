#!/bin/sh
# Compiles lib/wallet.ts to plain JS, then runs the discovery tests against
# a hand-rolled window. No browser and no jsdom needed.
set -e
cd "$(dirname "$0")/.."
rm -rf .wallet-test
npx tsc lib/wallet.ts --target es2020 --module es2020 \
  --moduleResolution bundler --outDir .wallet-test --skipLibCheck
node scripts/test-wallet.mjs
