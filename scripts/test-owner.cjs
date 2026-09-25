// The deploy key signs the transaction but must not keep control: only the
// configured owner can open trading, move prices or take the money.
const fs=require("fs");const path=require("path");const {ethers}=require("ethers");
const ROOT=path.join(__dirname,"..");
const art=JSON.parse(fs.readFileSync(path.join(ROOT,".hh-artifacts-folks.json"),"utf8"));
const OWNER="0x9EC2C380297945e5db978319fCD6155cfB384BAB";

let pass=0,fail=0;
const ok=(c,m)=>{c?(pass++,console.log("  PASS",m)):(fail++,console.log("  FAIL",m));};
async function reverts(p,m){try{await p;fail++;console.log("  FAIL",m,"(did not revert)");}catch{pass++;console.log("  PASS",m);}}

(async()=>{
  const p=new ethers.JsonRpcProvider("http://127.0.0.1:8545");
  const deployer=await p.getSigner(0);
  const DEPLOYER=await deployer.getAddress();

  const c=await new ethers.ContractFactory(art.abi,art.bytecode,deployer)
    .deploy(OWNER,0,ethers.parseEther("0.01"),ethers.parseEther("0.00004"),OWNER,"i://");
  await c.deploymentTransaction().wait();

  ok((await c.owner()).toLowerCase()===OWNER.toLowerCase(),"owner is the Folks wallet, not the deployer");
  ok((await c.feeRecipient()).toLowerCase()===OWNER.toLowerCase(),"fees go to the owner");
  ok(OWNER.toLowerCase()!==DEPLOYER.toLowerCase(),"deployer and owner are different wallets");

  console.log("\n-- the deploy key has no power --");
  await reverts(c.openTransfers(),"deployer cannot open trading");
  await reverts(c.setPrices(1,2),"deployer cannot change prices");
  await reverts(c.setFolklistStart(1),"deployer cannot change the schedule");
  await reverts(c.teamMint(1),"deployer cannot team mint");
  await reverts(c.withdraw(DEPLOYER),"deployer cannot withdraw");

  console.log("\n-- the owner does --");
  await p.send("hardhat_impersonateAccount",[OWNER]);
  await p.send("hardhat_setBalance",[OWNER,"0x56BC75E2D63100000"]);
  const asOwner=new ethers.Contract(await c.getAddress(),art.abi,new ethers.JsonRpcSigner(p,OWNER));

  await (await asOwner.setPrices(0,ethers.parseEther("0.02"))).wait();
  ok(await c.publicPrice()===ethers.parseEther("0.02"),"owner changed the price");

  await (await asOwner.teamMint(5)).wait();
  ok(await c.balanceOf(OWNER)===5n,"owner team minted");
  ok(await c.balanceOf(DEPLOYER)===0n,"the reserve cannot land anywhere but the owner");
  ok(c.interface.getFunction("teamMint").inputs.length===1,
     "teamMint takes only a quantity, so there is no address to mistype");

  ok(await c.transfersLocked()===true,"trading still locked");
  await (await asOwner.openTransfers()).wait();
  ok(await c.transfersLocked()===false,"owner opened trading");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail?1:0);
})().catch(e=>{console.error("harness error:",e.shortMessage||e.message);process.exit(1);});
