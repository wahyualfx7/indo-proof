'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
  sha256Buffer, hashFile, generateKeyPair, keyFingerprint, createProof, inspectProof,
  verifyProof, getAnchorDigest, createVerificationURL, generateQRCodeDataURL
} = require('../index.cjs');

async function setup(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'indo-proof-test-'));
  t.after(()=>fs.rm(dir, {force:true,recursive:true}));
  const file = path.join(dir,'test.txt');
  await fs.writeFile(file, 'Halo Indonesia!\n');
  return {dir,file};
}

test('sha256Buffer uses SHA-256 digest', ()=>assert.equal(sha256Buffer(Buffer.from('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'));
test('hashFile supports streaming and byte count', async t=>{
  const {file}=await setup(t);const x=await hashFile(file);assert.match(x.sha256,/^[a-f0-9]{64}$/);assert.equal(x.sizeBytes,16);
});
test('generate keys and stable Ed25519 fingerprint',()=>{
  const a=generateKeyPair();assert.match(a.publicKey,/BEGIN PUBLIC KEY/);assert.match(a.privateKey,/BEGIN PRIVATE KEY/);assert.equal(keyFingerprint(a.publicKey),a.keyId);
});
test('happy path signs and verifies with trusted issuer key',async t=>{
  const {file}=await setup(t);const keys=generateKeyPair();const proof=await createProof(file,{issuer:'Sekolah A',privateKey:keys.privateKey});
  const result=await verifyProof(file,proof,{trustedPublicKeys:[keys.publicKey]});
  assert.equal(result.valid,true);assert.deepEqual(result.problems,[]);assert.equal(result.issuer,'Sekolah A');
});
test('signatures cannot be trusted without externally trusted key',async t=>{
  const {file}=await setup(t);const keys=generateKeyPair();const proof=await createProof(file,{issuer:'Kementerian Contoh',privateKey:keys.privateKey});
  const result=await verifyProof(file,proof);
  assert.equal(result.valid,false);assert.equal(result.signatureValid,true);assert.equal(result.trustedIssuer,false);assert.ok(result.problems.includes('UNTRUSTED_ISSUER'));
});
test('wrong trusted key rejected even when signature valid',async t=>{
  const {file}=await setup(t);const keys=generateKeyPair();const proof=await createProof(file,{issuer:'Sekolah',privateKey:keys.privateKey});
  const result=await verifyProof(file,proof,{trustedPublicKeys:[generateKeyPair().publicKey]});assert.equal(result.valid,false);
});
test('changing file causes hash mismatch',async t=>{
  const {file}=await setup(t);const keys=generateKeyPair();const proof=await createProof(file,{issuer:'Sekolah',privateKey:keys.privateKey});
  await fs.appendFile(file,'X');const result=await verifyProof(file,proof,{trustedPublicKeys:[keys.publicKey]});
  assert.equal(result.documentMatches,false);assert.ok(result.problems.includes('DOCUMENT_CHANGED'));
});
test('altering signed payload invalidates signature',async t=>{
  const {file}=await setup(t);const keys=generateKeyPair();const proof=await createProof(file,{issuer:'Sekolah',privateKey:keys.privateKey});
  const payload=inspectProof(proof);payload.issuer.name='Penipu';proof.payloadBase64Url=Buffer.from(JSON.stringify(payload)).toString('base64url');
  const result=await verifyProof(file,proof,{trustedPublicKeys:[keys.publicKey]});assert.equal(result.signatureValid,false);assert.ok(result.problems.includes('INVALID_SIGNATURE'));
});
test('invalid signature bytes rejected',async t=>{
  const {file}=await setup(t);const keys=generateKeyPair();const proof=await createProof(file,{issuer:'Sekolah',privateKey:keys.privateKey});
  proof.signature.valueBase64Url='nonsense';const result=await verifyProof(file,proof,{trustedPublicKeys:[keys.publicKey]});
  assert.equal(result.valid,false);assert.match(result.problems[0],/INVALID_PROOF/);
});
test('tampering with embedded signer public key is rejected',async t=>{
  const {file}=await setup(t);const keys=generateKeyPair();const proof=await createProof(file,{issuer:'Sekolah',privateKey:keys.privateKey});
  proof.signature.publicKeyPem=generateKeyPair().publicKey;const result=await verifyProof(file,proof,{trustedPublicKeys:[keys.publicKey]});
  assert.equal(result.valid,false);assert.match(result.problems[0],/INVALID_PROOF/);
});
test('signed proof metadata and optional filename',async t=>{
  const {file}=await setup(t);const keys=generateKeyPair();const proof=await createProof(file,{issuer:'Sekolah',privateKey:keys.privateKey,metadata:{course:'NodeJS'},includeFilename:true});
  assert.equal(inspectProof(proof).metadata.course,'NodeJS');assert.equal(inspectProof(proof).document.filename,'test.txt');
});
test('filenames are not included by default',async t=>{
  const {file}=await setup(t);const keys=generateKeyPair();const proof=await createProof(file,{issuer:'Sekolah',privateKey:keys.privateKey});
  assert.equal('filename' in inspectProof(proof).document,false);
});
test('encrypts private key when passphrase configured',async t=>{
  const {file}=await setup(t);const keys=generateKeyPair({passphrase:'demo strong password'});
  assert.match(keys.privateKey,/ENCRYPTED PRIVATE KEY/);
  const proof=await createProof(file,{issuer:'Sekolah',privateKey:keys.privateKey,passphrase:'demo strong password'});
  assert.equal((await verifyProof(file,proof,{trustedPublicKeys:[keys.publicKey]})).valid,true);
});
test('wrong passphrase fails',async t=>{
  const {file}=await setup(t);const keys=generateKeyPair({passphrase:'right'});
  await assert.rejects(createProof(file,{issuer:'Sekolah',privateKey:keys.privateKey,passphrase:'wrong'}));
});
test('anchor digest deterministic but differs between signed proofs',async t=>{
  const {file}=await setup(t);const keys=generateKeyPair();const a=await createProof(file,{issuer:'Sekolah',privateKey:keys.privateKey});
  const b=await createProof(file,{issuer:'Sekolah',privateKey:keys.privateKey});
  assert.match(getAnchorDigest(a),/^0x[0-9a-f]{64}$/);assert.equal(getAnchorDigest(a),getAnchorDigest(a));assert.notEqual(getAnchorDigest(a),getAnchorDigest(b));
});
test('verification URL contains digest but not document content',async t=>{
  const {file}=await setup(t);const keys=generateKeyPair();const proof=await createProof(file,{issuer:'Sekolah',privateKey:keys.privateKey});
  const url=new URL(createVerificationURL('https://example.test/verify',proof));
  assert.equal(url.searchParams.get('proofId'),inspectProof(proof).proofId);assert.equal(url.searchParams.get('digest'),getAnchorDigest(proof));
});
test('QR generation accepts compatible engine',async()=>{
  const value=await generateQRCodeDataURL('https://example.org/verify',{engine:{toDataURL:async t=>`data:image/png;base64,${Buffer.from(t).toString('base64')}`}});
  assert.match(value,/^data:image\/png;base64,/);
});
test('rejects invalid document proof encoding',async t=>{
  const {file}=await setup(t);const proof={format:'indo-proof/v1',payloadBase64Url:'-',signature:{algorithm:'Ed25519',valueBase64Url:'-',publicKeyPem:'x'}};
  const r=await verifyProof(file,proof);assert.equal(r.valid,false);
});
test('metadata validation prevents oversized or non-object metadata',async t=>{
  const {file}=await setup(t);const keys=generateKeyPair();
  await assert.rejects(createProof(file,{issuer:'Sekolah',privateKey:keys.privateKey,metadata:['bad']}));
  await assert.rejects(createProof(file,{issuer:'Sekolah',privateKey:keys.privateKey,metadata:{x:'x'.repeat(10000)}}));
});
test('CLI hash can process document',async t=>{
  const {file}=await setup(t);const raw=execFileSync(process.execPath,[path.resolve(__dirname,'../bin/indoproof.cjs'),'hash',file],{encoding:'utf8'});
  assert.match(JSON.parse(raw).sha256,/^[a-f0-9]{64}$/);
});
test('ESM named import works',()=>{
  const esm=path.resolve(__dirname,'../index.mjs');
  const output=execFileSync(process.execPath,['--input-type=module','-e',`import { sha256Buffer } from ${JSON.stringify('file://'+esm)}; console.log(sha256Buffer(new Uint8Array([97,98,99])))`],{encoding:'utf8'});
  assert.match(output,/ba7816bf/);
});
test('CLI end-to-end keygen, issue, verify, and reject tampered file',async t=>{
  const {dir,file}=await setup(t);
  const command=path.resolve(__dirname,'../bin/indoproof.cjs');
  const keydir=path.join(dir,'keys');
  const json=JSON.parse(execFileSync(process.execPath,[command,'keygen',keydir],{encoding:'utf8'}));
  assert.match(json.keyId,/^sha256:/);
  const proofPath=path.join(dir,'receipt.proof.json');
  execFileSync(process.execPath,[command,'issue',file,'--key',path.join(keydir,'issuer.private.pem'),'--issuer','Sekolah','--out',proofPath]);
  const output=JSON.parse(execFileSync(process.execPath,[command,'verify',file,proofPath,'--key',path.join(keydir,'issuer.public.pem')],{encoding:'utf8'}));
  assert.equal(output.valid,true);
  await fs.appendFile(file,'broken');
  assert.throws(()=>execFileSync(process.execPath,[command,'verify',file,proofPath,'--key',path.join(keydir,'issuer.public.pem')],{stdio:'pipe'}));
});
