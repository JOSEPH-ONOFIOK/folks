// Confirms every ETH a minter pays ends up with the deployer: the platform
// fee arrives per mint, the sale price waits in the contract for withdraw().
const fs=require("fs");const path=require("path");const {ethers}=require("ethers");
const {MerkleTree}=require("merkletreejs");const keccak256=require("keccak256");
const ROOT=path.join(__dirname,"..");
const art=JSON.parse(fs.readFileSync(path.join(ROOT,".hh-artifacts-folks.json"),"utf8"));
const leaf=a=>keccak256(Buffer.from(a.slice(2),"hex"));

let pass=0,fail=0;
const ok=(c,m)=>{c?(pass++,console.log("  PASS",m)):(fail++,console.log("  FAIL",m));};
const eth=v=>ethers.formatEther(v);

(async()=>{
  const p=new ethers.JsonRpcProvider("http://127.0.0.1:8545");
  const deployer=await p.getSigner(0);
  const DEPLOYER=await deployer.getAddress();
  const buyer=await p.getSigner(1);

  const FEE=ethers.parseEther("0.00004");
  const PUB=ethers.parseEther("0.01");

  // feeRecipient == deployer, exactly as the deploy script now defaults.
  const c=await new ethers.ContractFactory(art.abi,art.bytecode,deployer)
    .deploy(DEPLOYER,0,PUB,FEE,DEPLOYER,"i://");
  await c.deploymentTransaction().wait();
  const addr=await c.getAddress();
  ok((await c.feeRecipient()).toLowerCase()===DEPLOYER.toLowerCase(),"fee recipient is the deployer");

  const now=(await p.getBlock("latest")).timestamp;
  await (await c.setFolklistStart(now+5)).wait();
  await p.send("evm_setNextBlockTimestamp",[now+5+3601]); await p.send("evm_mine",[]);

  // 5 public mints.
  const QTY=5n;
  const cost=await c.mintCost(QTY);
  ok(cost===(PUB+FEE)*QTY,`minter pays ${eth(cost)} ETH for ${QTY} (price + fee)`);

  const rc=await (await c.connect(buyer).publicMint(QTY,{value:cost})).wait();
  const feeBefore=await p.getBalance(DEPLOYER,rc.blockNumber-1);

  // The buyer sent `cost`; whatever did not stay in the contract went to the
  // fee recipient. That holds regardless of gas the deployer spends.
  const feeAfter=await p.getBalance(DEPLOYER,rc.blockNumber);
  const heldNow=await p.getBalance(addr,rc.blockNumber);
  ok(cost-heldNow===FEE*QTY,`platform fee left the contract for the deployer (${eth(cost-heldNow)} ETH)`);
  ok(feeAfter-feeBefore===FEE*QTY,`deployer received the fee in that block (+${eth(feeAfter-feeBefore)} ETH)`);

  const held=await p.getBalance(addr,rc.blockNumber);
  ok(held===PUB*QTY,`sale proceeds waiting in the contract (${eth(held)} ETH)`);
  ok(FEE*QTY+held===cost,"fee + proceeds account for every wei the minter paid");

  // Now sweep the proceeds to the deployer too.
  const b1=await p.getBlockNumber();
  const before=await p.getBalance(DEPLOYER,b1);
  const rc2=await (await c.withdraw(DEPLOYER)).wait();
  const after=await p.getBalance(DEPLOYER,rc2.blockNumber);
  const gas=rc2.gasUsed*rc2.gasPrice;
  ok(after-before+gas===PUB*QTY,`withdraw sent proceeds to the deployer (+${eth(after-before+gas)} ETH before gas)`);
  ok(await p.getBalance(addr,rc2.blockNumber)===0n,"contract left empty");

  console.log(`\n  minter paid : ${eth(cost)} ETH`);
  console.log(`  deployer got: ${eth(FEE*QTY)} fee + ${eth(PUB*QTY)} proceeds = ${eth(cost)} ETH`);
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})().catch(e=>{console.error("harness error:",e.shortMessage||e.message);process.exit(1);});
