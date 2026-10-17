'use strict';
// Illustrative integration only. Requires: npm install viem
// Deploy contracts/IndoProofRegistry.sol first on a chosen EVM network.
// Set RPC_URL, PRIVATE_KEY and REGISTRY_ADDRESS before executing.
const { createPublicClient, createWalletClient, http } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { sepolia } = require('viem/chains');
const { anchorProof, readAnchor } = require('../blockchain.cjs');
const { createProof } = require('../index.cjs');
const fs = require('node:fs');

async function main() {
  if (!process.env.RPC_URL || !process.env.PRIVATE_KEY || !process.env.REGISTRY_ADDRESS || !process.env.ISSUER_KEY_FILE || !process.env.DOCUMENT_FILE) {
    throw new Error('Provide RPC_URL, PRIVATE_KEY, REGISTRY_ADDRESS, ISSUER_KEY_FILE, DOCUMENT_FILE');
  }
  const account = privateKeyToAccount(process.env.PRIVATE_KEY);
  const publicClient = createPublicClient({ chain: sepolia, transport: http(process.env.RPC_URL) });
  const walletClient = createWalletClient({ chain: sepolia, transport: http(process.env.RPC_URL), account });
  const proof = await createProof(process.env.DOCUMENT_FILE, {
    issuer: 'Demo', privateKey: fs.readFileSync(process.env.ISSUER_KEY_FILE, 'utf8')
  });
  const args = { publicClient, walletClient, contractAddress: process.env.REGISTRY_ADDRESS };
  console.log('Anchoring may spend testnet gas:', await anchorProof(proof, args));
  console.log('Chain lookup:', await readAnchor(proof, args));
}
main().catch(err => { console.error(err); process.exitCode = 1; });
