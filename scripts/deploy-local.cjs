const fs=require("fs");const path=require("path");const {ethers}=require("ethers");
const art=JSON.parse(fs.readFileSync(path.join(__dirname,"..",".hh-artifacts-folks.json"),"utf8"));
const root=require(path.join(__dirname,"..","data","folklist-root.json")).root;
(async()=>{
  const p=new ethers.JsonRpcProvider("http://127.0.0.1:8545");
  const owner=await p.getSigner(0);
  const c=await new ethers.ContractFactory(art.abi,art.bytecode,owner).deploy(
    await owner.getAddress(), 0, ethers.parseEther("0.0002"),
    ethers.parseEther("0.00004"), "0x000000000000000000000000000000000000bEEF", "ipfs://folks/");
  await c.waitForDeployment();
  await (await c.setFolklistRoot(root)).wait();
  const now=(await p.getBlock("latest")).timestamp;
  // Open folklist right now so the page lands in phase 1.
  await (await c.setFolklistStart(now+2)).wait();
  await (await c.teamMint(await owner.getAddress(),150)).wait();
  await p.send("evm_setNextBlockTimestamp",[now+5]); await p.send("evm_mine",[]);
  console.log(await c.getAddress());
})();
