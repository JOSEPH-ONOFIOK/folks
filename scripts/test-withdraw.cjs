// Exercises withdraw(): who can call it, where the money goes, and that the
// platform fee is never swept along with sale proceeds.
const fs=require("fs");const path=require("path");const {ethers}=require("ethers");
const {MerkleTree}=require("merkletreejs");const keccak256=require("keccak256");
const art=JSON.parse(fs.readFileSync(path.join(__dirname,"..",".hh-artifacts-folks.json"),"utf8"));
const leaf=a=>keccak256(Buffer.from(a.slice(2),"hex"));

let pass=0,fail=0;
const ok=(c,m)=>{ if(c){pass++;console.log("  PASS",m);} else {fail++;console.log("  FAIL",m);} };
async function reverts(p,m){ try{ await p; fail++; console.log("  FAIL",m,"(did not revert)"); }catch{ pass++; console.log("  PASS",m);} }

(async()=>{
  const p=new ethers.JsonRpcProvider("http://127.0.0.1:8545");
  const owner=await p.getSigner(0), buyer=await p.getSigner(1), stranger=await p.getSigner(2);
  const FEE_ADDR="0x000000000000000000000000000000000000bEEF";
  const PAYOUT="0x000000000000000000000000000000000000cafE";

  const FEE=ethers.parseEther("0.00004");
  const PUB=ethers.parseEther("0.01");
  const c=await new ethers.ContractFactory(art.abi,art.bytecode,owner)
    .deploy(await owner.getAddress(),0,PUB,FEE,FEE_ADDR,"i://");
  await c.waitForDeployment();
  const addr=await c.getAddress();

  const now=(await p.getBlock("latest")).timestamp;
  await (await c.setFolklistStart(now+5)).wait();
  await p.send("evm_setNextBlockTimestamp",[now+5+3601]); await p.send("evm_mine",[]);
  ok(await c.phase()===2n,"public phase open");

  // 4 public mints: 4*PUB should stay in the contract, 4*FEE goes to fee addr.
  await (await c.connect(buyer).publicMint(4,{value:(PUB+FEE)*4n})).wait();
  const held=await p.getBalance(addr);
  ok(held===PUB*4n, `contract holds only sale proceeds (${ethers.formatEther(held)} ETH)`);
  ok(await p.getBalance(FEE_ADDR)===FEE*4n,"platform fee went to the fee address, not the contract");

  console.log("\n-- access --");
  await reverts(c.connect(stranger).withdraw(await stranger.getAddress()),"non-owner cannot withdraw");
  await reverts(c.withdraw(ethers.ZeroAddress),"cannot withdraw to the zero address");

  console.log("\n-- payout --");
  const bn0=await p.getBlockNumber();
  const before=await p.getBalance(PAYOUT,bn0);
  const rc=await (await c.withdraw(PAYOUT)).wait();
  const after=await p.getBalance(PAYOUT,rc.blockNumber);
  ok(after-before===PUB*4n,`owner withdrew everything (+${ethers.formatEther(after-before)} ETH)`);
  ok(await p.getBalance(addr, rc.blockNumber)===0n,"contract drained to zero");

  console.log("\n-- after draining --");
  const rc2=await (await c.withdraw(PAYOUT)).wait();
  ok(await p.getBalance(addr, rc2.blockNumber)===0n,"withdrawing an empty contract is a no-op, not a revert");

  const rc3=await (await c.connect(buyer).publicMint(1,{value:PUB+FEE})).wait();
  ok(await p.getBalance(addr, rc3.blockNumber)===PUB,"proceeds accumulate again after a withdrawal");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})().catch(e=>{console.error("harness error:",e.shortMessage||e.message);process.exit(1);});
