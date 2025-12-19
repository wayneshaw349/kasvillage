/**
 * Native Bridge - Communication layer between WebView and React Native
 * Handles 2-of-2 signing requests and balance sync
 */

const pendingRequests = new Map();
let requestId = 0;

// L2 API endpoint
const L2_API = import.meta.env?.VITE_L2_API || 'https://api.kasvillage.io';

// Check if running in React Native WebView
export const isNative = () => !!window.ReactNativeWebView;

// Send message to native layer
export function sendNative(type, payload = {}) {
  return new Promise((resolve, reject) => {
    if (!isNative()) {
      // Mock response for web testing
      console.log('[Bridge Mock]', type, payload);
      setTimeout(() => resolve(mockNativeResponse(type, payload)), 100);
      return;
    }

    const id = `req_${++requestId}_${Date.now()}`;
    const timeout = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error('Native request timeout (30s)'));
    }, 30000);

    pendingRequests.set(id, { resolve, reject, timeout });
    window.ReactNativeWebView.postMessage(JSON.stringify({ type, payload, requestId: id }));
  });
}

// Handle response from native
window.handleNativeResponse = function(data) {
  const pending = pendingRequests.get(data.requestId);
  if (pending) {
    clearTimeout(pending.timeout);
    pendingRequests.delete(data.requestId);
    if (data.success) pending.resolve(data.result);
    else pending.reject(new Error(data.error || 'Native error'));
  }
};

// Mock responses for web testing
function mockNativeResponse(type, payload) {
  switch (type) {
    case 'CHECK_SECURITY':
      return { hasSecureEnclave: false, hasStrongBox: false, hasBiometric: true, platform: 'web', securityLevel: 'software' };
    case 'GENERATE_HW_KEY':
      return { keyId: `hw_${Date.now()}`, publicKey: '02' + 'a'.repeat(64), algorithm: 'P-256', createdAt: Date.now() };
    case 'DERIVE_ENC_KEY':
      return 'mock_encryption_key_' + payload.keyId;
    case 'SIGN_WITH_HW':
      return { signature: 'mock_hw_sig_' + 'b'.repeat(120), algorithm: 'P-256-SHA256', keyId: payload.keyId };
    case 'LIST_KEYS':
      return [];
    default:
      return null;
  }
}

// ============================================================================
// L2 BACKEND API CALLS
// ============================================================================

/**
 * Fetch account balance from L2
 */
export async function fetchBalance(pubkey) {
  try {
    const res = await fetch(`${L2_API}/api/balance/${pubkey}`);
    if (!res.ok) throw new Error('Balance fetch failed');
    return await res.json();
  } catch (e) {
    console.warn('Balance fetch error:', e);
    // Return mock for offline/testing
    return { balance: 0, pending: 0 };
  }
}

/**
 * Submit signed transaction to L2
 */
export async function submitTransaction(signedTx) {
  const res = await fetch(`${L2_API}/api/tx/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(signedTx),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Transaction submission failed');
  }
  return await res.json();
}

/**
 * Request withdrawal from L2 to L1
 */
export async function requestWithdrawal(pubkey, amount, destAddress, signature) {
  const res = await fetch(`${L2_API}/api/withdraw/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pubkey,
      amount,
      dest_address: destAddress,
      signature,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Withdrawal request failed');
  }
  return await res.json();
}

/**
 * Check withdrawal status
 */
export async function checkWithdrawalStatus(requestId) {
  try {
    const res = await fetch(`${L2_API}/api/withdraw/status/${requestId}`);
    if (!res.ok) throw new Error('Status check failed');
    return await res.json();
  } catch (e) {
    console.warn('Withdrawal status error:', e);
    return null;
  }
}

/**
 * Register public key with L2
 */
export async function registerPubkey(pubkey, hwPubkey) {
  const res = await fetch(`${L2_API}/api/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      secp_pubkey: pubkey,
      hw_pubkey: hwPubkey,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Registration failed');
  }
  return await res.json();
}

/**
 * Get L2 health/status
 */
export async function getL2Health() {
  try {
    const res = await fetch(`${L2_API}/api/health`);
    if (!res.ok) throw new Error('Health check failed');
    return await res.json();
  } catch (e) {
    console.warn('Health check error:', e);
    return { status: 'offline' };
  }
}