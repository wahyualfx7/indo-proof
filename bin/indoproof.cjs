#!/usr/bin/env node
'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const api = require('../index.cjs');

function usage() {
  console.log(`IndoProof v0.1.0
Usage:
  indoproof keygen <directory>                       Create signing keys (private: 0600)
  indoproof hash <file>                              SHA-256 hash of a document
  indoproof issue <file> --key <private.pem> --issuer <name> [--out <proof.json>]
  indoproof verify <file> <proof.json> --key <trusted-public.pem>
  indoproof anchor-digest <proof.json>               Digest suitable for EVM registry
  indoproof url <proof.json> --base-url <https://your-verify-server/verify>

Use INDO_PROOF_PASSPHRASE env var for encrypted keys when issuing.
Use INDO_PROOF_KEY_PASSPHRASE env var when generating an encrypted private key.
Private key files must NEVER be committed to Git or shared.`);
}
function opt(args, name) {
  const i = args.indexOf(name);
  return i < 0 ? undefined : args[i + 1];
}
async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  if (!cmd || ['help', '--help', '-h'].includes(cmd)) { usage(); return; }
  if (cmd === 'keygen') {
    const folder = args[0];
    if (!folder) throw new Error('Missing output directory');
    await fs.mkdir(folder, { recursive: true });
    const { publicKey, privateKey, keyId } = api.generateKeyPair({ passphrase: process.env.INDO_PROOF_KEY_PASSPHRASE });
    const privatePath = path.join(folder, 'issuer.private.pem');
    const publicPath = path.join(folder, 'issuer.public.pem');
    // wx ensures existing keys are not silently overwritten
    await fs.writeFile(privatePath, privateKey, { flag: 'wx', mode: 0o600 });
    try {
      await fs.writeFile(publicPath, publicKey, { flag: 'wx', mode: 0o644 });
    } catch (error) {
      await fs.rm(privatePath, { force: true });
      throw error;
    }
    console.log(JSON.stringify({ publicPath, privatePath, keyId }, null, 2));
    return;
  }
  if (cmd === 'hash') {
    if (!args[0]) throw new Error('Missing document path');
    console.log(JSON.stringify(await api.hashFile(args[0]), null, 2));
    return;
  }
  if (cmd === 'issue') {
    const privateFile = opt(args, '--key');
    const issuer = opt(args, '--issuer');
    if (!args[0] || !privateFile || !issuer) throw new Error('Expected file --key <private.pem> --issuer <name>');
    const privateKey = await fs.readFile(privateFile, 'utf8');
    const proof = await api.createProof(args[0], { issuer, privateKey, passphrase: process.env.INDO_PROOF_PASSPHRASE });
    const outFile = opt(args, '--out') || `${args[0]}.proof.json`;
    await fs.writeFile(outFile, JSON.stringify(proof, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ outFile, proofId: api.inspectProof(proof).proofId, anchorDigest: api.getAnchorDigest(proof) }, null, 2));
    return;
  }
  if (cmd === 'verify') {
    const publicFile = opt(args, '--key');
    if (!args[0] || !args[1] || !publicFile) throw new Error('Expected <file> <proof.json> --key <trusted-public.pem>');
    const proof = JSON.parse(await fs.readFile(args[1], 'utf8'));
    const trustedPublicKey = await fs.readFile(publicFile, 'utf8');
    const result = await api.verifyProof(args[0], proof, { trustedPublicKeys: [trustedPublicKey] });
    console.log(JSON.stringify(result, null, 2));
    if (!result.valid) process.exitCode = 1;
    return;
  }
  if (cmd === 'anchor-digest') {
    if (!args[0]) throw new Error('Missing proof.json path');
    const proof = JSON.parse(await fs.readFile(args[0], 'utf8'));
    console.log(api.getAnchorDigest(proof));
    return;
  }
  if (cmd === 'url') {
    if (!args[0] || !opt(args, '--base-url')) throw new Error('Expected proof.json --base-url <URL>');
    const proof = JSON.parse(await fs.readFile(args[0], 'utf8'));
    console.log(api.createVerificationURL(opt(args, '--base-url'), proof));
    return;
  }
  throw new Error(`Unknown command: ${cmd}`);
}
main().catch(err => { console.error(`IndoProof error: ${err.message}`); process.exitCode = 1; });
