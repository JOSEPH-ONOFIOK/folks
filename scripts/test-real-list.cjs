// Proves a real folklist address can mint on-chain with a real proof.
const fs=require("fs");const path=require("path");const {ethers}=require("ethers");
const {MerkleTree}=require("merkletreejs");const keccak256=require("keccak256");
const art=JSON.parse(fs.readFileSync(path.join(__dirname,"..",".hh-artifacts-folks.json"),"utf8"));
const leaf=a=>keccak256(Buffer.from(a.slice(2),"hex"));

(async()=>{
  const p=new ethers.JsonRpcProvider("http://127.0.0.1:8545");
  const owner=await p.getSigner(0);
  const addrs=JSON.parse(fs.readFileSync(path.join(__dirname,"..","data","folklist.json"),"utf8"));
  const tree=new MerkleTree(addrs.map(a=>leaf(a.toLowerCase())),keccak256,{sortPairs:true});
  const root="0x"+tree.getRoot().toString("hex");

  // Impersonate a wallet that is genuinely on the list.
  const victim=ethers.getAddress(addrs[12345]);
  await p.send("hardhat_impersonateAccount",[victim]);
  await p.send("hardhat_setBalance",[victim,"0x56BC75E2D63100000"]);
  const signer=new ethers.JsonRpcSigner(p, victim);

  const FEE=ethers.parseEther("0.00004");
  const c=await new ethers.ContractFactory(art.abi,art.bytecode,owner)
    .deploy(await owner.getAddress(),0,ethers.parseEther("0.0002"),FEE,"0x000000000000000000000000000000000000bEEF","i://");
  await c.waitForDeployment();
  await (await c.setFolklistRoot(root)).wait();
  const now=(await p.getBlock("latest")).timestamp;
  await (await c.setFolklistStart(now+5)).wait();
  await p.send("evm_setNextBlockTimestamp",[now+10]); await p.send("evm_mine",[]);

  const proof=tree.getHexProof(leaf(addrs[12345]));
  console.log("wallet   :",victim);
  console.log("proof len:",proof.length);
  const rc=await (await c.connect(signer).folklistMint(3,proof,{value:FEE*3n})).wait();
  console.log("mint tx  :",rc.status===1?"SUCCESS":"FAILED");
  console.log("balance  :",(await c.balanceOf(victim)).toString(),"Folks");
  console.log("gas used :",rc.gasUsed.toString());

  // A wallet not on the 183k list must fail.
  const outsider=await p.getSigner(1);
  try{
    await (await c.connect(outsider).folklistMint(1,proof,{value:FEE})).wait();
    console.log("outsider : FAIL — minted without being listed");
  }catch{ console.log("outsider : correctly rejected"); }
})().catch(e=>{console.log("ERR",e.shortMessage||e.message);process.exit(1);});
