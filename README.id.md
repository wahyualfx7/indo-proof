# IndoProof v0.1.0 — Panduan Singkat Bahasa Indonesia

IndoProof adalah *library* Node.js untuk mengecek apakah dokumen berubah dan memverifikasi tanda tangan Ed25519 dari penerbit yang kunci publiknya dipercaya.

**Perhatian:** IndoProof bukan layanan tanda tangan elektronik tersertifikasi, tidak otomatis membuktikan bahwa organisasi penerbit benar-benar sah, dan versi awal belum mendukung standar W3C Verifiable Credentials secara penuh. Modul blockchain bersifat eksperimental, belum diuji pada jaringan sungguhan dan memerlukan kontrak yang kamu *deploy* sendiri.

## 1. Instalasi dan pengujian

1. Ekstrak `indo-proof-v0.1.0.zip`.
2. Buka Git Bash di dalam folder `indo-proof` yang berisi `package.json`.
3. Jalankan:

```bash
npm install
npm test
npm run example
```

Jika ingin mencoba fungsi tanpa menginstal dependensi pengembangan, `npm test` dan `npm run example` bisa dijalankan langsung selama Node.js >=18 sudah tersedia.

## 2. Buat tanda tangan dokumen melalui Git Bash

Contoh: kamu punya file `sertifikat.pdf` yang berada di folder proyek.

```bash
node bin/indoproof.cjs keygen ./keys
node bin/indoproof.cjs issue ./sertifikat.pdf --key ./keys/issuer.private.pem --issuer "Lembaga Contoh" --out ./sertifikat.proof.json
node bin/indoproof.cjs verify ./sertifikat.pdf ./sertifikat.proof.json --key ./keys/issuer.public.pem
```

Jika berhasil, hasil verifikasi akan menunjukkan `"valid": true`.

Sekarang edit isi file `sertifikat.pdf` atau ganti dengan berkas lain, lalu jalankan perintah `verify` yang sama. Hasilnya `"valid": false` dan `DOCUMENT_CHANGED`.

**Jangan pernah unggah `keys/issuer.private.pem` ke GitHub.** Kunci publik boleh dibagikan melalui kanal tepercaya sehingga pemeriksa bisa memastikan tanda tangan benar-benar milik penerbit.

## 3. Penggunaan melalui JavaScript

```js
const { generateKeyPair, createProof, verifyProof } = require('./index.cjs');

(async () => {
  const { privateKey, publicKey } = generateKeyPair();
  const proof = await createProof('./sertifikat.pdf', {
    issuer: 'Lembaga Contoh',
    privateKey
  });

  const report = await verifyProof('./sertifikat.pdf', proof, {
    trustedPublicKeys: [publicKey]
  });
  console.log(report);
})();
```

Gunakan kunci privat dari penyimpanan aman dan lakukan penerbitan kunci hanya sekali untuk penerbit sungguhan. Contoh di atas membuat kunci baru setiap kali dijalankan hanya untuk demonstrasi.

## 4. QR code dan blockchain

Untuk membuat gambar QR, pasang dependensi tambahan:

```bash
npm install qrcode
```

Gunakan `createVerificationURL(baseUrl, proof)` dan `generateQRCodeDataURL(url)`. Kamu harus memiliki website/backend verifikasi sendiri; gambar QR saja belum bisa menentukan keaslian dokumen.

Untuk *blockchain*, kamu dapat mempelajari `contracts/IndoProofRegistry.sol` dan `examples/blockchain.cjs`. Eksekusi membutuhkan *wallet*, RPC, kontrak yang sudah di-*deploy*, dan gas. Pengujian otomatis saat ini menggunakan simulasi antarmuka klien EVM (*mock*), bukan transaksi asli.

## 5. GitHub dan npm

Panduan perintah Git Bash ada di `PUBLISHING.md`. Jika membuat repositori baru, gunakan nama `indo-proof`.

Nama `indo-proof` di npm belum berhasil saya verifikasi ketersediaannya dari lingkungan pembuatan paket. Jalankan `npm view indo-proof version` sebelum `npm publish --access public`.

Dokumentasi lengkap dan batasan keamanan tersedia pada `README.md`.
