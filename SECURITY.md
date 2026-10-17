# Security policy

IndoProof v0.1.0 is an early-stage demonstration library; it has not undergone an independent security audit. Do not use it as the sole foundation for accredited electronic signatures, legal ownership attestations, or high-value asset transactions.

Never disclose private signing keys, real ID scans, confidential documents, account seeds, RPC credentials, or personal data in public GitHub issues.

To report a suspected vulnerability, contact the repository maintainer privately through a channel they publish in GitHub Security settings. Until a private reporting mechanism exists, do not include exploit details or secrets in public issues.

For production: maintain a secure, externally verified issuer key registry, use key rotation/revocation policies, store private keys in appropriate secure hardware or managed services, and subject the Solidity registry and application to independent review.
