const fs=require("fs");const {ethers}=require("ethers");
const {MerkleTree}=require("merkletreejs");const keccak256=require("keccak256");
const art=JSON.parse(fs.readFileSync("/Users/divineonofiok/folks-checker/.hh-artifacts-folks.json","utf8"));
(async()=>{
  const p=new ethers.JsonRpcProvider("http://127.0.0.1:8545");
  const owner=await p.getSigner(0), alice=await p.getSigner(1), bob=await p.getSigner(2), feeTo=await p.getSigner(4);
  const leaf=a=>keccak256(Buffer.from(a.slice(2),"hex"));
  const listed=[await alice.getAddress(),await bob.getAddress()].map(a=>a.toLowerCase());
  const tree=new MerkleTree(listed.map(leaf),keccak256,{sortPairs:true});
  const root="0x"+tree.getRoot().toString("hex");
  const FEE=ethers.parseEther("0.00004");
  const F=new ethers.ContractFactory(art.abi,art.bytecode,owner);
  const c=await F.deploy(await owner.getAddress(),0,ethers.parseEther("0.0002"),FEE,await feeTo.getAddress(),"ipfs://b/");
  await c.waitForDeployment();
  await (await c.setFolklistRoot(root)).wait();
  const now=(await p.getBlock("latest")).timestamp;
  await (await c.setFolklistStart(now+10)).wait();
  await p.send("evm_setNextBlockTimestamp",[now+20]); await p.send("evm_mine",[]);

  const pBob=tree.getHexProof(leaf(listed[1]));
  console.log("bob proof:",pBob);
  const before=await p.getBalance(await feeTo.getAddress());
  const tx=await c.connect(bob).folklistMint(2,pBob,{value:FEE*2n});
  const rc=await tx.wait();
  const after=await p.getBalance(await feeTo.getAddress());
  console.log("status:",rc.status,"bob balance NFTs:",(await c.balanceOf(await bob.getAddress())).toString());
  console.log("feeTo delta:",ethers.formatEther(after-before),"ETH  expected:",ethers.formatEther(FEE*2n));
})().catch(e=>console.log("ERR",e.shortMessage||e.message));
