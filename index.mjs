import api from './src/core.cjs';
export const {
  sha256Buffer, hashFile, generateKeyPair, keyFingerprint, createProof,
  inspectProof, verifyProof, getAnchorDigest, createVerificationURL, generateQRCodeDataURL
} = api;
export default api;
