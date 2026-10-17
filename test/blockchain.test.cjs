'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { generateKeyPair, createProof, getAnchorDigest } = require('../index.cjs');
const { REGISTRY_ABI, readAnchor, anchorProof } = require('../blockchain.cjs');
const ADDRESS='0x'+'a'.repeat(40);
async function fixture(t) {
  const d=await fs.mkdtemp(path.join(os.tmpdir(),'indo-chain-'));t.after(()=>fs.rm(d,{recursive:true,force:true}));
  const f=path.join(d,'doc');await fs.writeFile(f,'document');const k=generateKeyPair();
  return createProof(f,{issuer:'Demo',privateKey:k.privateKey});
}
test('registry ABI has anchoring and reading',()=>{
  assert.deepEqual(REGISTRY_ABI.filter(x=>x.type==='function').map(x=>x.name),['anchor','getAnchorBlock']);
});
test('readAnchor returns unanchored for block zero',async t=>{
  const proof=await fixture(t);
  const result=await readAnchor(proof,{contractAddress:ADDRESS,publicClient:{readContract:async({args})=>{assert.equal(args[0],getAnchorDigest(proof));return 0n;}}});
  assert.equal(result.anchored,false);assert.equal(result.blockNumber,null);
});
test('anchorProof uses simulate, sends tx, waits, and reads chain state',async t=>{
  const proof=await fixture(t);let recorded=false;let called=false;
  const publicClient={
    readContract:async()=>recorded?12n:0n,
    simulateContract:async request=>{assert.equal(request.functionName,'anchor');called=true;return {request:{...request}};},
    waitForTransactionReceipt:async()=>{recorded=true;return {status:'success'};}
  };
  const walletClient={account:'0x'+'b'.repeat(40),writeContract:async()=> '0x'+'c'.repeat(64)};
  const x=await anchorProof(proof,{publicClient,walletClient,contractAddress:ADDRESS});
  assert.equal(x.anchored,true);assert.equal(x.blockNumber,12n);assert.equal(x.alreadyAnchored,false);assert.equal(called,true);
});
test('anchorProof does not resend if already anchored',async t=>{
  const proof=await fixture(t);
  const x=await anchorProof(proof,{contractAddress:ADDRESS,publicClient:{readContract:async()=>7n},walletClient:{account:'x',writeContract:async()=>{throw new Error('should not send');}}});
  assert.equal(x.alreadyAnchored,true);
});
test('reverted anchor receipt results in error',async t=>{
  const proof=await fixture(t);
  const publicClient={readContract:async()=>0n,simulateContract:async()=>({request:{}}),waitForTransactionReceipt:async()=>({status:'reverted'})};
  const walletClient={account:'x',writeContract:async()=> '0x123'};
  await assert.rejects(anchorProof(proof,{contractAddress:ADDRESS,publicClient,walletClient}),/failed/);
});
