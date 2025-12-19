/**
 * secp256k1 Cryptography Module
 * Handles key generation, encryption, and 2-of-2 signing
 */

let secp = null;
let sha256 = null;

// Lazy load noble libraries
export async function initCrypto() {
  if (secp && sha256) return { secp, sha256 };
  
  const [secpModule, hashModule] = await Promise.all([
    import('https://unpkg.com/@noble/secp256k1@1.7.1/lib/esm/index.js'),
    import('https://unpkg.com/@noble/hashes@1.3.0/esm/sha256.js'),
  ]);
  
  const hmacModule = await import('https://unpkg.com/@noble/hashes@1.3.0/esm/hmac.js');
  
  // Configure HMAC for deterministic signatures (RFC6979)
  secpModule.utils.hmacSha256Sync = (k, ...m) => 
    hmacModule.hmac(hashModule.sha256, k, secpModule.utils.concatBytes(...m));
  
  secp = secpModule;
  sha256 = hashModule.sha256;
  
  return { secp, sha256 };
}

// Utility functions
export function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// XOR-based encryption (use AES-GCM in production)
export async function encryptPrivateKey(privateKey, encryptionKey) {
  const { sha256: hash } = await initCrypto();
  const keyBytes = hexToBytes(encryptionKey);
  const iv = crypto.getRandomValues(new Uint8Array(16));
  
  // Derive encryption key from hardware key + IV
  const combined = new Uint8Array(keyBytes.length + iv.length);
  combined.set(keyBytes);
  combined.set(iv, keyBytes.length);
  const derivedKey = hash(combined);
  
  // XOR encrypt
  const encrypted = new Uint8Array(privateKey.length);
  for (let i = 0; i < privateKey.length; i++) {
    encrypted[i] = privateKey[i] ^ derivedKey[i % derivedKey.length];
  }
  
  // Return IV || ciphertext
  const result = new Uint8Array(iv.length + encrypted.length);
  result.set(iv);
  result.set(encrypted, iv.length);
  return bytesToHex(result);
}

export async function decryptPrivateKey(encryptedHex, encryptionKey) {
  const { sha256: hash } = await initCrypto();
  const keyBytes = hexToBytes(encryptionKey);
  const encryptedBytes = hexToBytes(encryptedHex);
  
  // Extract IV and ciphertext
  const iv = encryptedBytes.slice(0, 16);
  const ciphertext = encryptedBytes.slice(16);
  
  // Derive decryption key
  const combined = new Uint8Array(keyBytes.length + iv.length);
  combined.set(keyBytes);
  combined.set(iv, keyBytes.length);
  const derivedKey = hash(combined);
  
  // XOR decrypt
  const decrypted = new Uint8Array(ciphertext.length);
  for (let i = 0; i < ciphertext.length; i++) {
    decrypted[i] = ciphertext[i] ^ derivedKey[i % derivedKey.length];
  }
  
  return decrypted;
}

// Generate secp256k1 keypair
export async function generateKeypair() {
  const { secp: s } = await initCrypto();
  const privateKey = crypto.getRandomValues(new Uint8Array(32));
  const publicKey = s.getPublicKey(privateKey, true); // compressed
  return {
    privateKey,
    publicKey: bytesToHex(publicKey),
  };
}

// Sign message with secp256k1
export async function signMessage(messageBytes, privateKey) {
  const { secp: s, sha256: hash } = await initCrypto();
  const messageHash = hash(messageBytes);
  const signature = await s.sign(messageHash, privateKey, { lowS: true });
  
  return {
    signature: bytesToHex(signature.toCompactRawBytes()),
    recovery: signature.recovery,
    messageHash: bytesToHex(messageHash),
  };
}

// Verify secp256k1 signature
export async function verifySignature(messageHash, signature, publicKey) {
  const { secp: s } = await initCrypto();
  try {
    return s.verify(
      hexToBytes(signature),
      hexToBytes(messageHash),
      hexToBytes(publicKey)
    );
  } catch {
    return false;
  }
}

// 2-of-2 Multi-Signature Flow
export async function sign2of2(message, encryptedSecpKey, sendNative, hwKeyId) {
  const { sha256: hash } = await initCrypto();
  
  // Prepare message
  const messageBytes = typeof message === 'string' 
    ? new TextEncoder().encode(message) 
    : message;
  const messageHash = hash(messageBytes);
  const messageHashHex = bytesToHex(messageHash);
  
  // Step 1: Hardware key authorization (triggers biometric)
  const hwSig = await sendNative('SIGN_WITH_HW', {
    keyId: hwKeyId,
    messageHash: messageHashHex,
  });
  
  // Step 2: Derive encryption key from hardware key
  const encKey = await sendNative('DERIVE_ENC_KEY', { keyId: hwKeyId });
  
  // Step 3: Decrypt secp256k1 private key
  const secpPrivKey = await decryptPrivateKey(encryptedSecpKey, encKey);
  
  // Step 4: Sign with secp256k1
  const secpSig = await signMessage(messageBytes, secpPrivKey);
  
  // Step 5: Zero private key from memory
  secpPrivKey.fill(0);
  
  return {
    hwSignature: hwSig.signature,
    hwAlgorithm: hwSig.algorithm,
    hwKeyId: hwSig.keyId,
    secpSignature: secpSig.signature,
    secpRecovery: secpSig.recovery,
    messageHash: messageHashHex,
    timestamp: Date.now(),
  };
}