const fs=require("fs");const {ethers}=require("ethers");
const {MerkleTree}=require("merkletreejs");const keccak256=require("keccak256");
const art=JSON.parse(fs.readFileSync("./.hh-artifacts-folks.json","utf8"));
(async()=>{
  const p=new ethers.JsonRpcProvider("http://127.0.0.1:8545");
  const owner=await p.getSigner(0), bob=await p.getSigner(2), feeTo=await p.getSigner(4);
  const leaf=a=>keccak256(Buffer.from(a.slice(2),"hex"));
  const listed=[(await bob.getAddress()).toLowerCase()];
  const tree=new MerkleTree(listed.map(leaf),keccak256,{sortPairs:true});
  const FEE=ethers.parseEther("0.00004");
  const F=new ethers.ContractFactory(art.abi,art.bytecode,owner);
  const c=await F.deploy(await owner.getAddress(),0,1,FEE,await feeTo.getAddress(),"i://");
  await c.waitForDeployment();
  console.log("constructor feeRecipient ->", await c.feeRecipient());
  console.log("constructor platformFee  ->", ethers.formatEther(await c.platformFee()));
  console.log("feeTo address            ->", await feeTo.getAddress());
})().catch(e=>console.log("ERR",e.shortMessage||e.message));
