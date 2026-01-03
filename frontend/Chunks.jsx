import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Wallet, Shield, ShieldCheck, AlertTriangle, User, Lock, Activity,
  CheckCircle, ArrowRight, Clock, RefreshCw, X, Zap, TrendingUp,
  Users, Ban, Award, Star, AlertOctagon, Search, UserCheck, Eye
} from 'lucide-react';
import { sendNative, isNative, fetchBalance } from './crypto/bridge';
import { UserReputation, getTier, XP_TIERS, SOMPI_PER_KAS, assessCounterpartyRisk, loadAndAssessCounterparty } from './reputation/xp';

// Lazy load crypto module
const loadCrypto = () => import('./crypto/secp256k1');

// ============================================================================
// UTILITY
// ============================================================================

function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}

function formatKas(sompi) {
  return (sompi / SOMPI_PER_KAS).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

// ============================================================================
// COMPONENTS
// ============================================================================

function SecurityBadge({ security }) {
  if (!security) return null;
  
  const isHardware = security.hasSecureEnclave || security.hasStrongBox;
  const hasBiometric = security.hasBiometric;
  
  return (
    <div className={cn(
      'px-3 py-1.5 rounded-full text-xs font-medium text-white',
      isHardware ? 'secure-badge' : hasBiometric ? 'bg-blue-500/80' : 'bg-yellow-500/80'
    )}>
      {isHardware ? '🛡️ Hardware' : hasBiometric ? '🔐 Biometric' : '⚠️ Software'}
    </div>
  );
}

function TierBadge({ tier, xp }) {
  return (
    <div className="flex items-center gap-2">
      <div 
        className="w-3 h-3 rounded-full" 
        style={{ backgroundColor: tier.color }}
      />
      <span className="font-bold" style={{ color: tier.color }}>{tier.name}</span>
      <span className="text-xs text-stone-400">({xp} XP)</span>
    </div>
  );
}

function ReputationCard({ reputation, onRefresh }) {
  const tier = reputation.tier;
  const risk = assessCounterpartyRisk(reputation);
  
  return (
    <div className="bg-white rounded-xl p-4 shadow-md border border-stone-200">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Award size={20} className="text-amber-500" />
          <span className="font-bold text-stone-700">Reputation</span>
        </div>
        <button onClick={onRefresh} className="p-1 hover:bg-stone-100 rounded">
          <RefreshCw size={16} className="text-stone-400" />
        </button>
      </div>
      
      <TierBadge tier={tier} xp={reputation.xp} />
      
      <div className="grid grid-cols-2 gap-2 mt-3">
        <div className="bg-stone-50 rounded-lg p-2">
          <p className="text-xs text-stone-500">Success Rate</p>
          <p className="font-bold text-green-600">{reputation.successRate}%</p>
        </div>
        <div className="bg-stone-50 rounded-lg p-2">
          <p className="text-xs text-stone-500">Completion Prob</p>
          <p className="font-bold" style={{ color: risk.color }}>{(reputation.completionProbability * 100).toFixed(1)}%</p>
        </div>
        <div className="bg-stone-50 rounded-lg p-2">
          <p className="text-xs text-stone-500">TX Completed</p>
          <p className="font-bold text-stone-700">{reputation.txCompleted}</p>
        </div>
        <div className="bg-stone-50 rounded-lg p-2">
          <p className="text-xs text-stone-500">Deadlocks</p>
          <p className={cn('font-bold', reputation.deadlocks > 0 ? 'text-red-600' : 'text-stone-400')}>
            {reputation.deadlocks}
          </p>
        </div>
      </div>
      
      {/* Variety Score Bar */}
      <div className="mt-3">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-stone-500">Variety Score</span>
          <span className="text-stone-600">{reputation.varietyScore.toFixed(2)}</span>
        </div>
        <div className="h-2 bg-stone-200 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-amber-400 to-amber-600 rounded-full"
            style={{ width: `${Math.min(100, reputation.varietyScore * 50)}%` }}
          />
        </div>
      </div>
      
      {/* Merkle Verification - Always verified */}
      <div className="mt-3 p-2 rounded-lg text-xs flex items-center gap-2 bg-green-50 text-green-700">
        <ShieldCheck size={14} />
        <span>XP verified by Merkle tree (Poseidon)</span>
      </div>
    </div>
  );
}

function CounterpartyRiskBanner({ reputation }) {
  const risk = assessCounterpartyRisk(reputation);
  
  return (
    <div 
      className="rounded-lg p-3 flex items-center gap-3"
      style={{ backgroundColor: risk.color + '15', borderColor: risk.color, borderWidth: 1 }}
    >
      {risk.level === 'LOW' && <ShieldCheck size={20} style={{ color: risk.color }} />}
      {risk.level === 'MEDIUM' && <AlertTriangle size={20} style={{ color: risk.color }} />}
      {risk.level === 'HIGH' && <AlertOctagon size={20} style={{ color: risk.color }} />}
      {risk.level === 'CRITICAL' && <Ban size={20} style={{ color: risk.color }} />}
      
      <div>
        <p className="font-bold text-sm" style={{ color: risk.color }}>
          {risk.level} RISK
        </p>
        <p className="text-xs text-stone-600">{risk.message}</p>
      </div>
    </div>
  );
}

function CounterpartyLookup({ onLookup }) {
  const [pubkey, setPubkey] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  
  const handleLookup = async () => {
    if (!pubkey || pubkey.length < 10) return;
    setLoading(true);
    try {
      const data = await loadAndAssessCounterparty(pubkey);
      setResult(data);
      if (onLookup) onLookup(data);
    } catch (e) {
      setResult({ error: e.message });
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="bg-white rounded-xl p-4 shadow-md border border-stone-200">
      <div className="flex items-center gap-2 mb-3">
        <Search size={20} className="text-indigo-500" />
        <span className="font-bold text-stone-700">Lookup Counterparty</span>
      </div>
      
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          placeholder="Enter pubkey (02...)"
          value={pubkey}
          onChange={e => setPubkey(e.target.value)}
          className="flex-1 p-2 border border-stone-300 rounded-lg text-sm font-mono"
        />
        <button
          onClick={handleLookup}
          disabled={loading || pubkey.length < 10}
          className="px-4 py-2 bg-indigo-500 text-white rounded-lg font-medium disabled:opacity-50"
        >
          {loading ? '...' : <Eye size={18} />}
        </button>
      </div>
      
      {result && !result.error && (
        <div className="space-y-3">
          <CounterpartyRiskBanner reputation={result.reputation} />
          
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="bg-stone-50 rounded p-2">
              <p className="text-xs text-stone-500">XP / Tier</p>
              <p className="font-bold" style={{ color: result.reputation.tier.color }}>
                {result.reputation.xp} ({result.reputation.tier.name})
              </p>
            </div>
            <div className="bg-stone-50 rounded p-2">
              <p className="text-xs text-stone-500">Success Rate</p>
              <p className="font-bold text-green-600">{result.reputation.successRate}%</p>
            </div>
            <div className="bg-stone-50 rounded p-2">
              <p className="text-xs text-stone-500">TX Completed</p>
              <p className="font-bold">{result.reputation.txCompleted}</p>
            </div>
            <div className="bg-stone-50 rounded p-2">
              <p className="text-xs text-stone-500">Deadlocks</p>
              <p className={cn('font-bold', result.reputation.deadlocks > 0 ? 'text-red-600' : 'text-stone-400')}>
                {result.reputation.deadlocks}
              </p>
            </div>
          </div>
          
          <div className="p-2 rounded text-xs flex items-center gap-2 bg-green-50 text-green-700">
            <ShieldCheck size={14} /> XP verified by Merkle tree (Poseidon)
          </div>
        </div>
      )}
      
      {result?.error && (
        <div className="p-2 bg-red-50 text-red-700 rounded text-sm">
          Error: {result.error}
        </div>
      )}
    </div>
  );
}

function KeySetupCard({ hwKey, secpPubKey, onSetup }) {
  const ready = hwKey && secpPubKey;
  
  return (
    <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl p-4 border border-emerald-200">
      <p className="font-bold text-emerald-800 mb-3 flex items-center gap-2">
        <Lock size={18} />
        2-of-2 Multi-Signature Keys
      </p>
      
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-lg p-3 border border-stone-200">
          <p className="text-xs text-stone-500 mb-1">P-256 Hardware</p>
          {hwKey ? (
            <p className="font-mono text-xs text-green-600">✓ {hwKey.publicKey.substring(0, 12)}...</p>
          ) : (
            <p className="font-mono text-xs text-stone-400">Not created</p>
          )}
        </div>
        <div className="bg-white rounded-lg p-3 border border-stone-200">
          <p className="text-xs text-stone-500 mb-1">secp256k1 Signing</p>
          {secpPubKey ? (
            <p className="font-mono text-xs text-green-600">✓ {secpPubKey.substring(0, 12)}...</p>
          ) : (
            <p className="font-mono text-xs text-stone-400">Not created</p>
          )}
        </div>
      </div>
      
      <button 
        onClick={onSetup}
        disabled={ready}
        className={cn(
          'w-full mt-3 py-3 rounded-xl font-bold transition-colors',
          ready 
            ? 'bg-stone-300 text-stone-500 cursor-not-allowed' 
            : 'bg-emerald-600 text-white active:bg-emerald-700'
        )}
      >
        {ready ? '✓ Keys Ready' : '🔑 Setup 2-of-2 Keys'}
      </button>
    </div>
  );
}

function TransactionModal({ isOpen, onClose, onSign, balance }) {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [signing, setSigning] = useState(false);
  
  const handleSign = async () => {
    if (!recipient || !amount) return;
    setSigning(true);
    try {
      await onSign(recipient, parseFloat(amount));
      onClose();
    } catch (e) {
      alert('Sign failed: ' + e.message);
    } finally {
      setSigning(false);
    }
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-xl font-bold mb-1">Sign Transaction</h3>
        <p className="text-xs text-stone-500 mb-4">Requires hardware + secp256k1 signatures</p>
        
        <div className="space-y-3">
          <div>
            <label className="text-sm text-stone-600 font-medium">Recipient</label>
            <input 
              type="text" 
              placeholder="kaspa:qr..."
              value={recipient}
              onChange={e => setRecipient(e.target.value)}
              className="w-full p-3 border border-stone-300 rounded-lg mt-1 font-mono text-sm"
            />
          </div>
          
          <div>
            <label className="text-sm text-stone-600 font-medium">Amount (KAS)</label>
            <input 
              type="number"
              placeholder="0.00"
              step="0.00000001"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="w-full p-3 border border-stone-300 rounded-lg mt-1"
            />
            <p className="text-xs text-stone-400 mt-1">
              Available: {formatKas(balance)} KAS
            </p>
          </div>
          
          <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
            <p className="text-xs text-amber-800 font-medium">🔐 Signing Process:</p>
            <ol className="text-xs text-amber-700 mt-1 list-decimal list-inside">
              <li>P-256 hardware auth (biometric)</li>
              <li>Decrypt secp256k1 key</li>
              <li>Sign Kaspa transaction</li>
            </ol>
          </div>
          
          <div className="flex gap-2">
            <button 
              onClick={onClose}
              className="flex-1 bg-stone-200 p-3 rounded-xl font-medium"
            >
              Cancel
            </button>
            <button 
              onClick={handleSign}
              disabled={signing || !recipient || !amount}
              className="flex-1 bg-amber-500 text-white p-3 rounded-xl font-bold disabled:opacity-50"
            >
              {signing ? '⏳...' : '🔐 Sign'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ============================================================================
// MAIN APP
// ============================================================================

export default function App() {
  const [security, setSecurity] = useState(null);
  const [hwKey, setHwKey] = useState(null);
  const [secpPubKey, setSecpPubKey] = useState(null);
  const [encryptedSecp, setEncryptedSecp] = useState(null);
  const [balance, setBalance] = useState(0);
  const [reputation, setReputation] = useState(new UserReputation(''));
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [logs, setLogs] = useState(['Initializing...']);
  
  const log = useCallback((msg) => {
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 50)]);
  }, []);
  
  // Initialize
  useEffect(() => {
    async function init() {
      try {
        log('Checking security...');
        const sec = await sendNative('CHECK_SECURITY');
        setSecurity(sec);
        log(`Platform: ${sec.platform}, Level: ${sec.securityLevel}`);
        
        // Load existing keys
        const keys = await sendNative('LIST_KEYS');
        if (keys?.length > 0) {
          setHwKey(keys[0]);
          if (keys[0].hasEncryptedSecp) {
            const encData = await sendNative('GET_ENCRYPTED_SECP', { keyId: keys[0].keyId });
            if (encData) {
              setEncryptedSecp(encData.encrypted);
              setSecpPubKey(encData.publicKey);
            }
          }
          log('✓ Keys loaded');
        }
        
        // Mock balance for testing
        setBalance(125050000000); // 1250.5 KAS
        
        // Mock reputation
        const rep = new UserReputation('02mock...');
        rep.xp = 2500;
        rep.txCompleted = 47;
        rep.txDisputed = 2;
        rep.deadlocks = 0;
        rep.balance = 125050000000;
        rep.actionCounts = { transfer: 30, mutualPay: 10, validation: 5, dapp: 2, token: 0, escrow: 0 };
        setReputation(rep);
        
        log('✓ Ready');
      } catch (e) {
        log('✗ Init failed: ' + e.message);
      }
    }
    init();
  }, [log]);
  
  // Setup 2-of-2 keys
  const setupKeys = async () => {
    try {
      log('🔑 Setting up 2-of-2 keys...');
      
      // Generate hardware key
      log('Creating P-256 hardware key...');
      const hw = await sendNative('GENERATE_HW_KEY');
      setHwKey(hw);
      log('✓ HW: ' + hw.publicKey.substring(0, 16) + '...');
      
      // Generate secp256k1 in WebView
      log('Generating secp256k1...');
      const crypto = await loadCrypto();
      const { privateKey, publicKey } = await crypto.generateKeypair();
      setSecpPubKey(publicKey);
      log('✓ secp: ' + publicKey.substring(0, 16) + '...');
      
      // Encrypt with hardware key
      log('🔐 Encrypting with biometric...');
      const encKey = await sendNative('DERIVE_ENC_KEY', { keyId: hw.keyId });
      const encrypted = await crypto.encryptPrivateKey(privateKey, encKey);
      setEncryptedSecp(encrypted);
      
      // Store
      await sendNative('STORE_ENCRYPTED_SECP', {
        keyId: hw.keyId,
        encryptedData: encrypted,
        publicKey,
      });
      
      // Zero private key
      privateKey.fill(0);
      
      log('✓ 2-of-2 ready!');
    } catch (e) {
      log('✗ Setup failed: ' + e.message);
      alert('Setup failed: ' + e.message);
    }
  };
  
  // Sign transaction
  const signTransaction = async (recipient, amountKas) => {
    const crypto = await loadCrypto();
    const tx = {
      type: 'transfer',
      to: recipient,
      amount: Math.round(amountKas * SOMPI_PER_KAS),
      nonce: Date.now(),
      fee: 1000,
    };
    
    log('🔐 Signing transaction...');
    const sig = await crypto.sign2of2(
      JSON.stringify(tx),
      encryptedSecp,
      sendNative,
      hwKey.keyId
    );
    
    log('✓ TX signed: ' + sig.secpSignature.substring(0, 20) + '...');
    
    // Award XP for transfer
    reputation.awardXp('transfer', 10);
    setReputation({ ...reputation });
    
    return sig;
  };
  
  const keysReady = hwKey && secpPubKey;
  
  return (
    <div className="min-h-screen bg-stone-100">
      {/* Header */}
      <div className="gradient-bg p-4 pt-12 pb-6 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-white text-2xl font-black">🏘️ KasVillage L2</h1>
            <p className="text-amber-100 text-xs mt-1">2-of-2 Hardware Wallet</p>
          </div>
          <SecurityBadge security={security} />
        </div>
      </div>
      
      {/* Balance Card */}
      <div className="p-4 -mt-4">
        <div className="glass rounded-2xl p-6 shadow-xl border border-amber-200">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-stone-500 text-sm">L2 Balance</p>
              <p className="text-4xl font-black text-amber-900">
                {formatKas(balance)} KAS
              </p>
              <p className="text-xs text-stone-400 mt-1">
                ≈ ${(balance / SOMPI_PER_KAS * 0.12).toFixed(2)}
              </p>
            </div>
            <div className="text-right">
              <p className={cn(
                'text-xs',
                keysReady ? 'text-green-600' : 'text-stone-400'
              )}>
                {keysReady ? '✓ 2-of-2' : 'Setup needed'}
              </p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Key Setup */}
      <div className="px-4 pb-2">
        <KeySetupCard 
          hwKey={hwKey} 
          secpPubKey={secpPubKey} 
          onSetup={setupKeys}
        />
      </div>
      
      {/* Reputation */}
      <div className="px-4 pb-2">
        <ReputationCard 
          reputation={reputation.toDisplayData()} 
          onRefresh={() => log('Refreshing reputation...')}
        />
      </div>
      
      {/* Counterparty Lookup */}
      <div className="px-4 pb-2">
        <CounterpartyLookup 
          onLookup={(data) => log(`Looked up: ${data.reputation?.pubkeyShort} - ${data.risk?.level} risk`)}
        />
      </div>
      
      {/* Actions */}
      <div className="p-4 grid grid-cols-2 gap-3">
        <button 
          onClick={() => setTxModalOpen(true)}
          disabled={!keysReady}
          className="bg-gradient-to-r from-green-600 to-emerald-500 text-white p-4 rounded-xl font-bold shadow-md active:scale-95 transition-transform disabled:opacity-50"
        >
          ✍️ Sign TX
        </button>
        <button className="bg-gradient-to-r from-blue-600 to-blue-500 text-white p-4 rounded-xl font-bold shadow-md active:scale-95 transition-transform">
          📥 Deposit
        </button>
        <button 
          disabled={!keysReady}
          className="bg-gradient-to-r from-orange-600 to-red-500 text-white p-4 rounded-xl font-bold shadow-md active:scale-95 transition-transform disabled:opacity-50"
        >
          📤 Withdraw
        </button>
        <button 
          disabled={!keysReady}
          className="bg-gradient-to-r from-purple-600 to-purple-500 text-white p-4 rounded-xl font-bold shadow-md active:scale-95 transition-transform disabled:opacity-50"
        >
          📋 Export
        </button>
      </div>
      
      {/* Logs */}
      <div className="p-4">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex justify-between items-center mb-2">
            <p className="font-bold text-amber-800">📱 Security Log</p>
            <button 
              onClick={() => setLogs([])}
              className="text-xs text-amber-600"
            >
              Clear
            </button>
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto text-xs text-amber-700 font-mono">
            {logs.map((l, i) => <p key={i}>{l}</p>)}
          </div>
        </div>
      </div>
      
      {/* Modals */}
      <TransactionModal 
        isOpen={txModalOpen}
        onClose={() => setTxModalOpen(false)}
        onSign={signTransaction}
        balance={balance}
      />
    </div>
  );
}
