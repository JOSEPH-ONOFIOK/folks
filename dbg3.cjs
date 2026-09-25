const fs=require("fs");const {ethers}=require("ethers");
const {MerkleTree}=require("merkletreejs");const keccak256=require("keccak256");
const art=JSON.parse(fs.readFileSync("./.hh-artifacts-folks.json","utf8"));
(async()=>{
  const p=new ethers.JsonRpcProvider("http://127.0.0.1:8545");
  const owner=await p.getSigner(0), bob=await p.getSigner(2);
  // use a plain EOA that never sends tx, so gas can't confound the reading
  const feeAddr="0x000000000000000000000000000000000000BEEF";
  const leaf=a=>keccak256(Buffer.from(a.slice(2),"hex"));
  const listed=[(await bob.getAddress()).toLowerCase()];
  const tree=new MerkleTree(listed.map(leaf),keccak256,{sortPairs:true});
  const FEE=ethers.parseEther("0.00004");
  const F=new ethers.ContractFactory(art.abi,art.bytecode,owner);
  const c=await F.deploy(await owner.getAddress(),0,1,FEE,feeAddr,"i://");
  await c.waitForDeployment();
  await (await c.setFolklistRoot("0x"+tree.getRoot().toString("hex"))).wait();
  const now=(await p.getBlock("latest")).timestamp;
  await (await c.setFolklistStart(now+5)).wait();
  await p.send("evm_setNextBlockTimestamp",[now+10]); await p.send("evm_mine",[]);

  const before=await p.getBalance(feeAddr);
  const rc=await (await c.connect(bob).folklistMint(2,tree.getHexProof(leaf(listed[0])),{value:FEE*2n})).wait();
  const after=await p.getBalance(feeAddr);
  console.log("tx status:",rc.status);
  console.log("fee addr before:",before.toString());
  console.log("fee addr after :",after.toString());
  console.log("delta          :",(after-before).toString(),"expected",(FEE*2n).toString());
  console.log(( after-before === FEE*2n ) ? "\n>>> FEE FORWARDING WORKS" : "\n>>> FEE NOT FORWARDED");
})().catch(e=>console.log("ERR",e.shortMessage||e.message));
