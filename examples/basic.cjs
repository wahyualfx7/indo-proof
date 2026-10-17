'use strict';
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { generateKeyPair, createProof, verifyProof, inspectProof, getAnchorDigest } = require('../index.cjs');

(async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'indoproof-demo-'));
  try {
    const file = path.join(temp, 'sertifikat.txt');
    await fs.writeFile(file, 'Sertifikat pelatihan nomor ABC-123\n', 'utf8');
    const { privateKey, publicKey } = generateKeyPair();
    const proof = await createProof(file, { issuer:'Lembaga Pelatihan Contoh', privateKey });
    const result = await verifyProof(file, proof, { trustedPublicKeys:[publicKey] });
    console.log('Proof ID:', inspectProof(proof).proofId);
    console.log('Anchor digest:', getAnchorDigest(proof));
    console.log('Verifikasi:', JSON.stringify(result, null, 2));
    await fs.appendFile(file, 'dokumen telah diubah\n');
    const tampered = await verifyProof(file, proof, { trustedPublicKeys:[publicKey] });
    console.log('Setelah file diubah:', JSON.stringify({valid:tampered.valid, problems:tampered.problems}));
  } finally { await fs.rm(temp, { force:true, recursive:true }); }
})().catch(err=>{console.error(err); process.exitCode=1});
