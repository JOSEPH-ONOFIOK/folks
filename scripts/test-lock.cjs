// Trading must be shut during the mint without blocking the mint itself.
const fs=require("fs");const path=require("path");const {ethers}=require("ethers");
const {MerkleTree}=require("merkletreejs");const keccak256=require("keccak256");
const ROOT=path.join(__dirname,"..");
const art=JSON.parse(fs.readFileSync(path.join(ROOT,".hh-artifacts-folks.json"),"utf8"));
const leaf=a=>keccak256(Buffer.from(a.slice(2),"hex"));

let pass=0,fail=0;
const ok=(c,m)=>{c?(pass++,console.log("  PASS",m)):(fail++,console.log("  FAIL",m));};
async function reverts(p,m){try{await p;fail++;console.log("  FAIL",m,"(did not revert)");}catch{pass++;console.log("  PASS",m);}}

(async()=>{
  const p=new ethers.JsonRpcProvider("http://127.0.0.1:8545");
  const owner=await p.getSigner(0), alice=await p.getSigner(1), bob=await p.getSigner(2);
  const A=await alice.getAddress(), B=await bob.getAddress();

  const FEE=ethers.parseEther("0.00004"), PUB=ethers.parseEther("0.01");
  const listed=[A.toLowerCase()];
  const tree=new MerkleTree(listed.map(leaf),keccak256,{sortPairs:true});

  const c=await new ethers.ContractFactory(art.abi,art.bytecode,owner)
    .deploy(await owner.getAddress(),0,PUB,FEE,await owner.getAddress(),"i://");
  await c.deploymentTransaction().wait();
  await (await c.setFolklistRoot("0x"+tree.getRoot().toString("hex"))).wait();

  ok(await c.transfersLocked()===true,"trading is locked by default");

  console.log("\n-- the sale still runs --");
  await (await c.teamMint(10)).wait();
  ok(await c.balanceOf(await owner.getAddress())===10n,"team mint works while locked");

  const now=(await p.getBlock("latest")).timestamp;
  await (await c.setFolklistStart(now+5)).wait();
  await p.send("evm_setNextBlockTimestamp",[now+10]); await p.send("evm_mine",[]);
  await (await c.connect(alice).folklistMint(3,tree.getHexProof(leaf(listed[0])),{value:FEE*3n})).wait();
  ok(await c.balanceOf(A)===3n,"folklist mint works while locked");

  await p.send("evm_setNextBlockTimestamp",[now+5+3601]); await p.send("evm_mine",[]);
  await (await c.connect(bob).publicMint(2,{value:(PUB+FEE)*2n})).wait();
  ok(await c.balanceOf(B)===2n,"public mint works while locked");

  console.log("\n-- but nothing can change hands --");
  const tokenId=await c.tokenOfOwnerByIndex ? null : 11; // alice's first token
  await reverts(c.connect(alice).transferFrom(A,B,11),"direct transfer blocked");
  await reverts(c.connect(alice)["safeTransferFrom(address,address,uint256)"](A,B,11),"safe transfer blocked");

  // A marketplace takes approval first, then moves the token. Approval is
  // allowed; the move is what fails, which is what stops a live listing.
  await (await c.connect(alice).setApprovalForAll(B,true)).wait();
  ok(await c.isApprovedForAll(A,B)===true,"approval itself still succeeds");
  await reverts(c.connect(bob).transferFrom(A,B,11),"an approved marketplace still cannot move it");

  console.log("\n-- opening trading --");
  await reverts(c.connect(alice).openTransfers(),"only the owner can open trading");
  await (await c.openTransfers()).wait();
  ok(await c.transfersLocked()===false,"trading open");

  const owned = await c.ownerOf(11);
  ok(owned===A,"alice still holds token 11 after the lock period");
  const c2 = new ethers.Contract(await c.getAddress(), art.abi, await p.getSigner(1));
  await (await c2.transferFrom(A, B, 11, { gasLimit: 200000 })).wait();
  ok(await c.ownerOf(11)===B,"transfer works once opened");

  console.log("\n-- and it cannot be re-locked --");
  ok(typeof c.lockTransfers!=="function","no function exists to lock it again");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})().catch(e=>{console.error("harness error:",e.shortMessage||e.message);process.exit(1);});
