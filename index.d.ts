export type Proof = {
  format: 'indo-proof/v1';
  payloadBase64Url: string;
  signature: { algorithm: 'Ed25519'; valueBase64Url: string; publicKeyPem: string };
};
export type ProofPayload = {
  type: 'IndoProofDocument'; version: 1; proofId: string;
  issuer: { name: string; keyId: string };
  document: { sha256: string; sizeBytes: number; filename?: string };
  issuedAt: string; metadata?: Record<string, unknown>;
};
export type VerifyResult = {
  valid: boolean; signatureValid: boolean; documentMatches: boolean;
  trustedIssuer: boolean; problems: string[];
  keyId?: string; proofId?: string; issuer?: string; issuedAtClaim?: string;
};
export function sha256Buffer(input: Uint8Array): string;
export function hashFile(filePath: string): Promise<{ sha256: string; sizeBytes: number }>;
export function generateKeyPair(options?: { passphrase?: string }): { publicKey: string; privateKey: string; keyId: string };
export function keyFingerprint(publicKey: string): string;
export function createProof(filePath: string, options: {
  issuer: string; privateKey: string; passphrase?: string;
  issuedAt?: Date | string; metadata?: Record<string, unknown>; includeFilename?: boolean;
}): Promise<Proof>;
export function inspectProof(proof: Proof): ProofPayload;
export function verifyProof(filePath: string, proof: Proof,
  options?: { trustedPublicKeys?: string[] }): Promise<VerifyResult>;
export function getAnchorDigest(proof: Proof): `0x${string}`;
export function createVerificationURL(baseUrl: string, proof: Proof): string;
export function generateQRCodeDataURL(text: string, options?: {
  engine?: { toDataURL(text: string, options?: object): Promise<string> };
  qrOptions?: Record<string, unknown>;
}): Promise<string>;
