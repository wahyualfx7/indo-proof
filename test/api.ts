import { generateKeyPair, createProof, verifyProof, sha256Buffer, getAnchorDigest } from '../index.js';
import { readAnchor } from '../blockchain.js';
const { privateKey, publicKey } = generateKeyPair();
const digest: string = sha256Buffer(new Uint8Array([1, 2, 3]));
async function demo() {
  const proof = await createProof('./file.txt', { issuer:'Sample', privateKey });
  const report = await verifyProof('./file.txt', proof, { trustedPublicKeys: [publicKey] });
  const hash: `0x${string}` = getAnchorDigest(proof);
  return { digest, report, hash, readAnchor };
}
void demo;
