import type { Proof } from './index.js';
export const REGISTRY_ABI: ReadonlyArray<object>;
export function getAnchorDigest(proof: Proof): `0x${string}`;
type Client = {
  readContract(request: object): Promise<bigint | number | string>;
  simulateContract?(request: object): Promise<{ request: object }>;
  waitForTransactionReceipt?(request: object): Promise<{ status: string }>;
};
type Wallet = { account?: object | string; writeContract(request: object): Promise<`0x${string}`> };
export function readAnchor(proof: Proof, options: {
  publicClient: Client; contractAddress: `0x${string}`;
}): Promise<{ anchored: boolean; blockNumber: bigint | null; proofDigest: `0x${string}` }>;
export function anchorProof(proof: Proof, options: {
  publicClient: Client; walletClient: Wallet; account?: object | string; contractAddress: `0x${string}`;
}): Promise<{ anchored: boolean; blockNumber: bigint | null; proofDigest: `0x${string}`;
  transactionHash: string | null; alreadyAnchored: boolean }>;
