# IndoProof

**Document integrity + trusted digital signatures, with optional EVM anchoring.**

IndoProof is a Node.js library and CLI for creating cryptographic proof of a document's bytes and verifying the issuer's Ed25519 signature against **a trusted public key provided by the verifier**. Designed for Indonesian document-processing applications (training certificates, internal records, academic files), but language-neutral.

> **Security boundary:** A valid SHA-256 hash only shows the current document matches an earlier hash. A valid signature proves control of a signing key, **not** that the named organization is legitimate. A blockchain anchor only demonstrates that a digest was registered on a particular network—it cannot prove the document's claims are factually correct. For production trust, distribute/validate the issuer's public key independently.

### Capabilities

| Feature | Available | Notes |
| --- | --- | --- |
| SHA-256 file hashing | ✅ | Streaming; never uploads document |
| Generate Ed25519 signing keys | ✅ | Optional PEM encryption with passphrase |
| Signed document proofs | ✅ | Private key never placed inside proof |
| Verify changed file / altered proof | ✅ | Requires independent trusted issuer key for valid=true |
| CommonJS, ESM, TypeScript declarations | ✅ | Node.js >=18 |
| CLI for keys, proof issuing and verification | ✅ | No external runtime dependencies |
| QR link generation | Optional | Requires `npm install qrcode` and a **separate verification web app** |
| EVM registry + client integration | Experimental | Includes Solidity contract and viem-compatible client adapter; not deployed or audited |
| W3C VC Data Model 2.0 compliant | ❌ | Planned exploration; **current `indo-proof/v1` is proprietary** |

## Installation

Node.js 18 or newer:

```bash
npm install indo-proof
```

The command above works **after this package is published** to the npm registry and the name is confirmed available. To test locally after extracting the source ZIP:

```bash
npm install
npm test
npm run example
```

A local packed archive can also be installed via `npm install ./indo-proof-0.1.0.tgz`.

## 1. API — create and verify a document proof

```js
const fs = require('node:fs/promises');
const {
  generateKeyPair, createProof, verifyProof, inspectProof
} = require('indo-proof');

async function main() {
  // Normally generated once, stored securely by the document issuer.
  const { privateKey, publicKey } = generateKeyPair();

  const proof = await createProof('./sertifikat.pdf', {
    issuer: 'Lembaga Pelatihan Contoh',
    privateKey,
    metadata: { documentType: 'certificate' }
  });

  await fs.writeFile('sertifikat.proof.json', JSON.stringify(proof, null, 2));
  console.log('ID bukti:', inspectProof(proof).proofId);

  // Obtain the real issuer's public key from a separate, trusted channel.
  const report = await verifyProof('./sertifikat.pdf', proof, {
    trustedPublicKeys: [publicKey]
  });
  console.log(report); // valid: true (if unchanged and key trusted)
}
main().catch(console.error);
```

The public key in a proof is **self-declared**. Do **not** blindly trust `proof.signature.publicKeyPem`. Verification without `trustedPublicKeys` deliberately returns `valid: false` with `UNTRUSTED_ISSUER` even if SHA-256 and Ed25519 checks pass.

ESM:

```js
import { hashFile, createProof, verifyProof } from 'indo-proof';
```

### Example report

```json
{
  "valid": true,
  "signatureValid": true,
  "documentMatches": true,
  "trustedIssuer": true,
  "keyId": "sha256:...",
  "proofId": "...",
  "issuer": "Lembaga Pelatihan Contoh",
  "issuedAtClaim": "2026-10-18T00:00:00.000Z",
  "problems": []
}
```

`issuedAtClaim` is a self-declared timestamp signed by the issuer; it is not a trusted timestamp from a timestamp authority or blockchain consensus.

## 2. CLI — complete local workflow

Run from the source folder:

```bash
node bin/indoproof.cjs keygen ./keys
node bin/indoproof.cjs hash ./sertifikat.pdf
node bin/indoproof.cjs issue ./sertifikat.pdf --key ./keys/issuer.private.pem --issuer "Lembaga Pelatihan Contoh" --out ./sertifikat.proof.json
node bin/indoproof.cjs verify ./sertifikat.pdf ./sertifikat.proof.json --key ./keys/issuer.public.pem
node bin/indoproof.cjs anchor-digest ./sertifikat.proof.json
```

The CLI prints a JSON verification result and exits **nonzero** when `valid: false`. `keygen` writes the private PEM using mode `0600` on supported operating systems; permissions on Windows differ. Files will not silently be overwritten. **Never commit `keys/` or a private PEM to GitHub.** Production applications should prefer a secure keystore/KMS/HSM instead of storing an unencrypted private key.

To encrypt a new private key file:

```bash
export INDO_PROOF_KEY_PASSPHRASE="choose-a-strong-secret"
node bin/indoproof.cjs keygen ./keys
export INDO_PROOF_PASSPHRASE="$INDO_PROOF_KEY_PASSPHRASE"
node bin/indoproof.cjs issue ./sertifikat.pdf --key ./keys/issuer.private.pem --issuer "Lembaga Pelatihan Contoh"
```

Do not commit passwords to scripts or source. Environment variables can also be exposed to administrators and certain child processes; use a secret manager where available.

## 3. QR verification link

A QR encodes a **URL to your verification service**; it does not independently verify any document. You must implement a backend/web interface that maps `proofId` to the stored proof, accepts the actual document or securely retrieves it, and verifies using trusted issuer keys. Your web service should use HTTPS.

```bash
npm install qrcode
```

```js
const { createVerificationURL, generateQRCodeDataURL } = require('indo-proof');
const url = createVerificationURL('https://verify.example.org/verify', proof);
const pngDataUrl = await generateQRCodeDataURL(url);
// Use <img src={pngDataUrl}> in a UI, or decode the data URL and save it as PNG.
```

`verify.example.org` is an example URL, not a service provided by IndoProof. Hash / proof ID in the URL can correlate documents across views. Do not place confidential document text in query parameters.

## 4. Optional EVM blockchain anchoring (experimental)

A standalone Solidity contract is provided at `contracts/IndoProofRegistry.sol`. It records only a **32-byte digest** for each proof, the anchoring wallet, and the block number. No PDF or document metadata is uploaded to the chain. A real EVM deployment requires compiling/deploying the contract yourself and paying gas. The supplied registry allows *any address* to submit a proof digest; it does not implement institution accreditation, authorization, revocation, or ownership checks.

Install and configure [viem](https://viem.sh/) **in the consuming application**:

```bash
npm install viem
```

```js
const { anchorProof, readAnchor } = require('indo-proof/blockchain');
const { createPublicClient, createWalletClient, http } = require('viem');
const { sepolia } = require('viem/chains');
// Prepare publicClient, walletClient/account and deployed contractAddress.
const settings = { publicClient, walletClient, contractAddress };
const sent = await anchorProof(proof, settings);  // requires wallet authorization and gas
const status = await readAnchor(proof, settings);
console.log(sent.transactionHash, status.anchored);
```

The API works with viem-compatible clients and waits for a successful transaction receipt plus a new on-chain lookup. **A chain anchor cannot replace offline signature verification or key-trust validation.** The Solidity contract has not been independently audited; it is provided for testing, not for safeguarding assets.

### On-chain proof digest

`getAnchorDigest(proof)` returns the SHA-256 of a domain-separated binary concatenation of the signed payload bytes, signature bytes and canonical SPKI public-key bytes. The stored value is one 32-byte hash. The hash uses **SHA-256**, not Keccak-256, and does not encode document contents.

## API summary

- `sha256Buffer(bytes)` → hex SHA-256 string
- `hashFile(path)` → `{ sha256, sizeBytes }`
- `generateKeyPair({ passphrase? })` → `{ publicKey, privateKey, keyId }`
- `keyFingerprint(publicKeyPem)` → `sha256:...`
- `createProof(path, {issuer,privateKey,passphrase?,metadata?,issuedAt?,includeFilename?})` → signed proof
- `inspectProof(proof)` → parsed signed payload (not itself a signature-verification result)
- `verifyProof(path,proof,{trustedPublicKeys})` → detailed verification report
- `getAnchorDigest(proof)` → `0x...` proof digest
- `createVerificationURL(url,proof)` → web-app URL with `proofId` and `digest`
- `generateQRCodeDataURL(text,{engine?,qrOptions?})` → QR PNG data URL (optional `qrcode` dependency)
- `readAnchor(proof,{publicClient,contractAddress})` → on-chain record query
- `anchorProof(proof,{publicClient,walletClient,contractAddress,account?})` → submit and confirm an anchor

## Known limitations

1. Proofs are custom **IndoProof v1**, **not** W3C Verifiable Credentials, W3C Data Integrity, eIDAS, or an accredited digital-signature service.
2. Independently verifying an organization's identity requires a real trusted key directory, issuer onboarding and key rotation/revocation process, none of which are shipped here.
3. Proof timestamps are self-declared; optional chain block numbers show the record exists, not when the document was originally signed.
4. Revocation, multi-signature workflows, document canonicalization, and trusted time-stamping are not included.
5. Tests cover cryptographic operations and *mocked* EVM-client interactions; no blockchain testnet deployment, contract audit or production security review has been performed.
6. For sensitive/private documents, consider the implications of a public hash: anyone with a guessed copy may verify a match; do not publish metadata or hashes casually.

## Source references

- [W3C: Verifiable Credentials Data Model v2.0](https://www.w3.org/TR/vc-data-model-2.0/)
- [W3C: Data Integrity EdDSA Cryptosuites v1.0](https://www.w3.org/TR/vc-di-eddsa/)
- [Node.js crypto documentation](https://nodejs.org/api/crypto.html)
- [Ethereum transaction documentation](https://ethereum.org/en/developers/docs/transactions/)

## Tests

```bash
npm test
npm run example
npm pack --dry-run
```

MIT License. Contributions and security reports are welcome through repository issues. Please do not publish real private keys, certificates, IDs, or secret documents in issues.
