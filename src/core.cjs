'use strict';

const fs = require('node:fs');
const { basename } = require('node:path');
const crypto = require('node:crypto');

const FORMAT = 'indo-proof/v1';
const ALGORITHM = 'Ed25519';
const CONTEXT = Buffer.from('IndoProof:signature:v1\n', 'utf8');
const ANCHOR_CONTEXT = Buffer.from('IndoProof:anchor:v1\n', 'utf8');
const MAX_PAYLOAD_BYTES = 65_536;
const MAX_METADATA_BYTES = 8_192;

function assertString(value, name) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function assertFile(filePath) { return assertString(filePath, 'filePath'); }

function decodeBase64Url(value, maxBytes, label) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(value)) throw new TypeError(`Invalid ${label}`);
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.length === 0 || decoded.length > maxBytes || decoded.toString('base64url') !== value) {
    throw new TypeError(`Invalid ${label} encoding or length`);
  }
  return decoded;
}

function sha256(input) { return crypto.createHash('sha256').update(input).digest('hex'); }
function sha256Buffer(input) {
  if (!Buffer.isBuffer(input) && !(input instanceof Uint8Array)) throw new TypeError('input must be a Buffer or Uint8Array');
  return sha256(input);
}
async function hashFile(filePath) {
  assertFile(filePath);
  const hash = crypto.createHash('sha256');
  let bytes = 0;
  for await (const chunk of fs.createReadStream(filePath)) {
    hash.update(chunk);
    bytes += chunk.length;
    if (!Number.isSafeInteger(bytes)) throw new RangeError('File size exceeds supported precision');
  }
  return { sha256: hash.digest('hex'), sizeBytes: bytes };
}

function generateKeyPair({ passphrase } = {}) {
  const privateKeyEncoding = { type: 'pkcs8', format: 'pem' };
  if (passphrase !== undefined) {
    assertString(passphrase, 'passphrase');
    privateKeyEncoding.cipher = 'aes-256-cbc';
    privateKeyEncoding.passphrase = passphrase;
  }
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding
  });
  return { publicKey, privateKey, keyId: keyFingerprint(publicKey) };
}

function toEd25519PublicKey(publicKey) {
  const parsed = publicKey instanceof crypto.KeyObject && publicKey.type === 'public' ? publicKey : crypto.createPublicKey(publicKey);
  if (parsed.asymmetricKeyType !== 'ed25519') throw new TypeError('An Ed25519 public key is required');
  return parsed;
}
function keyFingerprint(publicKey) {
  const parsed = toEd25519PublicKey(publicKey);
  return `sha256:${sha256(parsed.export({ format: 'der', type: 'spki' }))}`;
}
function privateKeyFromOptions(options) {
  const pem = assertString(options.privateKey, 'privateKey');
  const key = crypto.createPrivateKey(options.passphrase === undefined ? pem : { key: pem, passphrase: options.passphrase });
  if (key.asymmetricKeyType !== 'ed25519') throw new TypeError('An Ed25519 private key is required');
  return key;
}
function validateMetadata(metadata) {
  if (metadata === undefined) return undefined;
  if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) throw new TypeError('metadata must be a plain JSON object');
  let encoded;
  try { encoded = JSON.stringify(metadata); } catch { throw new TypeError('metadata must be JSON serializable'); }
  if (!encoded || Buffer.byteLength(encoded) > MAX_METADATA_BYTES) throw new RangeError('metadata exceeds 8 KiB or is not serializable');
  const parsed = JSON.parse(encoded);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new TypeError('metadata must be an object');
  return parsed;
}
async function createProof(filePath, options = {}) {
  assertFile(filePath);
  const issuer = assertString(options.issuer, 'issuer');
  const privateKey = privateKeyFromOptions(options);
  const publicKey = crypto.createPublicKey(privateKey).export({ format: 'pem', type: 'spki' });
  const document = await hashFile(filePath);
  const now = options.issuedAt === undefined ? new Date() : new Date(options.issuedAt);
  if (!Number.isFinite(now.getTime())) throw new TypeError('issuedAt is not a valid date');
  const metadata = validateMetadata(options.metadata);
  const payload = {
    type: 'IndoProofDocument',
    version: 1,
    proofId: crypto.randomUUID(),
    issuer: { name: issuer, keyId: keyFingerprint(publicKey) },
    document,
    issuedAt: now.toISOString()
  };
  if (options.includeFilename === true) payload.document.filename = basename(filePath);
  if (metadata !== undefined) payload.metadata = metadata;
  const rawPayload = Buffer.from(JSON.stringify(payload));
  if (rawPayload.length > MAX_PAYLOAD_BYTES) throw new RangeError('Proof payload is too large');
  const signature = crypto.sign(null, Buffer.concat([CONTEXT, rawPayload]), privateKey);
  return {
    format: FORMAT,
    payloadBase64Url: rawPayload.toString('base64url'),
    signature: { algorithm: ALGORITHM, valueBase64Url: signature.toString('base64url'), publicKeyPem: publicKey }
  };
}
function decodeProof(proof) {
  if (!proof || typeof proof !== 'object' || Array.isArray(proof)) throw new TypeError('proof must be an object');
  if (proof.format !== FORMAT) throw new TypeError(`Unsupported proof format: ${proof.format}`);
  const raw = decodeBase64Url(proof.payloadBase64Url, MAX_PAYLOAD_BYTES, 'payload');
  const sig = proof.signature;
  if (!sig || sig.algorithm !== ALGORITHM) throw new TypeError('Unsupported signature algorithm');
  const signature = decodeBase64Url(sig.valueBase64Url, 64, 'signature');
  if (signature.length !== 64) throw new TypeError('Ed25519 signature must be 64 bytes');
  if (typeof sig.publicKeyPem !== 'string' || sig.publicKeyPem.length > 10_000) throw new TypeError('Invalid publicKeyPem');
  const publicKey = toEd25519PublicKey(sig.publicKeyPem);
  let payload;
  try { payload = JSON.parse(raw.toString('utf8')); } catch { throw new TypeError('Invalid payload JSON'); }
  if (!payload || payload.type !== 'IndoProofDocument' || payload.version !== 1 ||
      typeof payload.proofId !== 'string' ||
      !payload.issuer || typeof payload.issuer.name !== 'string' ||
      payload.issuer.keyId !== keyFingerprint(publicKey) ||
      !payload.document || !/^[a-f0-9]{64}$/.test(payload.document.sha256 || '') ||
      !Number.isSafeInteger(payload.document.sizeBytes) || payload.document.sizeBytes < 0 ||
      typeof payload.issuedAt !== 'string' || !Number.isFinite(Date.parse(payload.issuedAt))) {
    throw new TypeError('Invalid proof payload fields');
  }
  return { payload, raw, signature, publicKey };
}
function inspectProof(proof) { return decodeProof(proof).payload; }

async function verifyProof(filePath, proof, options = {}) {
  assertFile(filePath);
  const problems = [];
  let checked;
  try { checked = decodeProof(proof); } catch (err) {
    return { valid: false, signatureValid: false, documentMatches: false, trustedIssuer: false, problems: [`INVALID_PROOF: ${err.message}`] };
  }
  const { payload, raw, signature, publicKey } = checked;
  const signatureValid = crypto.verify(null, Buffer.concat([CONTEXT, raw]), publicKey, signature);
  if (!signatureValid) problems.push('INVALID_SIGNATURE');
  const document = await hashFile(filePath);
  const documentMatches = document.sha256 === payload.document.sha256 && document.sizeBytes === payload.document.sizeBytes;
  if (!documentMatches) problems.push('DOCUMENT_CHANGED');
  const accepted = options.trustedPublicKeys === undefined ? [] : options.trustedPublicKeys;
  if (!Array.isArray(accepted)) throw new TypeError('trustedPublicKeys must be an array');
  const fingerprint = keyFingerprint(publicKey);
  const trustedIssuer = accepted.some(item => keyFingerprint(item) === fingerprint);
  if (!trustedIssuer) problems.push('UNTRUSTED_ISSUER');
  return { valid: signatureValid && documentMatches && trustedIssuer,
    signatureValid, documentMatches, trustedIssuer, keyId: fingerprint,
    proofId: payload.proofId, issuer: payload.issuer.name,
    issuedAtClaim: payload.issuedAt, problems };
}

function getAnchorDigest(proof) {
  const { raw, signature, publicKey } = decodeProof(proof);
  const der = publicKey.export({ format: 'der', type: 'spki' });
  return `0x${sha256(Buffer.concat([ANCHOR_CONTEXT, raw, signature, der]))}`;
}

function createVerificationURL(baseUrl, proof) {
  const { payload } = decodeProof(proof);
  const url = new URL(assertString(baseUrl, 'baseUrl'));
  if (!['https:', 'http:'].includes(url.protocol)) throw new TypeError('baseUrl must use HTTP(S)');
  url.searchParams.set('proofId', payload.proofId);
  url.searchParams.set('digest', getAnchorDigest(proof));
  return url.toString();
}

async function generateQRCodeDataURL(text, opts = {}) {
  assertString(text, 'text');
  let engine = opts.engine;
  if (!engine) {
    try { engine = require('qrcode'); } catch (error) {
      if (error.code === 'MODULE_NOT_FOUND') throw new Error('QR generation requires the optional package: npm install qrcode');
      throw error;
    }
  }
  if (typeof engine.toDataURL !== 'function') throw new TypeError('QR engine must expose toDataURL(text, options)');
  return engine.toDataURL(text, { errorCorrectionLevel: 'M', margin: 2, ...opts.qrOptions });
}

module.exports = {
  sha256Buffer, hashFile, generateKeyPair, keyFingerprint, createProof,
  inspectProof, verifyProof, getAnchorDigest, createVerificationURL, generateQRCodeDataURL
};
