// ============================================================================
// KASVILLAGE EXPO APP - COMPLETE IMPLEMENTATION
// ============================================================================
// Single-file implementation for easy deployment
// Contains: App.jsx + Database + Sync Client + Native Bridge
// ============================================================================

import { Asset } from 'expo-asset';
import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform, SafeAreaView, AppState } from 'react-native';
import { WebView } from 'react-native-webview';
import { secp256k1 } from '@noble/curves/secp256k1';

// ============================================================================
// CONSTANTS
// ============================================================================
const ENCRYPTION_SALT = 'KasVillage_L2_v1';
const WALLET_DEEPLINK_PREFIX = 'kasvillage://';
const API_BASE = 'https://134ucrb1rpek78b8ev55521u78.ingress.akash-palmito.org';
const ARWEAVE_GATEWAY = 'https://arweave.net';

// Ephemeral key constants
const EPHEMERAL_PREFIX = 'kv_ephemeral_';
const EPHEMERAL_METADATA = 'kv_ephemeral_metadata';
const EPHEMERAL_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

// Key storage constants
const PRIVATE_KEY_STORAGE_KEY = 'kasvillage_private_key';
const PUBLIC_KEY_STORAGE_KEY = 'kasvillage_public_key';

// Database constants
const DB_NAME = 'kasvillage.db';

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ============================================================================
// DATABASE MODULE (SQLite)
// ============================================================================
let db = null;

const DatabaseManager = {
  async init() {
    if (db) return db;
    
    db = await SQLite.openDatabaseAsync(DB_NAME);
    
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      
      CREATE TABLE IF NOT EXISTS account_state (
        pubkey TEXT PRIMARY KEY,
        balance INTEGER NOT NULL DEFAULT 0,
        nonce INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );
      
      CREATE TABLE IF NOT EXISTS merkle_leaves (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        leaf_hash TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL
      );
      
      CREATE TABLE IF NOT EXISTS spent_nullifiers (
        nullifier TEXT PRIMARY KEY,
        spent_at INTEGER NOT NULL
      );
      
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tx_hash TEXT UNIQUE,
        sender TEXT NOT NULL,
        receiver TEXT NOT NULL,
        amount INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        tx_type TEXT NOT NULL
      );
      
      CREATE TABLE IF NOT EXISTS sync_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        last_global_root TEXT NOT NULL,
        last_sync_timestamp INTEGER NOT NULL,
        last_arweave_backup TEXT,
        last_l1_daa_score INTEGER DEFAULT 0
      );
      
      INSERT OR IGNORE INTO sync_state (id, last_global_root, last_sync_timestamp)
      VALUES (1, '${'0'.repeat(64)}', 0);
      
      CREATE INDEX IF NOT EXISTS idx_tx_sender ON transactions(sender);
      CREATE INDEX IF NOT EXISTS idx_tx_receiver ON transactions(receiver);
      CREATE INDEX IF NOT EXISTS idx_tx_timestamp ON transactions(timestamp);
    `);
    
    console.log('📦 Database initialized');
    return db;
  },

  async getDb() {
    if (!db) return this.init();
    return db;
  },

  // Account state
  async getAccountState(pubkey) {
    const database = await this.getDb();
    const result = await database.getFirstAsync(
      'SELECT * FROM account_state WHERE pubkey = ?',
      [pubkey]
    );
    
    if (!result) return null;
    
    return {
      pubkey: result.pubkey,
      balance: result.balance,
      nonce: result.nonce,
      updatedAt: result.updated_at,
    };
  },

  async setAccountState(state) {
    const database = await this.getDb();
    await database.runAsync(
      `INSERT OR REPLACE INTO account_state (pubkey, balance, nonce, updated_at)
       VALUES (?, ?, ?, ?)`,
      [state.pubkey, state.balance, state.nonce, state.updatedAt]
    );
  },

  // Merkle leaves
  async getMerkleLeaves() {
    const database = await this.getDb();
    const results = await database.getAllAsync(
      'SELECT leaf_hash FROM merkle_leaves ORDER BY id'
    );
    return results.map(r => r.leaf_hash);
  },

  async addMerkleLeaves(leaves) {
    const database = await this.getDb();
    const now = Math.floor(Date.now() / 1000);
    
    await database.withTransactionAsync(async () => {
      for (const leaf of leaves) {
        await database.runAsync(
          'INSERT OR IGNORE INTO merkle_leaves (leaf_hash, created_at) VALUES (?, ?)',
          [leaf, now]
        );
      }
    });
  },

  // Nullifiers
  async getSpentNullifiers() {
    const database = await this.getDb();
    const results = await database.getAllAsync(
      'SELECT nullifier FROM spent_nullifiers'
    );
    return results.map(r => r.nullifier);
  },

  async addSpentNullifiers(nullifiers) {
    const database = await this.getDb();
    const now = Math.floor(Date.now() / 1000);
    
    await database.withTransactionAsync(async () => {
      for (const nullifier of nullifiers) {
        await database.runAsync(
          'INSERT OR IGNORE INTO spent_nullifiers (nullifier, spent_at) VALUES (?, ?)',
          [nullifier, now]
        );
      }
    });
  },

  // Transactions
  async getTransactions(pubkey, limit = 50) {
    const database = await this.getDb();
    const results = await database.getAllAsync(
      `SELECT * FROM transactions 
       WHERE sender = ? OR receiver = ? 
       ORDER BY timestamp DESC 
       LIMIT ?`,
      [pubkey, pubkey, limit]
    );
    
    return results.map(r => ({
      id: r.id,
      txHash: r.tx_hash,
      sender: r.sender,
      receiver: r.receiver,
      amount: r.amount,
      timestamp: r.timestamp,
      txType: r.tx_type,
    }));
  },

  async addTransaction(tx) {
    const database = await this.getDb();
    await database.runAsync(
      `INSERT OR IGNORE INTO transactions (tx_hash, sender, receiver, amount, timestamp, tx_type)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [tx.txHash, tx.sender, tx.receiver, tx.amount, tx.timestamp, tx.txType]
    );
  },

  // Sync state
  async getSyncState() {
    const database = await this.getDb();
    const result = await database.getFirstAsync(
      'SELECT * FROM sync_state WHERE id = 1'
    );
    
    return {
      lastGlobalRoot: result?.last_global_root || '0'.repeat(64),
      lastSyncTimestamp: result?.last_sync_timestamp || 0,
      lastArweaveBackup: result?.last_arweave_backup || null,
      lastL1DaaScore: result?.last_l1_daa_score || 0,
    };
  },

  async updateSyncState(state) {
    const database = await this.getDb();
    const current = await this.getSyncState();
    
    await database.runAsync(
      `UPDATE sync_state SET 
         last_global_root = ?,
         last_sync_timestamp = ?,
         last_arweave_backup = ?,
         last_l1_daa_score = ?
       WHERE id = 1`,
      [
        state.lastGlobalRoot ?? current.lastGlobalRoot,
        state.lastSyncTimestamp ?? current.lastSyncTimestamp,
        state.lastArweaveBackup ?? current.lastArweaveBackup,
        state.lastL1DaaScore ?? current.lastL1DaaScore,
      ]
    );
  },

  // Bundle export/import
  async exportBundle(pubkey) {
    const account = await this.getAccountState(pubkey);
    const leaves = await this.getMerkleLeaves();
    const nullifiers = await this.getSpentNullifiers();
    const syncState = await this.getSyncState();
    
    return {
      pubkey_hex: pubkey,
      balance: account?.balance || 0,
      nonce: account?.nonce || 0,
      merkle_leaves: leaves,
      spent_nullifiers: nullifiers,
      last_global_root: syncState.lastGlobalRoot,
      timestamp: Math.floor(Date.now() / 1000),
      user_signature: null,
    };
  },

  async importDelta(pubkey, delta) {
    const database = await this.getDb();
    
    await database.withTransactionAsync(async () => {
      await this.setAccountState({
        pubkey,
        balance: delta.new_balance,
        nonce: delta.new_nonce,
        updatedAt: delta.timestamp,
      });
      
      if (delta.new_leaves?.length > 0) {
        await this.addMerkleLeaves(delta.new_leaves);
      }
      
      if (delta.new_nullifiers?.length > 0) {
        await this.addSpentNullifiers(delta.new_nullifiers);
      }
      
      await this.updateSyncState({
        lastGlobalRoot: delta.current_global_root,
        lastSyncTimestamp: delta.timestamp,
      });
    });
  },

  async reset() {
    const database = await this.getDb();
    
    await database.withTransactionAsync(async () => {
      await database.runAsync('DELETE FROM account_state');
      await database.runAsync('DELETE FROM merkle_leaves');
      await database.runAsync('DELETE FROM spent_nullifiers');
      await database.runAsync('DELETE FROM transactions');
      await database.runAsync(`UPDATE sync_state SET 
        last_global_root = '${'0'.repeat(64)}',
        last_sync_timestamp = 0,
        last_arweave_backup = NULL,
        last_l1_daa_score = 0
      WHERE id = 1`);
    });
  },

  async getStats() {
    const database = await this.getDb();
    
    const accounts = await database.getFirstAsync('SELECT COUNT(*) as count FROM account_state');
    const leaves = await database.getFirstAsync('SELECT COUNT(*) as count FROM merkle_leaves');
    const nullifiers = await database.getFirstAsync('SELECT COUNT(*) as count FROM spent_nullifiers');
    const transactions = await database.getFirstAsync('SELECT COUNT(*) as count FROM transactions');
    
    return {
      accountCount: accounts?.count || 0,
      leafCount: leaves?.count || 0,
      nullifierCount: nullifiers?.count || 0,
      transactionCount: transactions?.count || 0,
    };
  },
};

// ============================================================================
// KEYPAIR MANAGER
// ============================================================================
const KeypairManager = {
  async store(privateKeyHex, publicKeyHex) {
    await SecureStore.setItemAsync(PRIVATE_KEY_STORAGE_KEY, privateKeyHex);
    await SecureStore.setItemAsync(PUBLIC_KEY_STORAGE_KEY, publicKeyHex);
  },

  async getPrivateKey() {
    return SecureStore.getItemAsync(PRIVATE_KEY_STORAGE_KEY);
  },

  async getPublicKey() {
    return SecureStore.getItemAsync(PUBLIC_KEY_STORAGE_KEY);
  },

  async hasKeypair() {
    const pk = await this.getPublicKey();
    return pk !== null;
  },

  async delete() {
    await SecureStore.deleteItemAsync(PRIVATE_KEY_STORAGE_KEY);
    await SecureStore.deleteItemAsync(PUBLIC_KEY_STORAGE_KEY);
  },

  async generate() {
    const privateKeyBytes = await Crypto.getRandomBytesAsync(32);
    const privateKeyHex = bytesToHex(privateKeyBytes);
    const publicKey = secp256k1.getPublicKey(privateKeyBytes, true);
    const publicKeyHex = bytesToHex(publicKey);
    
    await this.store(privateKeyHex, publicKeyHex);
    
    return { privateKeyHex, publicKeyHex };
  },

  async sign(messageHex) {
    const privateKeyHex = await this.getPrivateKey();
    if (!privateKeyHex) throw new Error('No private key');
    
    const privateKey = hexToBytes(privateKeyHex);
    const messageHash = hexToBytes(messageHex);
    const signature = secp256k1.sign(messageHash, privateKey);
    
    return bytesToHex(signature.toCompactRawBytes());
  },
};

// ============================================================================
// SYNC CLIENT
// ============================================================================
const SyncClient = {
  async signBundle(bundle) {
    const hashInput = `KASVILLAGE_BUNDLE_V1:${bundle.pubkey_hex}${bundle.balance}${bundle.nonce}${bundle.last_global_root}${bundle.timestamp}`;
    const hashHex = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      hashInput
    );
    return KeypairManager.sign(hashHex);
  },

  async push(operation) {
    const pubkey = await KeypairManager.getPublicKey();
    if (!pubkey) throw new Error('No keypair configured');
    
    const bundle = await DatabaseManager.exportBundle(pubkey);
    bundle.user_signature = await this.signBundle(bundle);
    
    const response = await fetch(`${API_BASE}/api/v1/sync/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bundle, operation }),
    });
    
    const delta = await response.json();
    
    if (delta.success) {
      await DatabaseManager.importDelta(pubkey, delta);
    }
    
    return delta;
  },

  async pull() {
    const pubkey = await KeypairManager.getPublicKey();
    if (!pubkey) throw new Error('No keypair configured');
    
    const timestamp = Math.floor(Date.now() / 1000);
    const message = `SYNC_PULL:${pubkey}:${timestamp}`;
    const hashHex = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      message
    );
    const signature = await KeypairManager.sign(hashHex);
    
    const response = await fetch(`${API_BASE}/api/v1/sync/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pubkey_hex: pubkey, signature, timestamp }),
    });
    
    const result = await response.json();
    
    if (result.success) {
      await DatabaseManager.updateSyncState({
        lastGlobalRoot: result.current_global_root,
        lastSyncTimestamp: result.timestamp,
      });
    }
    
    return result;
  },

  async refresh() {
    return this.push({ op_type: 'Sync' });
  },

  async transfer(toPubkey, amount) {
    return this.push({
      op_type: 'Transfer',
      to_pubkey: toPubkey,
      amount,
    });
  },

  async withdraw(amount, kaspaAddress) {
    return this.push({
      op_type: 'Withdraw',
      amount,
      kaspa_address: kaspaAddress,
    });
  },

  async notifyDeposit(amount, l1TxHash) {
    return this.push({
      op_type: 'Deposit',
      amount,
      l1_tx_hash: l1TxHash,
    });
  },

  async getStatus() {
    const syncState = await DatabaseManager.getSyncState();
    
    let connected = false;
    try {
      const response = await fetch(`${API_BASE}/api/v1/sync/status`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      connected = response.ok;
    } catch {
      connected = false;
    }
    
    return {
      connected,
      lastSync: syncState.lastSyncTimestamp,
      lastRoot: syncState.lastGlobalRoot,
      lastBackup: syncState.lastArweaveBackup,
    };
  },
};

// ============================================================================
// ARWEAVE BACKUP
// ============================================================================
const ArweaveBackup = {
  async backup() {
    const pubkey = await KeypairManager.getPublicKey();
    const privateKey = await KeypairManager.getPrivateKey();
    if (!pubkey || !privateKey) throw new Error('No keypair configured');
    
    const bundle = await DatabaseManager.exportBundle(pubkey);
    bundle.user_signature = await SyncClient.signBundle(bundle);
    
    const secretHash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      `KASVILLAGE_BACKUP_KEY:${privateKey}`
    );
    
    const response = await fetch(`${API_BASE}/api/v1/backup/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bundle, user_secret_hash: secretHash }),
    });
    
    const result = await response.json();
    
    if (result.success && result.arweave_tx_id) {
      await DatabaseManager.updateSyncState({
        lastArweaveBackup: result.arweave_tx_id,
      });
    }
    
    return result;
  },

  async restore(arweaveTxId) {
    const privateKey = await KeypairManager.getPrivateKey();
    if (!privateKey) throw new Error('No private key');
    
    const secretHash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      `KASVILLAGE_BACKUP_KEY:${privateKey}`
    );
    
    const response = await fetch(`${API_BASE}/api/v1/backup/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ arweave_tx_id: arweaveTxId, user_secret_hash: secretHash }),
    });
    
    const result = await response.json();
    
    if (result.success && result.bundle) {
      await DatabaseManager.importDelta(result.bundle.pubkey_hex, {
        new_balance: result.bundle.balance,
        new_nonce: result.bundle.nonce,
        new_leaves: result.bundle.merkle_leaves,
        new_nullifiers: result.bundle.spent_nullifiers,
        current_global_root: result.bundle.last_global_root,
        timestamp: result.bundle.timestamp,
      });
      return { success: true, error: null };
    }
    
    return { success: false, error: result.error };
  },

  async list() {
    const pubkey = await KeypairManager.getPublicKey();
    if (!pubkey) throw new Error('No keypair configured');
    
    const response = await fetch(`${API_BASE}/api/v1/backup/list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pubkey_hex: pubkey }),
    });
    
    const result = await response.json();
    return result.success ? result.tx_ids : [];
  },
};

// ============================================================================
// VALIDATOR STATUS MANAGER
// ============================================================================
const ValidatorStatusManager = {
  async getValidatorStatus() {
    const res = await fetch(`${API_BASE}/api/validators/list`);
    return res.json();
  },

  async getCanonicalHash() {
    const res = await fetch(`${API_BASE}/api/validators/canonical-hash`);
    return res.json();
  },

  async getResharingStatus() {
    const res = await fetch(`${API_BASE}/api/reshare/status`);
    return res.json();
  },

  startPolling(callback, intervalMs = 30000) {
    const poll = async () => {
      try {
        const [validators, resharing] = await Promise.all([
          this.getValidatorStatus(),
          this.getResharingStatus()
        ]);
        callback({ validators, resharing, error: null });
      } catch (e) {
        callback({ validators: null, resharing: null, error: e.message });
      }
    };

    poll();
    const interval = setInterval(poll, intervalMs);
    return () => clearInterval(interval);
  }
};

// ============================================================================
// EPHEMERAL HARDWARE KEY MANAGER
// ============================================================================
const EphemeralHardwareKeyManager = {
  _expiryTimers: {},

  async generateKey() {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();

    const keyId = `hw_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const seed = await Crypto.getRandomBytesAsync(32);
    const seedHex = bytesToHex(seed);
    
    const privateKeyHash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      'EPHEMERAL_HARDWARE_P256_' + seedHex + keyId
    );
    
    const publicKeyHash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      privateKeyHash + 'p256_pubkey'
    );
    
    const expiresAt = Date.now() + EPHEMERAL_EXPIRY_MS;
    
    const keyData = {
      keyId,
      privateKey: privateKeyHash,
      publicKey: '02' + publicKeyHash.substring(0, 64),
      algorithm: 'P-256',
      ephemeral: true,
      hardwareBacked: hasHardware && isEnrolled,
      createdAt: Date.now(),
      expiresAt,
    };

    try {
      await SecureStore.setItemAsync(
        EPHEMERAL_PREFIX + keyId,
        privateKeyHash,
        { 
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
          requireAuthentication: hasHardware && isEnrolled
        }
      );
    } catch (e) {
      console.warn('SecureStore unavailable:', e);
    }

    const metadata = await this._loadMetadata();
    metadata.push({
      keyId,
      publicKey: keyData.publicKey,
      algorithm: 'P-256',
      hardwareBacked: keyData.hardwareBacked,
      createdAt: keyData.createdAt,
      expiresAt,
    });
    await this._saveMetadata(metadata);

    this._setExpiryTimer(keyId, expiresAt);

    console.log(`⏰ Ephemeral HW key ${keyId.substring(0, 12)}... generated`);
    return keyData;
  },

  async signWithKey(keyId, messageHash) {
    const metadata = await this._loadMetadata();
    const keyMeta = metadata.find(k => k.keyId === keyId);
    
    if (!keyMeta) throw new Error(`Key not found: ${keyId}`);
    if (Date.now() > keyMeta.expiresAt) throw new Error(`Key expired: ${keyId}`);

    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();

    if (hasHardware && isEnrolled) {
      const auth = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Authorize KasVillage Withdrawal',
        fallbackLabel: 'Use Passcode',
        disableDeviceFallback: false
      });
      
      if (!auth.success) throw new Error(`Biometric failed: ${auth.error || 'cancelled'}`);
    }

    const privateKey = await SecureStore.getItemAsync(EPHEMERAL_PREFIX + keyId);
    if (!privateKey) throw new Error('Key data corrupted');

    const r = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, privateKey + messageHash + 'r');
    const s = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, privateKey + messageHash + 's');

    const signature = r + s.substring(0, 64);
    const recoveryId = parseInt(signature.substring(0, 1), 16) % 4;

    await this.destroyKey(keyId);

    return {
      signature: signature.substring(0, 128),
      keyId,
      recoveryId,
      publicKey: keyMeta.publicKey,
      algorithm: 'P-256-SHA256',
    };
  },

  async destroyKey(keyId) {
    try {
      await SecureStore.deleteItemAsync(EPHEMERAL_PREFIX + keyId);
    } catch (e) {}

    if (this._expiryTimers[keyId]) {
      clearTimeout(this._expiryTimers[keyId]);
      delete this._expiryTimers[keyId];
    }

    const metadata = await this._loadMetadata();
    const filtered = metadata.filter(k => k.keyId !== keyId);
    await this._saveMetadata(filtered);
  },

  async listActiveKeys() {
    const metadata = await this._loadMetadata();
    return metadata.filter(k => k.expiresAt > Date.now());
  },

  async cleanupExpiredKeys() {
    const metadata = await this._loadMetadata();
    const now = Date.now();
    const expired = metadata.filter(k => k.expiresAt <= now);
    
    for (const key of expired) {
      try { await SecureStore.deleteItemAsync(EPHEMERAL_PREFIX + key.keyId); } catch {}
    }

    await this._saveMetadata(metadata.filter(k => k.expiresAt > now));
    if (expired.length > 0) console.log(`🧹 Cleaned ${expired.length} expired keys`);
  },

  async _loadMetadata() {
    try {
      const data = await SecureStore.getItemAsync(EPHEMERAL_METADATA);
      return data ? JSON.parse(data) : [];
    } catch { return []; }
  },

  async _saveMetadata(metadata) {
    try {
      await SecureStore.setItemAsync(EPHEMERAL_METADATA, JSON.stringify(metadata));
    } catch {}
  },

  _setExpiryTimer(keyId, expiresAt) {
    const timeUntilExpiry = expiresAt - Date.now();
    if (timeUntilExpiry <= 0) { this.destroyKey(keyId); return; }
    this._expiryTimers[keyId] = setTimeout(() => this.destroyKey(keyId), timeUntilExpiry);
  },
};

// ============================================================================
// EPHEMERAL SECP256K1 KEY MANAGER
// ============================================================================
const EphemeralSecpKeyManager = {
  _expiryTimers: {},

  async generateKey() {
    const keyId = `secp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const seed = await Crypto.getRandomBytesAsync(32);
    const seedHex = bytesToHex(seed);
    
    const privateKeyHash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      'EPHEMERAL_SECP256K1_' + seedHex + keyId
    );
    
    const publicKeyHash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      privateKeyHash + 'secp256k1_pubkey'
    );
    
    const expiresAt = Date.now() + EPHEMERAL_EXPIRY_MS;
    
    const keyData = {
      keyId,
      privateKey: privateKeyHash,
      publicKey: '02' + publicKeyHash.substring(0, 64),
      algorithm: 'secp256k1',
      ephemeral: true,
      createdAt: Date.now(),
      expiresAt,
    };

    try {
      await SecureStore.setItemAsync(EPHEMERAL_PREFIX + keyId, privateKeyHash);
    } catch {}

    const metadata = await this._loadMetadata();
    metadata.push({
      keyId,
      publicKey: keyData.publicKey,
      algorithm: 'secp256k1',
      createdAt: keyData.createdAt,
      expiresAt,
    });
    await this._saveMetadata(metadata);

    this._setExpiryTimer(keyId, expiresAt);
    return keyData;
  },

  async signWithKey(keyId, messageHash) {
    const metadata = await this._loadMetadata();
    const keyMeta = metadata.find(k => k.keyId === keyId);
    
    if (!keyMeta) throw new Error(`Key not found: ${keyId}`);
    if (Date.now() > keyMeta.expiresAt) throw new Error(`Key expired: ${keyId}`);

    const privateKey = await SecureStore.getItemAsync(EPHEMERAL_PREFIX + keyId);
    if (!privateKey) throw new Error('Key data corrupted');

    const signature = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      privateKey + messageHash
    );

    return {
      signature: signature.substring(0, 128),
      keyId,
      recoveryId: parseInt(signature.substring(0, 1), 16) % 4,
      publicKey: keyMeta.publicKey,
      algorithm: 'secp256k1',
    };
  },

  async destroyKey(keyId) {
    try { await SecureStore.deleteItemAsync(EPHEMERAL_PREFIX + keyId); } catch {}
    if (this._expiryTimers[keyId]) {
      clearTimeout(this._expiryTimers[keyId]);
      delete this._expiryTimers[keyId];
    }
    const metadata = await this._loadMetadata();
    await this._saveMetadata(metadata.filter(k => k.keyId !== keyId));
  },

  async listActiveKeys() {
    const metadata = await this._loadMetadata();
    return metadata.filter(k => k.expiresAt > Date.now());
  },

  async cleanupExpiredKeys() {
    const metadata = await this._loadMetadata();
    const now = Date.now();
    for (const key of metadata.filter(k => k.expiresAt <= now)) {
      try { await SecureStore.deleteItemAsync(EPHEMERAL_PREFIX + key.keyId); } catch {}
    }
    await this._saveMetadata(metadata.filter(k => k.expiresAt > now));
  },

  async _loadMetadata() {
    try {
      const data = await SecureStore.getItemAsync(EPHEMERAL_METADATA + '_secp');
      return data ? JSON.parse(data) : [];
    } catch { return []; }
  },

  async _saveMetadata(metadata) {
    try {
      await SecureStore.setItemAsync(EPHEMERAL_METADATA + '_secp', JSON.stringify(metadata));
    } catch {}
  },

  _setExpiryTimer(keyId, expiresAt) {
    const timeUntilExpiry = expiresAt - Date.now();
    if (timeUntilExpiry <= 0) { this.destroyKey(keyId); return; }
    this._expiryTimers[keyId] = setTimeout(() => this.destroyKey(keyId), timeUntilExpiry);
  },
};

// ============================================================================
// WALLET DEEPLINK MANAGER
// ============================================================================
const WalletDeepLinkManager = {
  parseDeepLink(url) {
    try {
      const parsed = Linking.parse(url);
      return {
        scheme: parsed.scheme,
        hostname: parsed.hostname,
        path: parsed.path,
        params: parsed.params,
      };
    } catch { return null; }
  },

  formatWalletDeepLink(walletId, messageHash) {
    const deepLinks = {
      kaspium: `kaspium://sign?message=${messageHash}&callback=${encodeURIComponent(WALLET_DEEPLINK_PREFIX + 'wallet-callback')}`,
      ledger: `ledgerlive://kaspa?message=${messageHash}&callback=${encodeURIComponent(WALLET_DEEPLINK_PREFIX + 'wallet-callback')}`,
      tangem: `tangem://sign?message=${messageHash}&callback=${encodeURIComponent(WALLET_DEEPLINK_PREFIX + 'wallet-callback')}`,
      onekey: `onekey://kaspa?message=${messageHash}&callback=${encodeURIComponent(WALLET_DEEPLINK_PREFIX + 'wallet-callback')}`,
    };
    return deepLinks[walletId] || null;
  },

  async openWalletApp(walletId, messageHash) {
    const deepLink = this.formatWalletDeepLink(walletId, messageHash);
    if (!deepLink) throw new Error(`Unknown wallet: ${walletId}`);

    const canOpen = await Linking.canOpenURL(deepLink);
    if (!canOpen) throw new Error(`${walletId} not installed`);

    await Linking.openURL(deepLink);
  },

  async submitSignatureToBackend(signature, walletAddress, withdrawalHash, userPubkey) {
    const res = await fetch(`${API_BASE}/api/v1/withdraw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        withdrawal_hash: withdrawalHash,
        signature,
        user_pubkey: userPubkey,
        wallet_address: walletAddress,
        timestamp: Date.now(),
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Backend error');
    return data;
  }
};

// ============================================================================
// MAIN APP COMPONENT
// ============================================================================
export default function App() {
  const webViewRef = useRef(null);
  const [webUri, setWebUri] = useState(null);
  const [walletSignature, setWalletSignature] = useState(null);
  const appState = useRef(AppState.currentState);

  // Initialize database on mount
  useEffect(() => {
    DatabaseManager.init();
  }, []);

  // Load web assets
  useEffect(() => {
    async function loadWebAssets() {
      if (__DEV__) {
        setWebUri('https://react-nvxufcuj.stackblitz.io');
      } else {
        const asset = Asset.fromModule(require('./assets/web/index.html'));
        await asset.downloadAsync();
        setWebUri(asset.localUri);
      }
    }
    loadWebAssets();
  }, []);

  // Validator status polling
  useEffect(() => {
    const stopPolling = ValidatorStatusManager.startPolling((status) => {
      if (webViewRef.current && !status.error) {
        webViewRef.current.injectJavaScript(
          `window.handleValidatorUpdate && window.handleValidatorUpdate(${JSON.stringify(status)});true;`
        );
      }
    }, 30000);
    return () => stopPolling();
  }, []);

  // DeepLink listener
  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      const parsed = WalletDeepLinkManager.parseDeepLink(url);
      if (!parsed) return;

      const signature = parsed.params?.signature;
      const walletType = parsed.params?.walletType;

      if (signature) {
        setWalletSignature({ signature, walletType, receivedAt: Date.now() });
        webViewRef.current?.injectJavaScript(
          `window.handleWalletSignature(${JSON.stringify({ signature, walletType, receivedAt: Date.now() })});true;`
        );
      }
    });
    return () => subscription?.remove();
  }, []);

  // App state handler
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        await EphemeralHardwareKeyManager.cleanupExpiredKeys();
        await EphemeralSecpKeyManager.cleanupExpiredKeys();
      }
      appState.current = nextAppState;
    });
    return () => subscription.remove();
  }, []);

  const send = useCallback((id, ok, res, err) => {
    if (webViewRef.current && id) {
      webViewRef.current.injectJavaScript(
        `window.handleNativeResponse(${JSON.stringify({ requestId: id, success: ok, result: res, error: err })});true;`
      );
    }
  }, []);

  const onMessage = useCallback(async (event) => {
    try {
      const { type, payload, requestId } = JSON.parse(event.nativeEvent.data);

      switch (type) {
        // Database
        case 'DB_INIT': try { await DatabaseManager.init(); send(requestId, true, true); } catch (e) { send(requestId, false, null, e.message); } break;
        case 'DB_GET_ACCOUNT': try { send(requestId, true, await DatabaseManager.getAccountState(payload.pubkey)); } catch (e) { send(requestId, false, null, e.message); } break;
        case 'DB_SET_ACCOUNT': try { await DatabaseManager.setAccountState(payload); send(requestId, true, true); } catch (e) { send(requestId, false, null, e.message); } break;
        case 'DB_EXPORT_BUNDLE': try { send(requestId, true, await DatabaseManager.exportBundle(payload.pubkey)); } catch (e) { send(requestId, false, null, e.message); } break;
        case 'DB_IMPORT_DELTA': try { await DatabaseManager.importDelta(payload.pubkey, payload.delta); send(requestId, true, true); } catch (e) { send(requestId, false, null, e.message); } break;
        case 'DB_GET_TRANSACTIONS': try { send(requestId, true, await DatabaseManager.getTransactions(payload.pubkey, payload.limit)); } catch (e) { send(requestId, false, null, e.message); } break;
        case 'DB_GET_STATS': try { send(requestId, true, await DatabaseManager.getStats()); } catch (e) { send(requestId, false, null, e.message); } break;
        case 'DB_RESET': try { await DatabaseManager.reset(); send(requestId, true, true); } catch (e) { send(requestId, false, null, e.message); } break;

        // Keypair
        case 'KEYPAIR_GENERATE': try { send(requestId, true, await KeypairManager.generate()); } catch (e) { send(requestId, false, null, e.message); } break;
        case 'KEYPAIR_STORE': try { await KeypairManager.store(payload.privateKey, payload.publicKey); send(requestId, true, true); } catch (e) { send(requestId, false, null, e.message); } break;
        case 'KEYPAIR_GET_PUBLIC': try { send(requestId, true, await KeypairManager.getPublicKey()); } catch (e) { send(requestId, false, null, e.message); } break;
        case 'KEYPAIR_HAS': try { send(requestId, true, await KeypairManager.hasKeypair()); } catch (e) { send(requestId, false, null, e.message); } break;
        case 'KEYPAIR_DELETE': try { await KeypairManager.delete(); send(requestId, true, true); } catch (e) { send(requestId, false, null, e.message); } break;
        case 'KEYPAIR_SIGN': try { send(requestId, true, await KeypairManager.sign(payload.messageHex)); } catch (e) { send(requestId, false, null, e.message); } break;

        // Sync
        case 'SYNC_PUSH': try { send(requestId, true, await SyncClient.push(payload.operation)); } catch (e) { send(requestId, false, null, e.message); } break;
        case 'SYNC_PULL': try { send(requestId, true, await SyncClient.pull()); } catch (e) { send(requestId, false, null, e.message); } break;
        case 'SYNC_REFRESH': try { send(requestId, true, await SyncClient.refresh()); } catch (e) { send(requestId, false, null, e.message); } break;
        case 'SYNC_TRANSFER': try { send(requestId, true, await SyncClient.transfer(payload.toPubkey, payload.amount)); } catch (e) { send(requestId, false, null, e.message); } break;
        case 'SYNC_WITHDRAW': try { send(requestId, true, await SyncClient.withdraw(payload.amount, payload.kaspaAddress)); } catch (e) { send(requestId, false, null, e.message); } break;
        case 'SYNC_DEPOSIT': try { send(requestId, true, await SyncClient.notifyDeposit(payload.amount, payload.l1TxHash)); } catch (e) { send(requestId, false, null, e.message); } break;
        case 'SYNC_STATUS': try { send(requestId, true, await SyncClient.getStatus()); } catch (e) { send(requestId, false, null, e.message); } break;

        // Arweave
        case 'ARWEAVE_BACKUP': try { send(requestId, true, await ArweaveBackup.backup()); } catch (e) { send(requestId, false, null, e.message); } break;
        case 'ARWEAVE_RESTORE': try { send(requestId, true, await ArweaveBackup.restore(payload.txId)); } catch (e) { send(requestId, false, null, e.message); } break;
        case 'ARWEAVE_LIST': try { send(requestId, true, await ArweaveBackup.list()); } catch (e) { send(requestId, false, null, e.message); } break;

        // Validators
        case 'GET_VALIDATOR_STATUS': try { send(requestId, true, await ValidatorStatusManager.getValidatorStatus()); } catch (e) { send(requestId, false, null, e.message); } break;
        case 'GET_CANONICAL_HASH': try { send(requestId, true, await ValidatorStatusManager.getCanonicalHash()); } catch (e) { send(requestId, false, null, e.message); } break;
        case 'GET_RESHARING_STATUS': try { send(requestId, true, await ValidatorStatusManager.getResharingStatus()); } catch (e) { send(requestId, false, null, e.message); } break;

        // Ephemeral Hardware Keys
        case 'GENERATE_HARDWARE_KEY': try { send(requestId, true, await EphemeralHardwareKeyManager.generateKey()); } catch (e) { send(requestId, false, null, e.message); } break;
        case 'SIGN_WITH_HARDWARE': try { send(requestId, true, await EphemeralHardwareKeyManager.signWithKey(payload.keyId, payload.messageHash)); } catch (e) { send(requestId, false, null, e.message); } break;
        case 'DESTROY_HARDWARE_KEY': try { await EphemeralHardwareKeyManager.destroyKey(payload.keyId); send(requestId, true, true); } catch (e) { send(requestId, false, null, e.message); } break;
        case 'LIST_HARDWARE_KEYS': try { send(requestId, true, await EphemeralHardwareKeyManager.listActiveKeys()); } catch (e) { send(requestId, false, null, e.message); } break;

        // Ephemeral Secp Keys
        case 'GENERATE_SECP_KEY': try { send(requestId, true, await EphemeralSecpKeyManager.generateKey()); } catch (e) { send(requestId, false, null, e.message); } break;
        case 'SIGN_WITH_SECP': try { send(requestId, true, await EphemeralSecpKeyManager.signWithKey(payload.keyId, payload.messageHash)); } catch (e) { send(requestId, false, null, e.message); } break;
        case 'DESTROY_SECP_KEY': try { await EphemeralSecpKeyManager.destroyKey(payload.keyId); send(requestId, true, true); } catch (e) { send(requestId, false, null, e.message); } break;
        case 'LIST_SECP_KEYS': try { send(requestId, true, await EphemeralSecpKeyManager.listActiveKeys()); } catch (e) { send(requestId, false, null, e.message); } break;

        // Cleanup
        case 'CLEANUP_KEYS':
          try {
            await EphemeralHardwareKeyManager.cleanupExpiredKeys();
            await EphemeralSecpKeyManager.cleanupExpiredKeys();
            send(requestId, true, true);
          } catch (e) { send(requestId, false, null, e.message); }
          break;

        // Wallet
        case 'OPEN_WALLET_APP': try { await WalletDeepLinkManager.openWalletApp(payload.walletId, payload.messageHash); send(requestId, true, { opened: true }); } catch (e) { send(requestId, false, null, e.message); } break;
        case 'SUBMIT_WALLET_SIGNATURE': try { send(requestId, true, await WalletDeepLinkManager.submitSignatureToBackend(payload.signature, payload.walletAddress, payload.withdrawalHash, payload.userPubkey)); } catch (e) { send(requestId, false, null, e.message); } break;
        case 'GET_WALLET_SIGNATURE': send(requestId, true, walletSignature); break;
        case 'CLEAR_WALLET_SIGNATURE': setWalletSignature(null); send(requestId, true, true); break;

        default: send(requestId, false, null, `Unknown: ${type}`);
      }
    } catch (e) {
      console.error('Message handler error:', e);
    }
  }, [send, walletSignature]);

  return (
    <SafeAreaView style={{ flex: 1, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 }}>
      <StatusBar barStyle="light-content" />
      {webUri ? (
        <WebView
          ref={webViewRef}
          source={{ uri: webUri }}
          onMessage={onMessage}
          javaScriptEnabled={true}
          injectedJavaScript={`
            window.nativeRequest = (type, payload) => {
              return new Promise((resolve, reject) => {
                const requestId = Math.random().toString(36).substr(2, 9);
                window.resolvers = window.resolvers || {};
                window.resolvers[requestId] = { resolve, reject };
                window.ReactNativeWebView.postMessage(JSON.stringify({ type, payload, requestId }));
              });
            };
            
            window.handleNativeResponse = ({ requestId, success, result, error }) => {
              if (window.resolvers?.[requestId]) {
                success ? window.resolvers[requestId].resolve(result) : window.resolvers[requestId].reject(new Error(error));
                delete window.resolvers[requestId];
              }
            };

            window.handleWalletSignature = (data) => window.onWalletSignature?.(data);
            window.handleValidatorUpdate = (data) => window.onValidatorUpdate?.(data);

            // KasVillage Native API
            window.KasVillage = {
              // Database
              db: {
                init: () => window.nativeRequest('DB_INIT'),
                getAccount: (pubkey) => window.nativeRequest('DB_GET_ACCOUNT', { pubkey }),
                setAccount: (state) => window.nativeRequest('DB_SET_ACCOUNT', state),
                exportBundle: (pubkey) => window.nativeRequest('DB_EXPORT_BUNDLE', { pubkey }),
                importDelta: (pubkey, delta) => window.nativeRequest('DB_IMPORT_DELTA', { pubkey, delta }),
                getTransactions: (pubkey, limit) => window.nativeRequest('DB_GET_TRANSACTIONS', { pubkey, limit }),
                getStats: () => window.nativeRequest('DB_GET_STATS'),
                reset: () => window.nativeRequest('DB_RESET'),
              },
              
              // Keypair
              keypair: {
                generate: () => window.nativeRequest('KEYPAIR_GENERATE'),
                store: (privateKey, publicKey) => window.nativeRequest('KEYPAIR_STORE', { privateKey, publicKey }),
                getPublic: () => window.nativeRequest('KEYPAIR_GET_PUBLIC'),
                has: () => window.nativeRequest('KEYPAIR_HAS'),
                delete: () => window.nativeRequest('KEYPAIR_DELETE'),
                sign: (messageHex) => window.nativeRequest('KEYPAIR_SIGN', { messageHex }),
              },
              
              // Sync
              sync: {
                push: (operation) => window.nativeRequest('SYNC_PUSH', { operation }),
                pull: () => window.nativeRequest('SYNC_PULL'),
                refresh: () => window.nativeRequest('SYNC_REFRESH'),
                transfer: (toPubkey, amount) => window.nativeRequest('SYNC_TRANSFER', { toPubkey, amount }),
                withdraw: (amount, kaspaAddress) => window.nativeRequest('SYNC_WITHDRAW', { amount, kaspaAddress }),
                deposit: (amount, l1TxHash) => window.nativeRequest('SYNC_DEPOSIT', { amount, l1TxHash }),
                status: () => window.nativeRequest('SYNC_STATUS'),
              },
              
              // Arweave Backup
              backup: {
                create: () => window.nativeRequest('ARWEAVE_BACKUP'),
                restore: (txId) => window.nativeRequest('ARWEAVE_RESTORE', { txId }),
                list: () => window.nativeRequest('ARWEAVE_LIST'),
              },
              
              // Validators
              validators: {
                status: () => window.nativeRequest('GET_VALIDATOR_STATUS'),
                canonicalHash: () => window.nativeRequest('GET_CANONICAL_HASH'),
                resharingStatus: () => window.nativeRequest('GET_RESHARING_STATUS'),
              },
              
              // Hardware keys (P-256 + biometric)
              hardwareKey: {
                generate: () => window.nativeRequest('GENERATE_HARDWARE_KEY'),
                sign: (keyId, messageHash) => window.nativeRequest('SIGN_WITH_HARDWARE', { keyId, messageHash }),
                destroy: (keyId) => window.nativeRequest('DESTROY_HARDWARE_KEY', { keyId }),
                list: () => window.nativeRequest('LIST_HARDWARE_KEYS'),
              },
              
              // Secp256k1 keys
              secpKey: {
                generate: () => window.nativeRequest('GENERATE_SECP_KEY'),
                sign: (keyId, messageHash) => window.nativeRequest('SIGN_WITH_SECP', { keyId, messageHash }),
                destroy: (keyId) => window.nativeRequest('DESTROY_SECP_KEY', { keyId }),
                list: () => window.nativeRequest('LIST_SECP_KEYS'),
              },
              
              // Cleanup
              cleanupKeys: () => window.nativeRequest('CLEANUP_KEYS'),
              
              // Wallet
              wallet: {
                open: (walletId, messageHash) => window.nativeRequest('OPEN_WALLET_APP', { walletId, messageHash }),
                submitSignature: (sig, addr, hash, pubkey) => window.nativeRequest('SUBMIT_WALLET_SIGNATURE', {
                  signature: sig, walletAddress: addr, withdrawalHash: hash, userPubkey: pubkey
                }),
                getSignature: () => window.nativeRequest('GET_WALLET_SIGNATURE'),
                clearSignature: () => window.nativeRequest('CLEAR_WALLET_SIGNATURE'),
              },
            };

            console.log('🏠 KasVillage Native API v2 initialized');
            true;
          `}
        />
      ) : null}
    </SafeAreaView>
  );
}
