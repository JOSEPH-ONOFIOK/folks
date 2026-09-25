// Rehearses the whole sale against the deployed contract: schedule it, team
// mint, then mint from a wallet that was in the newly added batch.
const fs=require("fs");const path=require("path");const {ethers}=require("ethers");
const {MerkleTree}=require("merkletreejs");const keccak256=require("keccak256");
const ROOT=path.join(__dirname,"..");
const art=JSON.parse(fs.readFileSync(path.join(ROOT,".hh-artifacts-folks.json"),"utf8"));
const dep=JSON.parse(fs.readFileSync(path.join(ROOT,"deployed.json"),"utf8"));
const leaf=a=>keccak256(Buffer.from(a.slice(2),"hex"));

let pass=0,fail=0;
const ok=(c,m)=>{c?(pass++,console.log("  PASS",m)):(fail++,console.log("  FAIL",m));};

(async()=>{
  const p=new ethers.JsonRpcProvider("http://127.0.0.1:8545");
  const owner=await p.getSigner(0);
  const c=new ethers.Contract(dep.address,art.abi,owner);

  const addrs=JSON.parse(fs.readFileSync(path.join(ROOT,"data","folklist.json"),"utf8"));
  const tree=new MerkleTree(addrs.map(a=>leaf(a.toLowerCase())),keccak256,{sortPairs:true});

  ok((await c.folklistRoot()).toLowerCase()===dep.root.toLowerCase(),"deployed root matches the built root");
  ok(await c.MAX_SUPPLY()===10000n,"supply capped at 10,000");
  ok(await c.phase()===0n,"sale not open until scheduled");

  console.log("\n-- team mint (5:30pm) --");
  await (await c.teamMint(await owner.getAddress(),150)).wait();
  ok(await c.teamMinted()===150n,"team minted 150");

  console.log("\n-- schedule 6pm, public follows at 7pm --");
  const now=(await p.getBlock("latest")).timestamp;
  await (await c.setFolklistStart(now+60)).wait();
  ok(await c.publicStart()===BigInt(now+60+3600),"public opens exactly one hour later");

  await p.send("evm_setNextBlockTimestamp",[now+120]); await p.send("evm_mine",[]);
  ok(await c.phase()===1n,"folklist live");

  console.log("\n-- mint from a NEWLY ADDED wallet --");
  const fresh="0x549A2f9BeC0AE0D746A5e884C012A4bb79D9EBaF";
  await p.send("hardhat_impersonateAccount",[fresh]);
  await p.send("hardhat_setBalance",[fresh,"0x56BC75E2D63100000"]);
  const signer=new ethers.JsonRpcSigner(p,fresh);
  const proof=tree.getHexProof(leaf(fresh.toLowerCase()));
  const cost=await c.mintCost(2);
  await (await c.connect(signer).folklistMint(2,proof,{value:cost})).wait();
  ok(await c.balanceOf(fresh)===2n,`new batch wallet minted 2 (cost ${ethers.formatEther(cost)} ETH)`);

  console.log("\n-- public --");
  await p.send("evm_setNextBlockTimestamp",[now+60+3700]); await p.send("evm_mine",[]);
  ok(await c.phase()===2n,"public live after the hour");
  const buyer=await p.getSigner(3);
  await (await c.connect(buyer).publicMint(1,{value:await c.mintCost(1)})).wait();
  ok(await c.balanceOf(await buyer.getAddress())===1n,"anyone can mint in public");

  console.log("\n-- withdraw --");
  const PAYOUT="0x000000000000000000000000000000000000cafE";
  const bn=await p.getBlockNumber();
  const before=await p.getBalance(PAYOUT,bn);
  const rc=await (await c.withdraw(PAYOUT)).wait();
  ok((await p.getBalance(PAYOUT,rc.blockNumber))>before,"owner withdrew proceeds");

  console.log(`\ntotal minted: ${(await c.totalMinted()).toString()} / 10,000`);
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})().catch(e=>{console.error("harness error:",e.shortMessage||e.message);process.exit(1);});
