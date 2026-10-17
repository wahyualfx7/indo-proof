'use strict';
const { getAnchorDigest } = require('./core.cjs');

// EVM clients are supplied by the application (typically viem).
const REGISTRY_ABI = Object.freeze([
  { type:'function', name:'anchor', stateMutability:'nonpayable', inputs:[{name:'proofDigest',type:'bytes32'}], outputs:[] },
  { type:'function', name:'getAnchorBlock', stateMutability:'view', inputs:[{name:'proofDigest',type:'bytes32'}], outputs:[{name:'',type:'uint256'}] },
  { type:'event', name:'ProofAnchored', anonymous:false,
    inputs:[{name:'proofDigest',type:'bytes32',indexed:true},{name:'anchoringAccount',type:'address',indexed:true}] }
]);

function validateConfig(options) {
  if (!options || !options.publicClient || typeof options.publicClient.readContract !== 'function') {
    throw new TypeError('publicClient must be a viem-compatible public client');
  }
  if (typeof options.contractAddress !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(options.contractAddress)) {
    throw new TypeError('contractAddress must be a valid 20-byte hex address');
  }
}
async function readAnchor(proof, options) {
  validateConfig(options);
  const proofDigest = getAnchorDigest(proof);
  const block = await options.publicClient.readContract({
    address: options.contractAddress, abi: REGISTRY_ABI,
    functionName: 'getAnchorBlock', args:[proofDigest]
  });
  const blockNumber = BigInt(block);
  return { anchored: blockNumber > 0n, blockNumber: blockNumber > 0n ? blockNumber : null, proofDigest };
}
async function anchorProof(proof, options) {
  validateConfig(options);
  if (!options.walletClient || typeof options.walletClient.writeContract !== 'function') {
    throw new TypeError('walletClient must be a viem-compatible wallet client');
  }
  const proofDigest = getAnchorDigest(proof);
  const already = await readAnchor(proof, options);
  if (already.anchored) return { ...already, alreadyAnchored:true, transactionHash:null };
  const account = options.account || options.walletClient.account;
  if (!account) throw new TypeError('An explicit account or walletClient.account is required');
  if (typeof options.publicClient.simulateContract !== 'function' ||
      typeof options.publicClient.waitForTransactionReceipt !== 'function') {
    throw new TypeError('publicClient must provide simulateContract and waitForTransactionReceipt');
  }
  const { request } = await options.publicClient.simulateContract({
    address: options.contractAddress, abi:REGISTRY_ABI,
    functionName:'anchor',args:[proofDigest],account
  });
  const transactionHash = await options.walletClient.writeContract(request);
  const receipt = await options.publicClient.waitForTransactionReceipt({hash: transactionHash});
  if (receipt.status !== 'success') throw new Error(`Anchoring transaction failed: ${transactionHash}`);
  const confirmed = await readAnchor(proof, options);
  if (!confirmed.anchored) throw new Error('Transaction confirmed, but registry digest not found');
  return { ...confirmed, alreadyAnchored:false, transactionHash };
}
module.exports = { REGISTRY_ABI, getAnchorDigest, readAnchor, anchorProof };
