// Compiles contracts/Folks.sol with solc, resolving imports from node_modules.
// Hardhat's own compiler download is blocked in some environments, so this
// keeps the build reproducible without it.
const fs = require("fs"), path = require("path");
const solc = require("solc");
const ROOT = path.join(__dirname, "..");

function findImport(p) {
  for (const c of [path.join(ROOT, "node_modules", p), path.join(ROOT, p)]) {
    if (fs.existsSync(c)) return { contents: fs.readFileSync(c, "utf8") };
  }
  return { error: "not found: " + p };
}

const input = {
  language: "Solidity",
  sources: { "contracts/Folks.sol": { content: fs.readFileSync(path.join(ROOT, "contracts/Folks.sol"), "utf8") } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } },
  },
};

const out = JSON.parse(solc.compile(JSON.stringify(input), { import: findImport }));
const errs = (out.errors || []).filter((e) => e.severity === "error");
(out.errors || []).filter((e) => e.severity === "warning")
  .forEach((w) => console.log("WARN:", w.formattedMessage.split("\n")[0]));
if (errs.length) { errs.forEach((e) => console.log(e.formattedMessage)); process.exit(1); }

const c = out.contracts["contracts/Folks.sol"].Folks;
console.log("compiled  deployed bytes:", c.evm.deployedBytecode.object.length / 2, "(limit 24576)");
fs.writeFileSync(path.join(ROOT, ".hh-artifacts-folks.json"),
  JSON.stringify({ abi: c.abi, bytecode: "0x" + c.evm.bytecode.object }, null, 2));
