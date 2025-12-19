import React, { createContext, useContext, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Search, Wallet, QrCode, X, Zap, 
  ShieldCheck, AlertTriangle, User, Lock, Activity,
  Store, Mail, Link, MapPin, CloudSun, CloudDrizzle, Sun, 
  Settings, Users, ShoppingBag, CheckCircle, ArrowRight, Code, Clock, Globe, ScanFace, Smartphone, FileText, Scale, HeartHandshake, ExternalLink,
  Server, Layout, Save, PlayCircle,
  Timer, Wifi, WifiOff, Shield, Database, RefreshCw, AlertOctagon, Hourglass, Ban, Gavel
} from "lucide-react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import Countdown from "react-countdown";

// --- 1. UTILITIES & CONFIGURATION ---

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// Simulated API/Crypto Layer
const API_BASE = typeof window !== 'undefined' && window.KASVILLAGE_API_URL 
  ? window.KASVILLAGE_API_URL 
  : 'http://localhost:8080';

const api = {
  getHealth: async () => ({
    health_level: ["Safe", "Caution", "Hungry", "Critical"][Math.floor(Math.random() * 4)],
  }),
  getCoupons: async () => MOCK_COUPONS,
  register: async (pubkey) => ({ success: true, token: "jwt_mock_token" }),
  searchApartment: async (apt) => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return apt.length > 2 && apt.match(/^[0-9A-Za-z]+$/) ? { pubkey: `02apt${apt}pubkey...` } : null;
  },
  
  // FROST Communal Wallet - GET /api/frost/wallet
  getFrostWallet: async () => {
    try {
      const res = await fetch(`${API_BASE}/api/frost/wallet`);
      if (!res.ok) throw new Error('Failed to fetch FROST wallet');
      return await res.json();
    } catch (e) {
      // Fallback mock for development
      return {
        kaspa_address: 'kaspa1qy2kqr5y2hx8p3jw7qr9s8t6u4f5g3h2k4l5m6n7p8q9r',
        group_pubkey: '02' + '42'.repeat(32),
        balance_sompi: 100_000_000_000,
        balance_kas: 1000,
        withdrawal_count: 42,
      };
    }
  },
  
  // FROST Deposit - POST /api/frost/deposit
  frostDeposit: async (amountSompi) => {
    try {
      const res = await fetch(`${API_BASE}/api/frost/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount_sompi: amountSompi }),
      });
      return await res.json();
    } catch (e) {
      return { success: false, error: e.message };
    }
  },
  
  // Withdrawal with 24h timelock
  submitWithdrawal: async (userPubkey, amount, destAddress) => {
    await new Promise(resolve => setTimeout(resolve, 500));
    const now = Math.floor(Date.now() / 1000);
    return {
      success: true,
      request_id: now ^ (amount << 16),
      submitted_at: now,
      unlocks_at: now + WITHDRAWAL_DELAY_SECONDS,
      l1_block_submitted: 12345678,
      seconds_remaining: WITHDRAWAL_DELAY_SECONDS,
    };
  },
  
  // Circuit breaker status
  getCircuitBreakerStatus: async () => {
    await new Promise(resolve => setTimeout(resolve, 100));
    return {
      is_tripped: false,
      total_outflow_last_hour: 50000 * SOMPI_PER_KAS,
      threshold: CIRCUIT_BREAKER_DRAIN_THRESHOLD,
      cooldown_remaining: 0,
    };
  },
  
  // Consignment agreement - mutual release model
  createConsignment: async (consignerPubkey, sellerPubkey, itemDescription, itemValueKas, consignerSharePct) => {
    await new Promise(resolve => setTimeout(resolve, 400));
    const itemValueSompi = itemValueKas * SOMPI_PER_KAS;
    const consignerPayout = Math.floor(itemValueSompi * consignerSharePct / 100);
    return {
      success: true,
      agreement_id: Date.now(),
      state: CONSIGNMENT_STATES.NEGOTIATING,
      consigner_payout_sompi: consignerPayout,
      host_allocation_sompi: itemValueSompi - consignerPayout,
      xp_required: Math.max(100, Math.floor(itemValueKas * 0.05)),
    };
  },
  
  // Approve release (consigner or seller)
  approveConsignmentRelease: async (agreementId, party) => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return {
      success: true,
      agreement_id: agreementId,
      party_approved: party, // 'consigner' or 'seller'
      both_approved: false, // Would be true if this was the second approval
    };
  },
  
  // Mark as deadlocked (funds frozen forever)
  markConsignmentDeadlock: async (agreementId, reason) => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return {
      success: true,
      agreement_id: agreementId,
      state: CONSIGNMENT_STATES.DEADLOCKED,
      frozen_sompi: 0,
      seller_xp_lost: 0,
      reason,
    };
  },
  
  // Monthly Network Allocation (Was Fee)
  payMonthlyAllocation: async (userPubkey, xp) => {
    await new Promise(resolve => setTimeout(resolve, 600));
    const tier = getXPTierV2(xp);
    const feeSompi = tier.feeSompi;
    const now = Math.floor(Date.now() / 1000);
    return {
      success: true,
      tier: tier.name,
      fee_type: tier.feeType,
      fee_sompi: feeSompi,
      fee_kas: feeSompi / SOMPI_PER_KAS,
      paid_at: now,
      expires_at: now + 30 * 24 * 60 * 60,
    };
  },
};

// --- CONSTANTS ---
const KAS_USD_RATE = 0.12; // Current KAS/USD rate
const USD_TO_KAS = (usd) => Math.round(usd / KAS_USD_RATE);
const KAS_TO_USD = (kas) => (kas * KAS_USD_RATE).toFixed(2);
// "Fees" -> "Gas"
const SHOPPER_GAS_USD = 0.05;
const NODE_GAS_USD = 3.45; // Was MERCHANT_FEE_USD

const AKASH_DONATION_TARGET_AKT = 20; 
const CURRENT_DONATION_AKT = 15; 
const FLUX_DONATION_TARGET = 50;
const CURRENT_DONATION_FLUX = 12; 

const SOMPI_PER_KAS = 100_000_000;
const WITHDRAWAL_DELAY_SECONDS = 86_400;    
const REORG_SAFETY_CONFIRMATIONS = 100;     
const CIRCUIT_BREAKER_DRAIN_THRESHOLD = 1_000_000 * SOMPI_PER_KAS; 

const SHOPPER_MONTHLY_ALLOCATION_SOMPI = 250_000_000;      
const NODE_MONTHLY_ALLOCATION_SOMPI = 17_250_000_000;  

const CONSIGNMENT_STATES = {
  NEGOTIATING: 'Negotiating',
  ACTIVE: 'Active',
  SOLD_AWAITING_MUTUAL_RELEASE: 'SoldAwaitingMutualRelease',
  CONSIGNER_APPROVED: 'ConsignerApprovedRelease',
  SELLER_APPROVED: 'SellerApprovedRelease',
  COMPLETED: 'Completed',
  DEADLOCKED: 'Deadlocked',
  CANCELLED: 'Cancelled',
};

// Mutual release - no hold reasons needed anymore

// --- 2. MOCK DATA ---

const THEME_OPTIONS = [
    { id: "LightMarket", name: "LightMarket (Airy)", primary: "#F97316", secondary: "#fff", required_xp: 0 },
    { id: "WarmBazaar", name: "WarmBazaar (Consignment)", primary: "#C2410C", secondary: "#fef3c7", required_xp: 500 },
    { id: "CompactShop", name: "CompactShop (List View)", primary: "#FB923C", secondary: "#f5f5f4", required_xp: 1000 },
];

// Stores -> Host Nodes
const MOCK_HOST_NODES = [
  { host_id: 101, name: "RetroKicks", description: "Vintage sneakers & restoration. Apt 9B.", owner_tier: "Market Host", theme: "WarmBazaar", items: [{ id: 1, name: "Jordan 1 '85", price: 1500 }], xp: 850, reliability: 0.95, apartment: '9B' },
  { host_id: 102, name: "KasMiner Hardware", description: "ASICs and rigs for the village. Apt 6A.", owner_tier: "Trust Anchor", theme: "LightMarket", items: [{ id: 3, name: "KS0 Pro", price: 4500 }], xp: 12000, reliability: 0.99, apartment: '6A' }
];

const MOCK_COUPONS = [
  { coupon_id: 501, host_id: 101, code: "KICKS20", type: "PercentOff", value: 20, title: "20% Off Sneakers", item_name: "Sneakers", link: "https://retrokicks.com" },
  { coupon_id: 502, host_id: 102, code: "MINER100", type: "FixedAmount", value: 100, title: "100 KAS Off Rigs", item_name: "Rigs", link: "https://kasminer.com" }
];

const XP_TIERS = [
  { name: "Villager", threshold: 0 },
  { name: "Promoter", threshold: 100 },
  { name: "Custodian", threshold: 500 },
  { name: "Market Host", threshold: 1000 },
  { name: "Trust Anchor", threshold: 10000 },
];

const getXpInfo = (currentXp) => {
  let currentTier = XP_TIERS[0];
  let nextTier = XP_TIERS[XP_TIERS.length - 1];

  for (let i = 0; i < XP_TIERS.length; i++) {
    if (currentXp >= XP_TIERS[i].threshold) {
      currentTier = XP_TIERS[i];
    }
    if (currentXp < XP_TIERS[i].threshold) {
      nextTier = XP_TIERS[i];
      break;
    }
  }

  const progress = (currentXp - currentTier.threshold) / (nextTier.threshold - currentTier.threshold);

  return {
    currentTier: currentTier.name,
    nextTier: nextTier.name,
    progress: progress > 1 ? 1 : progress,
    remaining: nextTier.threshold - currentXp
  };
};

const getXPTierV2 = (xp) => {
  let tier;
  // feeType: Shopper -> User, Merchant -> Node
  if (xp < 100) tier = { name: 'Villager', threshold: 0, feeType: 'User' };
  else if (xp < 500) tier = { name: 'Promoter', threshold: 100, feeType: 'User' };
  else if (xp < 1000) tier = { name: 'Custodian', threshold: 500, feeType: 'User' };
  else if (xp < 10000) tier = { name: 'Market Host', threshold: 1000, feeType: 'Node' };
  else tier = { name: 'Trust Anchor', threshold: 10000, feeType: 'Node' };
  
  tier.feeSompi = tier.feeType === 'User' ? SHOPPER_MONTHLY_ALLOCATION_SOMPI : NODE_MONTHLY_ALLOCATION_SOMPI;
  tier.feeKas = tier.feeSompi / SOMPI_PER_KAS;
  return tier;
};

const formatTimeRemaining = (seconds) => {
  if (seconds <= 0) return 'Ready';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
};

// --- 3. CONTEXT & STATE MANAGEMENT ---

// Blocked jurisdictions (OFAC sanctions)
const BLOCKED_COUNTRIES = ['KP', 'IR', 'CU', 'SY', 'RU', 'BY', 'SD'];
const HIGH_VALUE_THRESHOLD_KAS = 10000;

// Restricted words - content filter for DApp submissions
const RESTRICTED_WORDS = [
  'gambl', 'casino', 'slot', 'poker', 'blackjack', 'roulette', 
  'bet', 'betting', 'wager', 'wagering', 'put up', 'stake wager',
  'lottery', 'raffle', 'jackpot', 'odds', 'bookmaker', 'sportsbook'
];

// Check if text contains restricted words
const containsRestrictedContent = (text) => {
  if (!text) return false;
  const lower = text.toLowerCase();
  return RESTRICTED_WORDS.some(word => lower.includes(word));
};

// Prohibited categories for DApps
const PROHIBITED_CATEGORIES = ['Gambling', 'Casino', 'Betting', 'Lottery'];

// ============================================================================
// TRADEFI ED SECTION - Treasury Bills & Bonds DCA Calculator
// ============================================================================

const TradeFiSection = ({ onClose }) => {
  // Multi-bond allocation state
  const [allocations, setAllocations] = useState({
    tbill_4week: 0,
    tbill_13week: 0,
    tbill_26week: 0,
    tbill_52week: 0,
    tnote_2year: 0,
    tnote_5year: 0,
    tnote_10year: 0,
    tbond_30year: 0,
    ibond: 0,
    eebond: 0,
  });
  const [totalMonthly, setTotalMonthly] = useState(500);
  const [showAiCombos, setShowAiCombos] = useState(false);
  
  // Historical average yields (approximate)
  const YIELDS = {
    tbill_4week: { name: '4-Week T-Bill', yield: 5.25, term: '4 weeks', payoutMonths: 1 },
    tbill_13week: { name: '13-Week T-Bill', yield: 5.20, term: '13 weeks', payoutMonths: 3 },
    tbill_26week: { name: '26-Week T-Bill', yield: 5.05, term: '26 weeks', payoutMonths: 6 },
    tbill_52week: { name: '52-Week T-Bill', yield: 4.75, term: '1 year', payoutMonths: 12 },
    tnote_2year: { name: '2-Year T-Note', yield: 4.45, term: '2 years', payoutMonths: 6 },
    tnote_5year: { name: '5-Year T-Note', yield: 4.25, term: '5 years', payoutMonths: 6 },
    tnote_10year: { name: '10-Year T-Note', yield: 4.40, term: '10 years', payoutMonths: 6 },
    tbond_30year: { name: '30-Year T-Bond', yield: 4.55, term: '30 years', payoutMonths: 6 },
    ibond: { name: 'I-Bond (Inflation)', yield: 5.27, term: '1+ year', payoutMonths: 12 },
    eebond: { name: 'EE-Bond', yield: 2.70, term: '20 years', payoutMonths: 240 },
  };
  
  const updateAllocation = (key, pct) => {
    setAllocations(prev => ({ ...prev, [key]: Math.max(0, Math.min(100, pct)) }));
  };
  
  const totalAllocation = Object.values(allocations).reduce((a, b) => a + b, 0);
  
  // Calculate earnings for each payout period
  const calculatePayouts = () => {
    const payouts = { month1: 0, month3: 0, month6: 0, month12: 0, total: 0 };
    let totalInvested = 0;
    
    Object.entries(allocations).forEach(([key, pct]) => {
      if (pct > 0) {
        const amount = (pct / 100) * totalMonthly * 12; // Annual investment
        const yieldRate = YIELDS[key].yield / 100;
        const earnings = amount * yieldRate;
        totalInvested += amount;
        
        // Distribute earnings based on payout schedule
        const payoutMonths = YIELDS[key].payoutMonths;
        if (payoutMonths <= 1) payouts.month1 += earnings / 12;
        else if (payoutMonths <= 3) payouts.month3 += earnings / 4;
        else if (payoutMonths <= 6) payouts.month6 += earnings / 2;
        else payouts.month12 += earnings;
        
        payouts.total += earnings;
      }
    });
    
    return { ...payouts, invested: totalInvested };
  };
  
  const payouts = calculatePayouts();
  
  // AI-generated experimental combinations
  const AI_COMBOS = [
    { name: "Ladder Strategy", allocation: "25% 4-week, 25% 13-week, 25% 26-week, 25% 52-week T-Bills", rationale: "Liquidity + yield balance" },
    { name: "Barbell Approach", allocation: "50% 4-week T-Bills, 50% 10-year T-Notes", rationale: "Short-term liquidity + long-term yield" },
    { name: "Income Focus", allocation: "40% I-Bonds, 30% 5-year T-Notes, 30% 10-year T-Notes", rationale: "Inflation protection + steady income" },
    { name: "Conservative Short", allocation: "70% 13-week T-Bills, 30% 2-year T-Notes", rationale: "Capital preservation with modest yield" },
    { name: "Growth Tilt", allocation: "20% 52-week T-Bills, 40% 5-year T-Notes, 40% 30-year T-Bonds", rationale: "Higher yield potential, longer duration risk" },
  ];

  return (
    <div className="fixed inset-0 bg-stone-900/95 backdrop-blur-md flex items-center justify-center p-4 z-50">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-gradient-to-b from-stone-50 to-blue-50 w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[95vh]"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-900 p-6 text-white">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-black flex items-center gap-3">
                <Scale size={28} className="text-blue-300"/> TradeFi Ed
              </h2>
              <p className="text-xs text-blue-200 mt-1">U.S. Treasury Bills & Bonds Explorer</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition">
              <X className="text-blue-300 hover:text-white"/>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          
          {/* Context Quote */}
          <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
            <p className="text-sm text-blue-800 italic">
              "However, most of U.S. Treasury debt is held not by individuals but by institutions: 
              mutual funds, banks, pensions, other government entities, and foreign investors."
            </p>
            <p className="text-xs text-blue-600 mt-2">
              Historically, household direct holdings of Treasuries have been a small fraction of total public debt — 
              only a slice of the overall bond market.
            </p>
          </div>
          
          {/* Bantu Wisdom */}
          <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
            <p className="text-sm text-amber-900 italic font-serif">
              "Umkhumbi omkhulu uqondiswa ucingo oluncane."
            </p>
            <p className="text-xs text-amber-700 mt-1">Umkhumbi omkhulu ulawulwa ngesikwele esincane (isiZulu)</p>
            <p className="text-xs text-amber-600 mt-1">— <em>othile obalulekile</em></p>
            <div className="border-t border-amber-200 mt-3 pt-3">
              <p className="text-sm text-amber-900 italic font-serif">
                "Ingabe ukuthenga nokuthengisa izibopho kungcono kunokuvota?"
              </p>
              <p className="text-xs text-amber-700 mt-1">Kungenzeka ukuthi ukuthenga nokuthengisa amabhondi kungcono kunokuvota? (isiZulu)</p>
              <p className="text-xs text-amber-600 mt-1">— <em>othile ofuna ukuba ngumuntu obalulekile</em></p>
            </div>
          </div>

          {/* Multi-Bond DCA Calculator */}
          <div className="p-5 bg-white rounded-2xl border border-stone-200 shadow-sm">
            <h3 className="font-black text-stone-800 mb-4 flex items-center gap-2">
              <Activity size={18}/> Multi-Bond DCA Calculator
            </h3>
            
            <div className="mb-4">
              <label className="text-xs font-bold text-stone-500 uppercase">Total Monthly Investment ($)</label>
              <input 
                type="number" 
                value={totalMonthly} 
                onChange={(e) => setTotalMonthly(Number(e.target.value))}
                className="w-full p-3 bg-stone-50 rounded-xl border border-stone-200 mt-1 text-lg font-bold"
                min={25}
              />
            </div>
            
            {/* Allocation Sliders */}
            <div className="space-y-3 mb-4">
              <p className="text-xs font-bold text-stone-500 uppercase">Allocation % (Total: {totalAllocation}%)</p>
              {totalAllocation !== 100 && (
                <p className="text-xs text-red-600">⚠️ Allocations should total 100%</p>
              )}
              
              <div className="grid grid-cols-2 gap-3 max-h-48 overflow-y-auto">
                {Object.entries(YIELDS).map(([key, val]) => (
                  <div key={key} className="flex items-center gap-2 p-2 bg-stone-50 rounded-lg">
                    <input 
                      type="number" 
                      value={allocations[key]} 
                      onChange={(e) => updateAllocation(key, Number(e.target.value))}
                      className="w-14 p-1 text-center border border-stone-200 rounded text-sm"
                      min={0} max={100}
                    />
                    <span className="text-[10px] text-stone-600 flex-1">{val.name} ({val.yield}%)</span>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Payout Schedule Results */}
            <div className="p-4 bg-green-50 rounded-xl border border-green-200">
              <p className="text-xs font-bold text-green-700 mb-3 uppercase">Estimated Annual Payouts</p>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="p-2 bg-white rounded-lg">
                  <p className="text-[10px] text-green-600">Monthly</p>
                  <p className="text-lg font-black text-green-800">${payouts.month1.toFixed(0)}</p>
                </div>
                <div className="p-2 bg-white rounded-lg">
                  <p className="text-[10px] text-green-600">Quarterly</p>
                  <p className="text-lg font-black text-green-800">${payouts.month3.toFixed(0)}</p>
                </div>
                <div className="p-2 bg-white rounded-lg">
                  <p className="text-[10px] text-green-600">6-Month</p>
                  <p className="text-lg font-black text-green-800">${payouts.month6.toFixed(0)}</p>
                </div>
                <div className="p-2 bg-white rounded-lg">
                  <p className="text-[10px] text-green-600">Annual</p>
                  <p className="text-lg font-black text-green-800">${payouts.month12.toFixed(0)}</p>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-green-200 grid grid-cols-2 gap-4 text-center">
                <div>
                  <p className="text-xs text-green-600">Total Invested/Year</p>
                  <p className="text-xl font-black text-green-800">${payouts.invested.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-green-600">Total Est. Earnings/Year</p>
                  <p className="text-xl font-black text-green-700">+${payouts.total.toFixed(0)}</p>
                </div>
              </div>
            </div>
            <p className="text-[10px] text-stone-400 mt-2 text-center">
              *Estimates based on current yields. Actual returns will vary. Not financial advice.
            </p>
          </div>

          {/* AI Experimental Combos */}
          <div className="p-5 bg-gradient-to-b from-purple-50 to-indigo-50 rounded-2xl border border-purple-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-black text-purple-800 flex items-center gap-2">
                <Zap size={18}/> Experimental AI Combinations
              </h3>
              <span className="text-[10px] bg-purple-200 text-purple-800 px-2 py-1 rounded-full font-bold">EDUCATIONAL ONLY</span>
            </div>
            
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl mb-4">
              <p className="text-xs text-red-800">
                <strong>⚠️ Important — Not Financial Advice:</strong> The algorithmic outputs below are for 
                <em> educational and illustrative purposes only</em>. They do not constitute investment advice. 
                Past performance does not indicate future results. <strong>Please consult a licensed financial advisor before making investment decisions.</strong>
              </p>
            </div>
            
            <button 
              onClick={() => setShowAiCombos(!showAiCombos)}
              className="w-full p-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold text-sm mb-4 transition"
            >
              {showAiCombos ? 'Hide AI Combinations' : 'Show Experimental AI Combinations'}
            </button>
            
            {showAiCombos && (
              <div className="space-y-3">
                {AI_COMBOS.map((combo, i) => (
                  <div key={i} className="p-3 bg-white rounded-xl border border-purple-100">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-purple-800 text-sm">{combo.name}</span>
                      <button 
                        onClick={() => navigator.clipboard.writeText(combo.allocation)}
                        className="text-[10px] text-purple-600 hover:text-purple-800 underline"
                      >
                        Copy
                      </button>
                    </div>
                    <p className="text-xs text-stone-600 font-mono bg-stone-50 p-2 rounded">{combo.allocation}</p>
                    <p className="text-[10px] text-stone-500 mt-1 italic">{combo.rationale}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pros & Cons Comparison */}
          <div className="p-5 bg-white rounded-2xl border border-stone-200">
            <h3 className="font-black text-stone-800 mb-4">T-Bills/Bonds vs Savings Account</h3>
            
            <div className="grid grid-cols-2 gap-4">
              {/* T-Bills/Bonds */}
              <div className="space-y-3">
                <h4 className="font-bold text-blue-800 text-sm border-b border-blue-200 pb-1">Treasury Bills & Bonds</h4>
                <div className="p-3 bg-green-50 rounded-xl">
                  <p className="text-xs font-bold text-green-700 mb-1">✓ Pros</p>
                  <ul className="text-[10px] text-green-600 space-y-1">
                    <li>• Higher yields (4-5%+)</li>
                    <li>• Backed by U.S. government</li>
                    <li>• State tax exempt</li>
                    <li>• Predictable returns</li>
                    <li>• No market volatility (if held to maturity)</li>
                  </ul>
                </div>
                <div className="p-3 bg-red-50 rounded-xl">
                  <p className="text-xs font-bold text-red-700 mb-1">✗ Cons</p>
                  <ul className="text-[10px] text-red-600 space-y-1">
                    <li>• Less liquid (lock-up periods)</li>
                    <li>• Minimum purchase amounts</li>
                    <li>• Interest rate risk if sold early</li>
                    <li>• I-Bonds: 12mo minimum hold</li>
                    <li>• More complex to manage</li>
                  </ul>
                </div>
              </div>
              
              {/* Savings Account */}
              <div className="space-y-3">
                <h4 className="font-bold text-amber-800 text-sm border-b border-amber-200 pb-1">High-Yield Savings Account</h4>
                <div className="p-3 bg-green-50 rounded-xl">
                  <p className="text-xs font-bold text-green-700 mb-1">✓ Pros</p>
                  <ul className="text-[10px] text-green-600 space-y-1">
                    <li>• Fully liquid (instant access)</li>
                    <li>• FDIC insured ($250k)</li>
                    <li>• No minimum hold time</li>
                    <li>• Simple to manage</li>
                    <li>• Competitive rates (4-5%)</li>
                  </ul>
                </div>
                <div className="p-3 bg-red-50 rounded-xl">
                  <p className="text-xs font-bold text-red-700 mb-1">✗ Cons</p>
                  <ul className="text-[10px] text-red-600 space-y-1">
                    <li>• Rates can drop anytime</li>
                    <li>• Subject to state taxes</li>
                    <li>• May have withdrawal limits</li>
                    <li>• Inflation can erode value</li>
                    <li>• Teaser rates may expire</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Can You Sell? */}
          <div className="p-5 bg-stone-50 rounded-2xl border border-stone-200">
            <h3 className="font-black text-stone-800 mb-3">❓ Can You Sell Treasury Bonds?</h3>
            <div className="space-y-3 text-xs">
              <div className="p-3 bg-white rounded-xl border-l-4 border-blue-500">
                <p className="font-bold text-stone-800">T-Bills, T-Notes, T-Bonds</p>
                <p className="text-stone-600">✓ Yes, but not inside TreasuryDirect. Transfer to a brokerage (Fidelity, Schwab, etc.) then sell on market.</p>
              </div>
              <div className="p-3 bg-white rounded-xl border-l-4 border-amber-500">
                <p className="font-bold text-stone-800">I-Bonds & EE-Bonds</p>
                <p className="text-stone-600">✗ Cannot sell on market. Redeem (cash out) through TreasuryDirect only.</p>
                <p className="text-stone-500 mt-1">• Must hold at least 12 months</p>
                <p className="text-stone-500">• If redeemed before 5 years → lose last 3 months of interest</p>
              </div>
            </div>
          </div>

          {/* Final Disclaimer */}
          <div className="p-4 bg-red-50 rounded-xl border border-red-200">
            <p className="text-xs text-red-800 text-center">
              <strong>This tool is experimental and for informational purposes only. It is not financial advice.</strong><br/>
              Consult a licensed financial professional before acting on any information presented here.
            </p>
          </div>

        </div>

        {/* Footer - BIG BUY BUTTON */}
        <div className="p-6 bg-gradient-to-r from-blue-600 to-indigo-600 border-t border-blue-500">
          <a 
            href="https://www.treasurydirect.gov" 
            target="_blank" 
            rel="noopener noreferrer"
            className="block w-full p-5 bg-white hover:bg-blue-50 rounded-2xl text-center transition shadow-lg"
          >
            <p className="text-2xl font-black text-blue-800 flex items-center justify-center gap-3">
              <Scale size={32}/> TreasuryDirect.gov — BUY <ExternalLink size={24}/>
            </p>
            <p className="text-sm text-blue-600 mt-1">Official U.S. Treasury Bond Marketplace</p>
          </a>
        </div>
      </motion.div>
    </div>
  );
};

const GlobalContext = createContext();

export const AppProvider = ({ children }) => {
  const [user, setUser] = useState({ 
    pubkey: "02a...f4e", 
    // Added verified L1 address for withdrawal autofill
    kaspaAddress: "kaspa:qr2w8sqj4vwpj8yz5fkly2tzafwkz8gn8k6m5xevpt", 
    apartment: "320", 
    balance: 2450.50, 
    xp: 20000, 
    tier: "Trust Anchor", 
    reliability: 0.92, 
    riskFactor: 0.35, 
    kasPutUp: 5000, 
    // Fees Earned -> Network Allocation
    networkAllocation: 450.25,
    isValidator: true,
    validatorEpochProgress: 0.75,
    validatorSlashingRate: 0.02,
  });
  const [paymentType, setPaymentType] = useState("Direct"); 
  const [cart, setCart] = useState({ item: null, coupon: null });
  const [systemHealth, setSystemHealth] = useState("Safe");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [paidMonthlyFee, setPaidMonthlyFee] = useState(false); 
  
  const [dappManifest, setDappManifest] = useState(null); 
  
  const [securityStep, setSecurityStep] = useState(0); 
  const [needsChallenge, setNeedsChallenge] = useState(false); 
  const [showTransactionSigner, setShowTransactionSigner] = useState(false);

  const [pendingWithdrawals, setPendingWithdrawals] = useState([]);
  const [circuitBreakerStatus, setCircuitBreakerStatus] = useState({ is_tripped: false, total_outflow_last_hour: 0 });
  const [wsConnected, setWsConnected] = useState(false);
  const [activeConsignments, setActiveConsignments] = useState([]);
  
  // Clickwrap agreement state
  const [hasSignedClickwrap, setHasSignedClickwrap] = useState(false);
  const [showClickwrap, setShowClickwrap] = useState(false);
  const [geoBlocked, setGeoBlocked] = useState(false);
  const [userCountry, setUserCountry] = useState(null);
  
  // Verified L1 wallet from onboarding (sanctions-checked)
  const [verifiedL1Wallet, setVerifiedL1Wallet] = useState(() => {
    const stored = localStorage.getItem('verified_l1_wallet');
    return stored ? JSON.parse(stored) : null;
  });

  // Geo-blocking check on mount
  useEffect(() => {
    const checkGeoBlock = async () => {
      try {
        // In production: use IP geolocation API
        // Mock: check localStorage or default to allowed
        const mockCountry = localStorage.getItem('mock_country') || 'US';
        setUserCountry(mockCountry);
        if (BLOCKED_COUNTRIES.includes(mockCountry)) {
          setGeoBlocked(true);
        }
      } catch (e) {
        console.error('Geo check failed:', e);
      }
    };
    checkGeoBlock();
  }, []);

  const login = async () => {
    // Check geo-blocking first
    if (geoBlocked) {
      alert(`Access denied: Your jurisdiction (${userCountry}) is restricted due to sanctions compliance.`);
      return;
    }
    
    // Show clickwrap if not signed
    if (!hasSignedClickwrap) {
      setShowClickwrap(true);
      return;
    }
    
    setSecurityStep(1); 
    setTimeout(() => {
      setSecurityStep(2); 
      setTimeout(async () => {
        const pubkey = "02..." + Math.random().toString(16).substr(2);
        await api.register(pubkey);
        // Ensure mock user has address on login
        setUser(prev => ({ 
            ...prev, 
            pubkey,
            kaspaAddress: `kaspa:qr${pubkey.substring(2, 30)}...verified`
        }));
        setSecurityStep(0); 
        setIsAuthenticated(true);
        setNeedsChallenge(true); 
      }, 1500); 
    }, 1500); 
  };
  
  // Handle clickwrap signature (now includes optional wallet from onboarding)
  const signClickwrap = (signatureData) => {
    // In production: store signature on-chain
    console.log('Clickwrap signed:', signatureData);
    localStorage.setItem('clickwrap_signature', JSON.stringify({
      ...signatureData,
      timestamp: Date.now(),
      pubkey: user.pubkey,
    }));
    
    // Store verified wallet if provided
    if (signatureData.verifiedWallet) {
      setVerifiedL1Wallet(signatureData.verifiedWallet);
      // Update user's kaspaAddress with the verified address
      setUser(prev => ({
        ...prev,
        kaspaAddress: signatureData.verifiedWallet.walletAddress,
      }));
    }
    
    setHasSignedClickwrap(true);
    setShowClickwrap(false);
    // Continue login flow
    login();
  };

  useEffect(() => {
    const interval = setInterval(() => {
      api.getHealth().then(data => setSystemHealth(data.health_level));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const checkCircuitBreaker = async () => {
      const status = await api.getCircuitBreakerStatus();
      setCircuitBreakerStatus(status);
    };
    checkCircuitBreaker();
    const interval = setInterval(checkCircuitBreaker, 30000);
    return () => clearInterval(interval);
  }, []);

  const submitWithdrawal = async (amount, destAddress) => {
    if (circuitBreakerStatus.is_tripped) {
      alert('Protocol halted: Circuit breaker active. Please try later.');
      return null;
    }
    const result = await api.submitWithdrawal(user.pubkey, amount, destAddress);
    if (result.success) {
      setPendingWithdrawals(prev => [...prev, result]);
    }
    return result;
  };

  const createConsignment = async (itemDescription, itemValueKas, consignerSharePct) => {
    const result = await api.createConsignment(
      user.pubkey, 
      '03...consigner', 
      itemDescription,
      itemValueKas,
      consignerSharePct
    );
    if (result.success) {
      setActiveConsignments(prev => [...prev, result]);
    }
    return result;
  };

  return (
    <GlobalContext.Provider value={{ 
      user, setUser, login, isAuthenticated, systemHealth, setPaymentType, cart, setCart, 
      needsChallenge, setNeedsChallenge, securityStep, showTransactionSigner, setShowTransactionSigner, 
      paidMonthlyFee, setPaidMonthlyFee, dappManifest, setDappManifest,
      pendingWithdrawals, circuitBreakerStatus, wsConnected,
      activeConsignments, submitWithdrawal, createConsignment,
      // Clickwrap & geo-blocking
      hasSignedClickwrap, showClickwrap, setShowClickwrap, signClickwrap,
      geoBlocked, userCountry, BLOCKED_COUNTRIES, HIGH_VALUE_THRESHOLD_KAS,
      // Verified L1 wallet from onboarding
      verifiedL1Wallet, setVerifiedL1Wallet
    }}>
      {children}
    </GlobalContext.Provider>
  );
};

// --- 4. CORE UI COMPONENTS ---

const Card = ({ className, children, ...props }) => (
  <div className={cn("rounded-2xl border border-amber-200 bg-white text-amber-900 shadow-sm", className)} {...props}>
    {children}
  </div>
);

const Button = ({ className, variant = "default", ...props }) => {
  const variants = {
    default: "bg-orange-600 text-white hover:bg-orange-700 shadow-md",
    outline: "border border-amber-300 bg-white hover:bg-amber-100 text-amber-900",
    secondary: "bg-red-800 text-amber-50 hover:bg-red-900 shadow-md",
    pay_direct: "bg-orange-600 text-white",
    pay_mutual: "bg-red-800 text-white",
    trust_link: "bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100"
  };
  return <button className={cn("inline-flex items-center justify-center rounded-xl px-4 py-3 text-sm font-bold transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed", variants[variant], className)} {...props} />;
};

const Badge = ({ tier }) => {
  const colors = {
    Villager: "bg-yellow-100 text-yellow-800",
    Promoter: "bg-amber-100 text-amber-800",
    "Market Host": "bg-orange-100 text-orange-700",
    Custodian: "bg-red-100 text-red-800",
    "Trust Anchor": "bg-red-100 text-red-800" 
  };
  return <span className={cn("text-[10px] px-2 py-1 rounded-md uppercase tracking-wide font-bold", colors[tier] || colors.Villager)}>{tier}</span>;
};

// --- 5. SAFETY METER ---

const SafetyMeter = () => {
  const { systemHealth } = useContext(GlobalContext);
  
  const statusConfig = {
    Safe: { color: "bg-green-700", text: "Clear Skies", icon: Sun, desc: "Protocol Stable" },
    Caution: { color: "bg-yellow-600", text: "Cloudy", icon: AlertTriangle, desc: "Elevated Transaction Flow" },
    Hungry: { color: "bg-red-700", text: "Streets Hungry", icon: Activity, desc: "Slower Protocol Response" },
    Critical: { color: "bg-red-900", text: "HALTED", icon: Lock, desc: "Automated Security Pause" },
  };

  const config = statusConfig[systemHealth] || statusConfig.Safe;
  const Icon = config.icon;

  return (
    <div className="p-1 rounded-full bg-white border border-amber-300 shadow-lg flex items-center gap-3 pr-4">
      <div className="flex-1">
        <div className="text-xs font-bold text-amber-800 uppercase tracking-wider">Street Forecast</div>
        <div className={cn("text-xs font-bold uppercase tracking-wider", config.color.replace("bg-", "text-"))}>
          {config.text}
        </div>
      </div>
      <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-white shadow-sm", config.color)}>
        <Icon size={20} />
      </div>
    </div>
  );
};

// --- 6. SECURITY MODALS ---

const SecurityCheckModal = () => {
  const { securityStep } = useContext(GlobalContext);
  if (securityStep === 0) return null;

  return (
    <div className="fixed inset-0 bg-stone-900/90 backdrop-blur-md flex items-center justify-center p-4 z-[90]">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }} 
        animate={{ scale: 1, opacity: 1 }} 
        className="bg-white w-full max-w-sm rounded-3xl p-8 shadow-2xl border-t-4 border-orange-600 text-center"
      >
        <div className="mb-6 flex justify-center">
           {securityStep === 1 ? (
             <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center animate-pulse"><Smartphone size={40} className="text-orange-600"/></div>
           ) : (
             <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center animate-pulse"><Globe size={40} className="text-red-800"/></div>
           )}
        </div>
        <h3 className="text-2xl font-black text-stone-800 mb-2">Security Handshake</h3>
        <div className="space-y-4">
           <div className={cn("flex items-center gap-3 p-3 rounded-xl border transition-all", securityStep >= 1 ? "bg-orange-50 border-orange-200" : "bg-stone-50 border-stone-100 opacity-50")}>
              {securityStep > 1 ? <CheckCircle size={20} className="text-green-600"/> : <ScanFace size={20} className="text-orange-600 animate-spin"/>}
              <span className="font-bold text-sm text-stone-700">Verifying Device Fingerprint...</span>
           </div>
           <div className={cn("flex items-center gap-3 p-3 rounded-xl border transition-all", securityStep >= 2 ? "bg-red-50 border-red-200" : "bg-stone-50 border-stone-100 opacity-50")}>
              {securityStep > 2 ? <CheckCircle size={20} className="text-green-600"/> : (securityStep === 2 ? <Activity size={20} className="text-red-600 animate-pulse"/> : <Lock size={20} className="text-stone-400"/>)}
              <span className="font-bold text-sm text-stone-700">Scanning Global Sanctions...</span>
           </div>
        </div>
        <p className="mt-6 text-xs text-stone-400">Connecting to Layer 1 (Kaspa) Settlement Layer</p>
      </motion.div>
    </div>
  );
};

const IdentityModal = ({ onClose }) => {
  const { setNeedsChallenge } = useContext(GlobalContext);
  const [step, setStep] = useState(0); 
  const [timer] = useState(Date.now() + 4500); 

  const handleAnswer = () => { 
    setStep(2); 
    setNeedsChallenge(false);
    setTimeout(onClose, 1500); 
  };

  return (
    <div className="fixed inset-0 bg-amber-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-2xl border-t-4 border-red-800">
        {step === 0 && (
          <div className="text-center space-y-4">
            <h3 className="text-xl font-bold text-red-800">Identity Verification</h3>
            <p className="text-sm text-amber-700">Answer must be submitted within the strict **2s-4.5s** window for anti-bot proof.</p>
            <Button onClick={() => setStep(1)} className="w-full">Start Challenge</Button>
          </div>
        )}
        {step === 1 && (
          <div className="space-y-4">
             <div className="flex justify-between items-center text-xs font-bold text-red-800 uppercase">
               <span>Time Lock Active</span>
               <Countdown date={timer} renderer={({ total, seconds, milliseconds }) => <span>{seconds}.{milliseconds / 100}s</span>} />
             </div>
             <div className="w-full bg-amber-100 h-1 rounded-full">
               <motion.div initial={{ width: "100%" }} animate={{ width: "0%" }} transition={{ duration: 4.5 }} className="h-full bg-red-800" />
             </div>
             <h4 className="font-bold text-lg">If your life were a story, what chapter are you in?</h4>
             <input type="text" placeholder="Start typing only when timer starts..." className="w-full p-3 rounded-xl border border-amber-300 bg-amber-50 outline-none" />
             <Button onClick={handleAnswer} className="w-full">Submit Answer</Button>
          </div>
        )}
        {step === 2 && (
           <div className="text-center py-8">
             <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-16 h-16 bg-green-100 text-green-700 rounded-full flex items-center justify-center mx-auto mb-4"><ShieldCheck /></motion.div>
             <h3 className="lg:text-xl font-bold text-green-700">Identity Passed!</h3>
           </div>
        )}
      </motion.div>
    </div>
  );
};

// --- 7. TRANSACTION SIGNER ---

const ApartmentSearch = ({ onApartmentFound }) => {
  const [aptInput, setAptInput] = useState("");
  const [aptPubkey, setAptPubkey] = useState(null);

  useEffect(() => {
    if (aptInput.length > 2) {
      api.searchApartment(aptInput).then(data => {
        if (data) {
          setAptPubkey(data.pubkey);
          onApartmentFound(data.pubkey);
        } else {
          setAptPubkey(null);
          onApartmentFound(null);
        }
      });
    } else {
      setAptPubkey(null);
      onApartmentFound(null);
    }
  }, [aptInput]);

  return (
    <div className="space-y-3 pb-4 border-b border-amber-200 mb-6">
      <div className="flex items-center gap-2">
         <MapPin className="text-red-800" size={20} />
         <span className="font-bold text-amber-900">Transfer by Apt. Number</span>
      </div>
      <div className="flex gap-2">
        <input 
          type="text" 
          placeholder="Search Apartment Number (e.g., 9B)..." 
          value={aptInput}
          onChange={(e) => setAptInput(e.target.value)}
          className="w-full p-3 rounded-xl border border-amber-300 bg-white outline-none focus:ring-2 focus:ring-orange-600"
        />
      </div>
      {aptPubkey && (
        <div className="p-3 bg-yellow-100 text-amber-800 text-xs rounded-xl border border-yellow-300">
          <p>Apt. <span className="font-bold">{aptInput}</span> resolved to L2 Address:</p>
          <p className="font-mono mt-1 break-all">{aptPubkey.substring(0, 10)}...{aptPubkey.substring(aptPubkey.length - 10)}</p>
        </div>
      )}
    </div>
  );
};

const TransactionSigner = ({ onClose, onOpenMutualPay }) => {
  const { user, cart, paymentType, setPaymentType } = useContext(GlobalContext);
  const [step, setStep] = useState("select_type"); // New: start with type selection
  const [mutualState, setMutualState] = useState(0); 
  const [targetPubkey, setTargetPubkey] = useState(null);
  const [userAgreed, setUserAgreed] = useState(false);
  const [showTypeInfo, setShowTypeInfo] = useState(null);

  const itemPrice = cart.item ? cart.item.price : 0;
  const discount = cart.coupon ? (cart.coupon.type === "PercentOff" ? (itemPrice * cart.coupon.value / 100) : cart.coupon.value) : 0;
  const finalAmount = Math.max(0, itemPrice - discount);

  const handleBroadcast = () => {
    if (!userAgreed) { alert("You must acknowledge that this is a P2P transaction."); return; }
    if (!targetPubkey && !cart.item) { alert("Please select item or search apartment."); return; }
    setStep("processing"); 
    setTimeout(() => setStep("complete"), 2000);
  };

  const selectPaymentType = (type) => {
    setPaymentType(type);
    if (type === "Mutual") {
      // Close this modal and open MutualPaymentFlow
      onClose();
      if (onOpenMutualPay) onOpenMutualPay();
    } else {
      setStep("input");
    }
  };

  return (
    <div className="fixed inset-0 bg-stone-900/80 backdrop-blur-sm flex items-end md:items-center justify-center z-50">
      <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} className="bg-white w-full max-w-md md:rounded-3xl rounded-t-3xl p-6 shadow-2xl h-[85vh] flex flex-col overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
             <h3 className="text-xl font-black text-stone-800">Open Contract</h3>
             <p className="text-[10px] text-stone-400">Choose Payment Type</p>
          </div>
          <button onClick={onClose} className="p-2 bg-stone-100 rounded-full"><X size={20}/></button>
        </div>

        {/* STEP: Payment Type Selection */}
        {step === "select_type" && (
          <div className="flex-1 flex flex-col">
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
               <span className="font-bold block mb-1">📋 Select Contract Type</span>
               Choose how you want to structure this transaction. Each type has different security guarantees and fee structures.
            </div>

            {/* Direct Pay Option */}
            <div 
              className={cn(
                "p-4 rounded-2xl border-2 mb-4 cursor-pointer transition-all hover:shadow-lg",
                showTypeInfo === 'direct' ? "border-orange-500 bg-orange-50" : "border-stone-200 bg-white"
              )}
              onClick={() => setShowTypeInfo(showTypeInfo === 'direct' ? null : 'direct')}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
                    <Zap className="text-orange-600" size={24} />
                  </div>
                  <div>
                    <h4 className="font-black text-lg text-stone-800">Direct Pay</h4>
                    <p className="text-xs text-stone-500">One-way transfer • Instant</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-green-600">No Tx Fee</span>
                  <p className="text-[10px] text-stone-400">Subscription</p>
                </div>
              </div>
              
              <AnimatePresence>
                {showTypeInfo === 'direct' && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }} 
                    animate={{ height: 'auto', opacity: 1 }} 
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="pt-3 border-t border-orange-200 mt-3 space-y-3">
                      <div className="p-3 bg-green-50 rounded-xl border border-green-200">
                        <h5 className="font-bold text-green-800 text-sm mb-1">✓ Benefits</h5>
                        <ul className="text-xs text-green-700 space-y-1">
                          <li>• <strong>Fastest settlement</strong> - Single signature, instant broadcast</li>
                          <li>• <strong>No per-tx fees</strong> - Covered by monthly subscription</li>
                          <li>• <strong>Simplest flow</strong> - No counterparty coordination needed</li>
                          <li>• <strong>Best for trusted parties</strong> - Friends, family, repeat vendors</li>
                        </ul>
                      </div>
                      
                      <div className="p-3 bg-red-50 rounded-xl border border-red-200">
                        <h5 className="font-bold text-red-800 text-sm mb-1">⚠ Risks</h5>
                        <ul className="text-xs text-red-700 space-y-1">
                          <li>• <strong>Irreversible</strong> - Cannot be undone once broadcast</li>
                          <li>• <strong>No escrow</strong> - Funds transfer immediately</li>
                          <li>• <strong>Trust required</strong> - You rely on counterparty to deliver</li>
                          <li>• <strong>No dispute resolution</strong> - Protocol cannot intervene</li>
                        </ul>
                      </div>
                      
                      <div className="p-3 bg-stone-100 rounded-xl">
                        <p className="text-xs text-stone-600">
                          <strong>Best for:</strong> Tipping, donations, paying known vendors, splitting bills with friends, 
                          recurring payments to trusted merchants.
                        </p>
                      </div>
                      
                      <Button 
                        onClick={() => selectPaymentType("Direct")} 
                        className="w-full h-12 bg-orange-500 hover:bg-orange-400"
                      >
                        <Zap size={18} className="mr-2" /> Select Direct Pay
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Mutual Pay Option */}
            <div 
              className={cn(
                "p-4 rounded-2xl border-2 mb-4 cursor-pointer transition-all hover:shadow-lg",
                showTypeInfo === 'mutual' ? "border-indigo-500 bg-indigo-50" : "border-stone-200 bg-white"
              )}
              onClick={() => setShowTypeInfo(showTypeInfo === 'mutual' ? null : 'mutual')}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center">
                    <HeartHandshake className="text-indigo-600" size={24} />
                  </div>
                  <div>
                    <h4 className="font-black text-lg text-stone-800">Mutual Pay</h4>
                    <p className="text-xs text-stone-500">2-round agreement • Protected</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-green-600">No Tx Fee</span>
                  <p className="text-[10px] text-stone-400">Subscription</p>
                </div>
              </div>
              
              <AnimatePresence>
                {showTypeInfo === 'mutual' && (
                  <motion.div 
                    initial={{ height: 0, opacity: 0 }} 
                    animate={{ height: 'auto', opacity: 1 }} 
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="pt-3 border-t border-indigo-200 mt-3 space-y-3">
                      <div className="p-3 bg-green-50 rounded-xl border border-green-200">
                        <h5 className="font-bold text-green-800 text-sm mb-1">✓ Benefits</h5>
                        <ul className="text-xs text-green-700 space-y-1">
                          <li>• <strong>Both parties commit</strong> - Funds locked until both agree</li>
                          <li>• <strong>Atomic swap</strong> - Either both complete or neither does</li>
                          <li>• <strong>Trustless</strong> - No need to trust counterparty upfront</li>
                          <li>• <strong>Dispute deterrence</strong> - Both have skin in the game</li>
                          <li>• <strong>Best for strangers</strong> - First-time transactions</li>
                        </ul>
                      </div>
                      
                      <div className="p-3 bg-red-50 rounded-xl border border-red-200">
                        <h5 className="font-bold text-red-800 text-sm mb-1">⚠ Risks</h5>
                        <ul className="text-xs text-red-700 space-y-1">
                          <li>• <strong>Coordination required</strong> - Both parties must complete</li>
                          <li>• <strong>Locked funds</strong> - No FROST unlock if abandoned</li>
                          <li>• <strong>Slower</strong> - Requires 2 rounds of signatures</li>
                          <li>• <strong>Expiry risk</strong> - Contract times out if not completed</li>
                        </ul>
                      </div>
                      
                      <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
                        <h5 className="font-bold text-amber-800 text-sm mb-1">📋 How It Works</h5>
                        <ol className="text-xs text-amber-700 space-y-1">
                          <li><strong>Round 1:</strong> Both parties accept terms & voluntarily lock funds</li>
                          <li><strong>Round 2:</strong> Buyer sends payment → Seller sends value</li>
                          <li><strong>Complete:</strong> Both transfers execute atomically</li>
                        </ol>
                      </div>
                      
                      <div className="p-3 bg-stone-100 rounded-xl">
                        <p className="text-xs text-stone-600">
                          <strong>Best for:</strong> High-value purchases, trading with strangers, consignment deals,
                          cross-border commerce, NFT/digital asset swaps.
                        </p>
                      </div>
                      
                      <Button 
                        onClick={() => selectPaymentType("Mutual")} 
                        className="w-full h-12 bg-indigo-600 hover:bg-indigo-500"
                      >
                        <HeartHandshake size={18} className="mr-2" /> Select Mutual Pay
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Comparison Table */}
            <div className="mt-auto p-4 bg-stone-50 rounded-xl border border-stone-200">
              <h5 className="font-bold text-stone-700 text-sm mb-3 text-center">Quick Comparison</h5>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="font-bold text-stone-500"></div>
                <div className="font-bold text-orange-600 text-center">Direct</div>
                <div className="font-bold text-indigo-600 text-center">Mutual</div>
                
                <div className="text-stone-600">Speed</div>
                <div className="text-center text-green-600">⚡ Instant</div>
                <div className="text-center text-amber-600">🕐 2 rounds</div>
                
                <div className="text-stone-600">Security</div>
                <div className="text-center text-amber-600">Trust-based</div>
                <div className="text-center text-green-600">Trustless</div>
                
                <div className="text-stone-600">Reversal</div>
                <div className="text-center text-red-600">None</div>
                <div className="text-center text-green-600">Before R2</div>
                
                <div className="text-stone-600">Tx Fees</div>
                <div className="text-center text-green-600">$0</div>
                <div className="text-center text-green-600">$0</div>
              </div>
              <p className="text-[10px] text-stone-400 text-center mt-2">All transactions covered by your monthly subscription</p>
            </div>
          </div>
        )}

        {/* STEP: Input (existing, with back button) */}
        {step === "input" && (
          <>
            <button 
              onClick={() => setStep("select_type")} 
              className="flex items-center gap-2 text-sm text-stone-500 hover:text-stone-700 mb-4"
            >
              <ArrowRight className="rotate-180" size={16} /> Back to payment type
            </button>

            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800">
               <span className="font-bold block mb-1">📢 Protocol Note:</span>
               This application provides an interface to sign Kaspa transactions. We do not facilitate the sale, hold funds, or verify the items. You are transacting directly with the address below.
            </div>

            <div className="mb-4 flex items-center justify-center gap-2">
               <div className="bg-green-100 text-green-800 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1 border border-green-200">
                  <Globe size={12}/> Sanctions Check: PASSED
               </div>
               <div className={cn(
                 "text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1 border",
                 paymentType === "Direct" 
                   ? "bg-orange-100 text-orange-800 border-orange-200" 
                   : "bg-indigo-100 text-indigo-800 border-indigo-200"
               )}>
                  {paymentType === "Direct" ? <Zap size={12}/> : <HeartHandshake size={12}/>}
                  {paymentType} Pay
               </div>
            </div>

            <ApartmentSearch onApartmentFound={setTargetPubkey} />

            <div className="flex-1">
              {/* Custom KAS Amount Input for Direct Pay (no fee) */}
              <div className="mb-4">
                <label className="block text-sm font-bold text-stone-600 mb-2">Amount (KAS)</label>
                <div className="flex gap-2">
                  <input 
                    type="number" 
                    placeholder="Enter amount..."
                    value={finalAmount || ''}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      // Update cart with custom amount (no fee for direct pay)
                      if (cart.item) {
                        cart.item.price = val;
                      }
                    }}
                    className="flex-1 p-3 rounded-xl border border-stone-300 bg-white outline-none focus:ring-2 focus:ring-orange-500 font-mono text-lg"
                    min={0}
                    step={0.01}
                  />
                  <span className="p-3 bg-stone-100 rounded-xl font-bold text-stone-600">KAS</span>
                </div>
                <p className="text-[10px] text-green-600 mt-1 font-bold">✓ No transaction fee for Direct Pay</p>
              </div>
              
              <div className="flex justify-between text-lg font-bold p-4 border border-stone-200 rounded-xl bg-stone-50">
                 <span>Amount to Sign</span>
                 <span className="font-mono text-green-700">{finalAmount} KAS</span>
              </div>
              
              <div className="mt-4 flex items-start gap-3">
                 <input type="checkbox" id="agree" className="mt-1" checked={userAgreed} onChange={(e) => setUserAgreed(e.target.checked)} />
                 <label htmlFor="agree" className="text-xs text-stone-500 leading-tight">
                    I confirm I know this counterparty. I understand this software does not custody funds and cannot reverse transactions.
                 </label>
              </div>
            </div>

            <Button 
              onClick={handleBroadcast} 
              variant={paymentType === "Mutual" ? "pay_mutual" : "pay_direct"} 
              className={cn(
                "w-full h-14 text-lg", 
                !userAgreed ? "opacity-50 cursor-not-allowed" : "",
                paymentType === "Mutual" ? "bg-indigo-600" : "bg-orange-500"
              )} 
              disabled={!userAgreed}
            >
              {paymentType === "Direct" ? (
                <><Zap size={20} className="mr-2"/> Sign & Broadcast</>
              ) : (
                <><HeartHandshake size={20} className="mr-2"/> Initiate Mutual Contract</>
              )}
            </Button>
          </>
        )}

        {step === "processing" && (
          <div className="flex flex-col items-center justify-center flex-1">
            <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mb-4 animate-pulse">
              <Zap className="text-orange-500" size={40} />
            </div>
            <p className="text-stone-600">Broadcasting to network...</p>
          </div>
        )}
        
        {step === "complete" && (
           <div className="flex flex-col items-center justify-center flex-1 text-center">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-4"><Zap className="text-green-600" size={40} /></div>
              <h2 className="text-2xl font-bold text-amber-900">Broadcasted!</h2>
              <p className="text-stone-500 mt-2">Your signature has been propagated to the Kaspa network.</p>
              <Button onClick={onClose} variant="outline" className="mt-8 w-full">Close</Button>
           </div>
        )}
      </motion.div>
    </div>
  );
};

const StepItem = ({ done, text }) => (
  <div className="flex items-center gap-3">
    <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold", done ? "bg-green-500 text-white" : "bg-amber-300 text-amber-800")}>{done ? "✓" : "•"}</div>
    <span className={cn(done ? "text-amber-900 font-bold" : "text-amber-700")}>{text}</span>
  </div>
);

// --- 8. HOST NODE BUILDER UI (Was Storefront Builder) ---

const HostNodeBuilder = ({ hostNode, userXp, openDApp }) => {
  const [activeView, setActiveView] = useState("themes");
  const [theme, setTheme] = useState(hostNode.theme);
  const canManageCoupons = userXp >= 100;
  const canAccessOtc = userXp >= 500;
  const canAccessConsignment = userXp >= 10000;
  
  const [showQualityGate, setShowQualityGate] = useState(false);
  const [showCouponPopup, setShowCouponPopup] = useState(false);
  const [showItemPopup, setShowItemPopup] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [coupons, setCoupons] = useState([]);

  const handleCreateCoupon = (couponData) => {
    setCoupons(prev => [...prev, couponData]);
  };

  const handleSaveItem = (itemData) => {
    if (editingItem) {
      setInventory(prev => prev.map(i => i.id === itemData.id ? itemData : i));
    } else {
      setInventory(prev => [...prev, itemData]);
    }
    setEditingItem(null);
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6"><h2 className="text-2xl font-black text-amber-900">Host Node Editor</h2><Badge tier={hostNode.owner_tier} /></div>
      <div className="flex mb-6 p-1 bg-amber-200 rounded-xl">{["themes", "items", "coupons", "dapps"].map(view => (<button key={view} onClick={() => setActiveView(view)} className={cn("flex-1 py-2 text-xs font-bold rounded-lg capitalize", activeView === view ? "bg-white shadow text-red-800" : "text-amber-800")}>{view}</button>))}</div>
      {activeView === "themes" && (<div className="space-y-4"><h3 className="font-bold text-lg text-amber-800">Current Theme: {theme}</h3>{THEME_OPTIONS.map(t => {const unlocked = userXp >= t.required_xp; return (<div key={t.id} onClick={() => { if(unlocked) setTheme(t.id); }} className={cn("p-4 rounded-xl border-2", unlocked ? "border-red-800 bg-amber-50" : "border-gray-200 bg-gray-100 cursor-not-allowed opacity-50")}><div className="flex items-center justify-between"><div className="flex items-center gap-4"><div style={{ background: t.primary, border: `2px solid ${t.secondary}` }} className="w-10 h-10 rounded-lg shadow-inner" /><div><div className="font-bold">{t.name}</div><div className="text-xs text-red-800">{unlocked ? "Unlocked" : `Requires ${t.required_xp} XP`}</div></div></div>{unlocked && theme !== t.id && <Button className="h-8 py-1">Apply</Button>}{theme === t.id && <CheckCircle size={20} className="text-green-700" />}</div></div>);})}</div>)}
      
      {/* ITEMS TAB - Updated with popup */}
      {activeView === "items" && (
        <Card className="p-4 bg-amber-50">
          <h3 className="font-bold text-lg text-amber-800 mb-3">Inventory Management</h3>
          <p className="text-sm text-amber-700 mb-4">Add, edit, or delete items for your Node.</p>
          
          {inventory.length > 0 && (
            <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
              {inventory.map(item => (
                <div key={item.id} className="p-3 bg-white rounded-xl border border-amber-200 flex justify-between items-center">
                  <div>
                    <div className="font-bold text-stone-800">{item.name}</div>
                    <div className="text-xs text-stone-500">${item.dollarPrice.toFixed(2)} → {item.kaspaPrice.toLocaleString()} KAS</div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { setEditingItem(item); setShowItemPopup(true); }} className="text-xs text-blue-600 font-bold">Edit</button>
                    <button onClick={() => setInventory(prev => prev.filter(i => i.id !== item.id))} className="text-xs text-red-600 font-bold">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          <Button onClick={() => { setEditingItem(null); setShowItemPopup(true); }} variant="secondary" className="w-full bg-blue-600 hover:bg-blue-500">
            <ShoppingBag size={16} className="mr-2" /> Add New Item
          </Button>
        </Card>
      )}
      
      {/* COUPONS TAB - Updated with popup */}
      {activeView === "coupons" && (
        <Card className={cn("p-4", canManageCoupons ? "bg-amber-50" : "bg-red-50 opacity-80")}>
          <h3 className="font-bold text-lg text-red-800 mb-3">Coupon Management</h3>
          {canManageCoupons ? (
            <>
              <p className="text-sm text-amber-700 mb-4">Create coupons with USD→KAS pricing and discounts.</p>
              
              {coupons.length > 0 && (
                <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
                  {coupons.map((coupon, idx) => (
                    <div key={idx} className="p-3 bg-white rounded-xl border border-purple-200">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-bold text-purple-800 text-sm">{coupon.code}</div>
                          <div className="text-xs text-stone-600">{coupon.description}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs line-through text-stone-400">${coupon.dollarPrice.toFixed(2)}</div>
                          <div className="font-bold text-green-700">{coupon.discountedKaspa} KAS</div>
                          <div className="text-[10px] text-purple-600">{coupon.discountPercent}% off</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              <Button onClick={() => setShowCouponPopup(true)} variant="secondary" className="w-full bg-purple-600 hover:bg-purple-500">
                Create New Coupon
              </Button>
            </>
          ) : (
            <p className="text-sm text-red-800">Requires Promoter Tier (100 XP) to manage coupons.</p>
          )}
        </Card>
      )}
      
      {activeView === "dapps" && (
        <Card className="p-4 bg-gradient-to-br from-purple-50 to-indigo-50 border-purple-200">
            <h3 className="font-bold text-lg text-purple-800 flex items-center gap-2">
               <PlayCircle size={20}/> DApp & Game Management
            </h3>
            <p className="text-sm text-purple-700 mt-2 mb-4">Build, publish, and manage your DApps. Rights transfers are peer-to-peer.</p>
            
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 mb-4">
               <strong>⚠️ Compliance:</strong> Prohibited content apps are restricted and auto-rejected by protocol.
            </div>

            <div className="flex flex-col gap-3">
                <a 
                  href="https://idx.google.com" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-full h-12 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition"
                >
                  <ExternalLink size={16}/> Open IDE (idx.google.com)
                </a>
                
                <Button 
                    onClick={() => setShowQualityGate(true)} 
                    variant="pay_direct" 
                    className="w-full h-12 bg-green-600 hover:bg-green-500"
                >
                    <ShieldCheck size={16} className="mr-2"/> Publish New DApp
                </Button>
                
                <Button 
                    onClick={() => openDApp('consignment')} 
                    disabled={!canAccessConsignment} 
                    variant={canAccessConsignment ? "pay_mutual" : "outline"} 
                    className={cn("w-full h-10", canAccessConsignment ? '' : 'text-red-700 bg-red-100')}
                >
                    Consignment Contracts ({canAccessConsignment ? 'Unlocked' : 'Trust Anchor Tier'})
                </Button>
                
                <Button 
                    onClick={() => openDApp('academics')} 
                    variant="outline" 
                    className="w-full h-10 border-indigo-300 text-indigo-800"
                >
                    Academic/Research P2P
                </Button>
            </div>
            
            <div className="mt-4 p-3 bg-white rounded-xl border border-purple-200">
               <h4 className="text-xs font-bold text-purple-800 uppercase mb-2">DApp Template</h4>
               <p className="text-[10px] text-stone-500 mb-2">Copy the integration template to start building:</p>
               <button 
                  onClick={() => {
                     navigator.clipboard.writeText(DAPP_TEMPLATE_CODE);
                     alert("Template copied to clipboard!");
                  }}
                  className="w-full py-2 bg-purple-100 hover:bg-purple-200 text-purple-800 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2"
               >
                  <Code size={14}/> Copy Integration Template
               </button>
            </div>
        </Card>
      )}
      <AnimatePresence>
        {showQualityGate && (
            <QualityGateModal 
                onClose={() => setShowQualityGate(false)} 
                onPublish={(manifestData) => { 
                    console.log("DApp Manifest Published:", manifestData);
                    setShowQualityGate(false);
                    alert(`DApp Manifest for '${manifestData.name}' submitted to ${manifestData.targetBoard.name}!`);
                }}
            />
        )}
      </AnimatePresence>
      
      {/* Coupon Creation Popup */}
      <CouponCreationPopup 
        isOpen={showCouponPopup}
        onClose={() => setShowCouponPopup(false)}
        onCreate={handleCreateCoupon}
      />
      
      {/* Inventory Item Popup */}
      <InventoryItemPopup 
        isOpen={showItemPopup}
        onClose={() => { setShowItemPopup(false); setEditingItem(null); }}
        onSave={handleSaveItem}
        item={editingItem}
      />
    </div>
  );
};

// --- 9. HOST NODE INTERFACE MODAL (Was Seller Storefront) ---

function HostNodeInterface({ hostNode, templateId, onClose }) {
  const { user, setShowTransactionSigner } = useContext(GlobalContext);
  if (!hostNode) return null;
  const template = THEME_OPTIONS.find(t => t.id === templateId) || THEME_OPTIONS[0];

  const MOCK_PRODUCTS = [
      { id: 1, name: "Vintage Jacket", price: 500, visuals: { platform: "Instagram", url: "https://instagram.com" } }, 
      { id: 2, name: "Retro Console", price: 1200, visuals: { platform: "TikTok", url: "https://tiktok.com" } },
      { id: 3, name: "Handmade Rug", price: 3000, visuals: { platform: "Etsy", url: "https://etsy.com" } }, 
      { id: 4, name: "Rare Vinyl", price: 150, visuals: { platform: "Pinterest", url: "https://pinterest.com" } }
  ];

  return (
    <div className="fixed inset-0 bg-amber-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-3xl p-6 w-full max-w-md overflow-y-auto max-h-[90vh] shadow-2xl border-t-4 border-red-800">
        <div className="flex justify-between items-start mb-4">
          <div><h2 className="text-2xl font-black text-amber-900">Node — Apt {hostNode.apartment}</h2><p className="text-sm text-amber-700">Theme: {hostNode.theme}</p></div>
          <Button variant="outline" onClick={onClose} className="rounded-full h-8 w-8 p-0"><X className="w-5 h-5" /></Button>
        </div>
        <h3 className="font-bold mb-3 text-amber-900 flex items-center gap-2">Available Items</h3>
        <div className="grid grid-cols-2 gap-4 mb-6">
          {MOCK_PRODUCTS.map((p) => (
            <div key={p.id} className="p-3 rounded-xl border shadow-sm bg-amber-50">
               <div className="w-full h-20 bg-amber-100 rounded-lg mb-2 flex flex-col items-center justify-center text-amber-300 gap-1">
                   <span className="text-xs text-amber-500 font-bold">Visuals on {p.visuals.platform}</span>
                   <a href={p.visuals.url} target="_blank" rel="noopener noreferrer" className="bg-white/80 p-1 rounded-full text-amber-600 hover:bg-white hover:scale-110 transition"><ExternalLink size={16}/></a>
               </div>
               <div className="font-semibold text-sm truncate">{p.name}</div>
               <div className="text-xs font-bold text-red-800">{p.price} KAS</div>
               <Button onClick={() => setShowTransactionSigner(true)} className="w-full mt-2 h-8 text-xs bg-red-800">Open Contract</Button>
            </div>
          ))}
        </div>
        <div className="bg-red-50 p-4 rounded-xl border border-red-200 mb-4">
          <h3 className="font-black mb-3 text-red-800 flex items-center gap-2"><Lock size={18}/> Trust Protocol</h3>
          <p className="text-xs text-red-800 mb-2">This Node uses non-custodial multi-sig settlement.</p>
        </div>
        <div className="mt-4 flex gap-2"><Button variant="outline" className="flex-1 bg-red-100 text-red-800">Raise Dispute</Button><Button variant="outline" className="flex-1 bg-red-100 text-red-800">Decline Counterparty</Button><Button onClick={onClose} variant="outline" className="flex-1">Close</Button></div>
      </motion.div>
    </div>
  );
}

// --- 10. CONSIGNMENT MODULE - MUTUAL RELEASE MODEL ---
function ConsignmentModule({ onClose }) {
  const { user } = useContext(GlobalContext);
  const isHost = user.tier === 'Trust Anchor';
  const [xpStake, setXpStake] = useState(250); 
  const [step, setStep] = useState(1);
  const [role, setRole] = useState(null); // 'host' (seller) or 'consigner'
  const [contractTerms, setContractTerms] = useState({
      consignment_share_pct: 75,
      item_value: 1500,
      item_description: 'Vintage Sneaker Consignment',
  });
  
  // Mutual release state
  const [consignerApproved, setConsignerApproved] = useState(false);
  const [sellerApproved, setSellerApproved] = useState(false);

  const consignerPayout = (contractTerms.item_value * contractTerms.consignment_share_pct / 100).toFixed(2);
  const hostAllocation = (contractTerms.item_value * (1 - contractTerms.consignment_share_pct / 100)).toFixed(2);
  const isReady = isHost && user.xp >= xpStake && xpStake >= 100;

  const handleContractLock = () => {
      alert(`Consignment contract for ${contractTerms.item_value} KAS item established! Your ${xpStake} XP is locked as collateral.`);
      setStep(2);
  }
  
  const handleRecordSale = () => {
      setStep(3); // Move to mutual release stage
  }
  
  const handleApproveRelease = () => {
      if (role === 'host') {
          setSellerApproved(true);
          if (consignerApproved) {
              setStep(5); // Completed
          }
      } else {
          setConsignerApproved(true);
          if (sellerApproved) {
              setStep(5); // Completed
          }
      }
  }
  
  const handleRequestDeadlock = () => {
      setStep(6); // Deadlock confirmation
  }
  
  const handleConfirmDeadlock = () => {
      setStep(7); // Deadlocked - funds frozen
  }

  return (
    <div className="fixed inset-0 bg-amber-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[70]">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl overflow-y-auto max-h-[90vh]">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-black text-red-800">Host-Consigner Agreement</h1> 
          <Button variant="outline" onClick={onClose} className="rounded-full h-8 w-8 p-0"><X className="w-5 h-5" /></Button>
        </div>

        {/* Step 1: Setup Contract */}
        {step === 1 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                <Card className="rounded-2xl p-4 bg-amber-50 border-amber-300">
                    <div className="p-2 space-y-3">
                        <h2 className="text-xl font-bold text-red-800">Trust Anchor Status</h2>
                        <div className="flex justify-between items-center">
                            <p className={cn(isHost ? "text-green-700 font-bold" : "text-red-700 font-bold")}>{isHost ? 'You are a Trust Anchor ✔' : 'Requires Trust Anchor Tier'}</p>
                            <Badge tier={user.tier} />
                        </div>
                    </div>
                </Card>
                
                {/* MUTUAL RELEASE EXPLANATION */}
                <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-xs text-indigo-800">
                  <strong>🤝 How Mutual Release Works:</strong>
                  <ul className="mt-1 space-y-1">
                    <li>• Consigner gives you item to sell</li>
                    <li>• <strong>You (Host)</strong> lock XP as guarantee</li>
                    <li>• <strong>Consigner locks NOTHING</strong></li>
                    <li>• When item sells, <strong>BOTH must approve</strong> to release funds</li>
                    <li>• If either refuses → Funds <strong>frozen forever</strong></li>
                  </ul>
                </div>
                
                <div className="p-3 bg-red-50 border border-red-300 rounded-xl text-xs text-red-800">
                  <strong>⚠️ Deadlock Warning:</strong> If you and consigner disagree after sale, neither party gets the locked funds. They're frozen permanently. Your staked XP is also lost.
                </div>

                <Card className="rounded-2xl shadow p-4">
                    <h2 className="text-xl font-bold mb-3 text-amber-800">Contract Terms</h2> 
                    
                    <label className="block text-sm font-bold text-stone-600 mb-1">Item Description</label>
                    <input 
                        type="text" 
                        className="border border-amber-300 p-3 rounded-xl w-full mb-3 bg-amber-50" 
                        value={contractTerms.item_description} 
                        onChange={(e) => setContractTerms(p => ({...p, item_description: e.target.value}))} 
                    />
                    
                    <label className="block text-sm font-bold text-stone-600 mb-1">Item Value (KAS)</label>
                    <input 
                        type="number" 
                        className="border border-amber-300 p-3 rounded-xl w-full mb-3 bg-amber-50" 
                        value={contractTerms.item_value} 
                        onChange={(e) => setContractTerms(p => ({...p, item_value: Number(e.target.value)}))} 
                        min={1}
                    />

                    <label className="block text-sm font-bold text-stone-600 mb-1">Consigner Payout %</label>
                    <div className="flex gap-2">
                        <input 
                            type="number" 
                            className="border border-amber-300 p-3 rounded-xl w-full mb-3 bg-amber-50" 
                            value={contractTerms.consignment_share_pct} 
                            onChange={(e) => setContractTerms(p => ({...p, consignment_share_pct: Number(e.target.value)}))} 
                            min={1} max={100}
                        />
                        <span className="p-3 font-bold text-stone-500">%</span>
                    </div>
                    
                    <div className="border-t border-stone-200 pt-3 mt-2">
                      <h3 className="font-bold text-stone-700 mb-2">Your Collateral (Host Only)</h3>
                      
                      <label className="block text-sm font-bold text-stone-600 mb-1">XP Collateral (Required)</label>
                      <input 
                          type="number" 
                          className="border border-amber-300 p-3 rounded-xl w-full mb-3 bg-amber-50" 
                          placeholder="Min 100 XP" 
                          value={xpStake} 
                          onChange={(e) => setXpStake(Number(e.target.value))} 
                          min={100}
                      />
                      <p className="text-[10px] text-stone-400 mb-3">Consigner stakes nothing. Only you (host) put up XP collateral.</p>
                      
                      {/* OPTIONAL: Seller KAS Collateral */}
                      <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl mt-3">
                        <label className="flex items-center gap-2 mb-2">
                          <input 
                            type="checkbox"
                            checked={contractTerms.sellerCollateralEnabled || false}
                            onChange={(e) => setContractTerms(p => ({...p, sellerCollateralEnabled: e.target.checked}))}
                            className="w-4 h-4 accent-blue-600"
                          />
                          <span className="text-sm font-bold text-blue-800">Optional: Seller KAS Collateral</span>
                        </label>
                        {contractTerms.sellerCollateralEnabled && (
                          <>
                            <input 
                                type="number" 
                                className="border border-blue-300 p-3 rounded-xl w-full mb-2 bg-white" 
                                placeholder="Seller locks KAS (optional)" 
                                value={contractTerms.sellerCollateralKas || ''} 
                                onChange={(e) => setContractTerms(p => ({...p, sellerCollateralKas: Number(e.target.value)}))} 
                                min={0}
                            />
                            <p className="text-[10px] text-blue-700">
                              <strong>Voluntary:</strong> Seller can lock KAS as additional guarantee. This KAS is returned when buyer confirms receipt, or frozen on deadlock.
                            </p>
                          </>
                        )}
                        {!contractTerms.sellerCollateralEnabled && (
                          <p className="text-[10px] text-blue-600">
                            Enable this to let the seller voluntarily lock KAS as additional trust guarantee.
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 p-3 border border-red-200 rounded-xl bg-red-50 text-sm">
                        <h4 className="font-bold text-red-800 mb-1">Payout Summary (After Mutual Release)</h4> 
                        <div className="flex justify-between text-xs"><span>Consigner Gets:</span><span className="font-mono text-red-800">{consignerPayout} KAS</span></div>
                        <div className="flex justify-between text-xs font-bold mt-1"><span>Your Allocation:</span><span className="font-mono text-green-700">{hostAllocation} KAS</span></div>
                        <hr className="my-2 border-red-200" />
                        <div className="flex justify-between text-xs"><span>Your XP At Risk:</span><span className="font-mono text-amber-700">{xpStake} XP</span></div>
                    </div>

                    <Button 
                        disabled={!isReady} 
                        onClick={handleContractLock} 
                        className={cn("w-full mt-6 h-12 text-lg", isReady ? 'bg-red-800' : 'bg-red-300')}
                    >
                        {isReady ? `Lock ${xpStake} XP & Activate` : `Insufficient XP or Not Anchor`}
                    </Button>
                </Card>
            </motion.div>
        )}

        {/* Step 2: Contract Active - Awaiting Sale */}
        {step === 2 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center flex-1 space-y-6">
             <div className="relative">
                 <div className="w-24 h-24 rounded-full border-4 border-green-100 flex items-center justify-center">
                    <ShieldCheck className="text-green-700" size={40}/>
                 </div>
             </div>
             <h3 className="text-xl font-bold text-stone-800">Consignment Active</h3> 
             <p className="text-center text-sm text-amber-700">
               Your <strong>{xpStake} XP</strong> is locked backing the {contractTerms.item_description}.
             </p>
             
             <div className="w-full space-y-3 p-4 bg-yellow-100 rounded-xl">
                <StepItem done={true} text="1. Host Locked XP Collateral" />
                <StepItem done={false} text="2. Awaiting Buyer Payment" />
                <StepItem done={false} text="3. Mutual Release (Both Approve)" />
                <StepItem done={false} text="4. Funds Released & XP Unlocked" />
             </div>
             
             {/* Simulate sale button */}
             <Button onClick={handleRecordSale} className="w-full bg-green-700">
               Simulate: Item Sold! →
             </Button>
             
             <Button onClick={onClose} variant="outline" className="w-full">Close</Button>
          </motion.div>
        )}
        
        {/* Step 3: Sold - Choose Role for Demo */}
        {step === 3 && !role && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <div className="text-center">
              <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <ShoppingBag className="text-amber-600" size={36} />
              </div>
              <h3 className="text-xl font-bold text-amber-800">Item Sold!</h3>
              <p className="text-sm text-stone-600 mt-2">
                Payment of <strong>{contractTerms.item_value} KAS</strong> received. Now both parties must approve release.
              </p>
            </div>
            
            <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-200">
              <h4 className="font-bold text-indigo-800 mb-2">🎭 Demo: Choose Your Role</h4>
              <p className="text-xs text-indigo-700 mb-3">To see the mutual release flow, pick which party you're simulating:</p>
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => setRole('host')}
                  className="p-4 bg-white rounded-xl border-2 border-amber-300 hover:border-amber-500 transition-all"
                >
                  <Store size={24} className="mx-auto mb-2 text-amber-600" />
                  <span className="text-sm font-bold text-amber-800">I'm the Host</span>
                  <p className="text-[10px] text-stone-500">(Seller)</p>
                </button>
                <button 
                  onClick={() => setRole('consigner')}
                  className="p-4 bg-white rounded-xl border-2 border-red-300 hover:border-red-500 transition-all"
                >
                  <User size={24} className="mx-auto mb-2 text-red-600" />
                  <span className="text-sm font-bold text-red-800">I'm the Consigner</span>
                  <p className="text-[10px] text-stone-500">(Item Owner)</p>
                </button>
              </div>
            </div>
          </motion.div>
        )}
        
        {/* Step 3/4: Mutual Release Flow */}
        {step === 3 && role && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="text-center mb-4">
              <h3 className="text-xl font-bold text-amber-800">Mutual Release Required</h3>
              <p className="text-sm text-stone-600">Both parties must approve to release funds</p>
            </div>
            
            {/* Current Role Badge */}
            <div className={cn(
              "text-center p-2 rounded-xl text-sm font-bold",
              role === 'host' ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"
            )}>
              You are: {role === 'host' ? '🏪 Host (Seller)' : '👤 Consigner (Item Owner)'}
            </div>
            
            {/* Approval Status */}
            <div className="p-4 bg-stone-50 rounded-xl border border-stone-200">
              <h4 className="font-bold text-sm text-stone-700 mb-3">Release Approval Status</h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-2 bg-white rounded-lg">
                  <div className="flex items-center gap-2">
                    <User size={16} className="text-red-600" />
                    <span className="text-sm">Consigner</span>
                  </div>
                  <span className={cn(
                    "text-sm font-bold px-2 py-1 rounded",
                    consignerApproved ? "bg-green-100 text-green-700" : "bg-stone-100 text-stone-500"
                  )}>
                    {consignerApproved ? '✓ Approved' : 'Pending'}
                  </span>
                </div>
                <div className="flex items-center justify-between p-2 bg-white rounded-lg">
                  <div className="flex items-center gap-2">
                    <Store size={16} className="text-amber-600" />
                    <span className="text-sm">Host (Seller)</span>
                  </div>
                  <span className={cn(
                    "text-sm font-bold px-2 py-1 rounded",
                    sellerApproved ? "bg-green-100 text-green-700" : "bg-stone-100 text-stone-500"
                  )}>
                    {sellerApproved ? '✓ Approved' : 'Pending'}
                  </span>
                </div>
              </div>
            </div>
            
            {/* Payout Preview */}
            <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-sm">
              <h4 className="font-bold text-green-800 mb-2">On Mutual Approval:</h4>
              <div className="flex justify-between text-xs">
                <span>Consigner receives:</span>
                <span className="font-mono font-bold text-green-700">{consignerPayout} KAS</span>
              </div>
              <div className="flex justify-between text-xs">
                <span>Host receives:</span>
                <span className="font-mono font-bold text-green-700">{hostAllocation} KAS</span>
              </div>
              <div className="flex justify-between text-xs">
                <span>Host XP returned:</span>
                <span className="font-mono font-bold text-amber-700">{xpStake} XP</span>
              </div>
            </div>
            
            {/* Action Buttons */}
            <Button 
              onClick={handleApproveRelease}
              disabled={(role === 'host' && sellerApproved) || (role === 'consigner' && consignerApproved)}
              className={cn(
                "w-full h-12",
                (role === 'host' && sellerApproved) || (role === 'consigner' && consignerApproved)
                  ? "bg-stone-300"
                  : "bg-green-700 hover:bg-green-600"
              )}
            >
              {(role === 'host' && sellerApproved) || (role === 'consigner' && consignerApproved)
                ? '⏳ Waiting for other party...'
                : '✓ Approve Release'
              }
            </Button>
            
            <button 
              onClick={handleRequestDeadlock}
              className="w-full text-center text-sm text-red-600 hover:text-red-800 underline"
            >
              ⚠️ Problem? Request Deadlock (Freezes Funds Forever)
            </button>
          </motion.div>
        )}
        
        {/* Step 5: Completed Successfully */}
        {step === 5 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center space-y-6">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="text-green-600" size={40} />
            </div>
            <h3 className="text-2xl font-black text-green-700">Mutual Release Complete!</h3>
            <div className="p-4 bg-stone-50 rounded-xl text-left space-y-2">
              <div className="flex justify-between"><span className="text-sm text-stone-500">Item:</span><span className="font-bold">{contractTerms.item_description}</span></div>
              <div className="flex justify-between"><span className="text-sm text-stone-500">Consigner received:</span><span className="font-bold text-green-700">{consignerPayout} KAS</span></div>
              <div className="flex justify-between"><span className="text-sm text-stone-500">Host received:</span><span className="font-bold text-green-700">{hostAllocation} KAS</span></div>
              <hr className="my-2 border-stone-200" />
              <div className="flex justify-between text-xs"><span className="text-stone-400">Host XP:</span><span className="text-green-600">Unlocked ✓ (+{xpStake} XP)</span></div>
            </div>
            <Button onClick={onClose} className="w-full h-12 bg-indigo-600">Close</Button>
          </motion.div>
        )}
        
        {/* Step 6: Deadlock Warning */}
        {step === 6 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="text-center">
              <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="text-red-600" size={40} />
              </div>
              <h3 className="text-xl font-black text-red-800">⚠️ Deadlock Warning</h3>
            </div>
            
            <div className="p-4 bg-red-50 border border-red-300 rounded-xl">
              <h4 className="font-bold text-red-800 mb-2">This is IRREVERSIBLE!</h4>
              <ul className="text-sm text-red-700 space-y-2">
                <li>• <strong>Consigner's share ({consignerPayout} KAS)</strong> → FROZEN FOREVER</li>
                <li>• <strong>Host's XP ({xpStake} XP)</strong> → LOST FOREVER</li>
                <li>• Neither party can recover these funds</li>
                <li>• This action cannot be undone</li>
              </ul>
            </div>
            
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
              <strong>Why deadlock exists:</strong> Without a third-party arbitrator, disagreements can't be resolved. The threat of mutual loss incentivizes both parties to be honest and cooperate.
            </div>
            
            <Button 
              onClick={handleConfirmDeadlock}
              className="w-full h-12 bg-red-800"
            >
              Confirm Deadlock (Freeze Funds Forever)
            </Button>
            
            <Button 
              onClick={() => setStep(3)}
              variant="outline"
              className="w-full"
            >
              ← Go Back and Try to Resolve
            </Button>
          </motion.div>
        )}
        
        {/* Step 7: Deadlocked */}
        {step === 7 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center space-y-6">
            <div className="w-20 h-20 bg-stone-200 rounded-full flex items-center justify-center mx-auto">
              <Lock className="text-stone-600" size={40} />
            </div>
            <h3 className="text-2xl font-black text-stone-700">Deadlocked</h3>
            <p className="text-sm text-stone-500">Neither party can access the funds.</p>
            <div className="p-4 bg-stone-100 rounded-xl text-left space-y-2">
              <div className="flex justify-between"><span className="text-sm text-stone-500">Frozen funds:</span><span className="font-bold text-stone-700">{consignerPayout} KAS</span></div>
              <div className="flex justify-between"><span className="text-sm text-stone-500">Host XP lost:</span><span className="font-bold text-red-700">-{xpStake} XP</span></div>
              <hr className="my-2 border-stone-300" />
              <div className="text-xs text-stone-400 text-center">These funds are permanently inaccessible.</div>
            </div>
            <Button onClick={onClose} variant="outline" className="w-full h-12">Close</Button>
          </motion.div>
        )}

      </motion.div>
    </div>
  );
}

// --- 13. ACADEMIC MODULE ---
function AcademicResearchPreview({ onClose }) {
  const { user } = useContext(GlobalContext);
  const [verified, setVerified] = useState(false);
  const [universityEmail, setUniversityEmail] = useState("");
  const [advisorEmail, setAdvisorEmail] = useState("");
  const [donationAmount, setDonationAmount] = useState(10);
  const [tutoringPrice, setTutoringPrice] = useState(0);
  const [flatRatePrice, setFlatRatePrice] = useState(0);
  
  const [professorName, setProfessorName] = useState("Dr. Anya Sharma");
  const [abstractLink, setAbstractLink] = useState("https://kasresearch.com/publication_id_123");
  const [abstractSummary, setAbstractSummary] = useState("Proving a new consensus mechanism for Layer 2 based on Kaspa's BlockDAG, focusing on transaction finality speed and multi-sig contract latency. The findings suggest a 45% reduction in confirmation time.");
  const [aiInterpretation, setAiInterpretation] = useState("Imagine sending money faster than a blink! This research basically turbo-charged a digital cash system (Kaspa) to make special agreements (like 'I pay if you deliver') super-duper quick, making online trade way less scary for the average person.");


  function requestVerification() {
    if (universityEmail.endsWith(".edu") && advisorEmail.includes("@") && professorName.length > 3) { setVerified(true); } else { alert("Please provide valid university email, advisor email, and professor name."); }
  }

  const handleDonation = () => {
    if (donationAmount > 0) {
        alert(`Simulating a ${donationAmount} KAS donation to the researcher's address. Broadcast transaction...`);
    } else {
        alert("Donation amount must be greater than 0 KAS.");
    }
  };

  return (
    <div className="fixed inset-0 bg-amber-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[70]">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl overflow-y-auto max-h-[90vh]">
        <div className="flex justify-between items-center mb-6"><h1 className="text-2xl font-black text-amber-900">Academic Profile</h1><Button variant="outline" onClick={onClose} className="rounded-full h-8 w-8 p-0"><X className="w-5 h-5" /></Button></div>

        <section className="mb-4 p-4 border border-amber-300 rounded-2xl bg-amber-50">
            <h3 className="font-bold text-amber-900 mb-3">Identity & Verification</h3>
            
            <label className="block mt-2 text-sm text-amber-800">Verification Professor/Advisor</label>
            <input className="w-full p-2 border border-amber-300 rounded-xl bg-white mb-2" placeholder="Professor Name" value={professorName} onChange={(e)=>setProfessorName(e.target.value)} />

            <label className="block mt-2 text-sm text-amber-800">University Email</label>
            <input className="w-full p-2 border border-amber-300 rounded-xl bg-white mb-2" placeholder="University Email" value={universityEmail} onChange={(e)=>setUniversityEmail(e.target.value)} />
            
            <label className="block mt-2 text-sm text-amber-800">Advisor Email</label>
            <input className="w-full p-2 border border-amber-300 rounded-xl bg-white mb-2" placeholder="Advisor Email" value={advisorEmail} onChange={(e)=>setAdvisorEmail(e.target.value)} />

            <div className="flex gap-2 mt-3 items-center">
                <Button variant="secondary" onClick={requestVerification} className="bg-amber-800">Request Co-sign</Button>
                <span className={cn("ml-2 self-center font-bold text-sm", verified ? 'text-green-700' : 'text-red-700')}>{verified ? 'Verified' : 'Unverified'}</span>
            </div>
        </section>

        <section className="mb-4 p-4 border border-amber-300 rounded-2xl bg-white">
            <h3 className="font-bold text-xl text-amber-900 mb-3">Research & Publication</h3>
            
            <h4 className="font-bold text-amber-900 mb-1 flex items-center gap-2"><FileText size={16}/> Abstract Summary</h4>
            <p className="text-sm text-amber-700 p-3 bg-amber-50 rounded-lg border border-amber-200">{abstractSummary}</p>
            
            <h4 className="font-bold text-amber-900 mt-3 mb-1 flex items-center gap-2"><Link size={16}/> Full Abstract Link</h4>
            <a href={abstractLink} target="_blank" rel="noopener noreferrer" className="block text-sm text-blue-600 underline truncate p-3 bg-blue-50 border border-blue-200 rounded-lg">{abstractLink}</a>

            <h4 className="font-bold text-amber-900 mt-4 mb-1 flex items-center gap-2"><Users size={16}/> AI Interpretation (14th Grade)</h4>
            <p className="text-sm text-red-800 font-medium p-3 bg-red-50 rounded-lg border border-red-200">"{aiInterpretation}"</p>
        </section>

        <section className="mb-4 p-4 border border-red-300 rounded-2xl bg-red-50">
            <h3 className="font-black text-xl text-red-800 mb-3 flex items-center gap-2"><Wallet size={18}/> Support Research: Kaspa Donation</h3>
            
            <label className="block mt-2 text-sm text-red-800 font-bold">Donation Amount (KAS)</label>
            <div className="flex gap-2">
                <input type="number" className="w-full p-2 border border-red-300 rounded-xl bg-white" value={donationAmount} onChange={(e)=>setDonationAmount(Number(e.target.value))} min="1" />
                <Button onClick={handleDonation} variant="secondary" className="bg-red-800 hover:bg-red-900">Donate KAS</Button>
            </div>
            <p className="text-xs text-red-700 mt-2">100% of KAS goes to the researcher's wallet.</p>
        </section>

        <section className="mb-4 p-4 border border-amber-300 rounded-2xl bg-amber-50">
            <h3 className="font-bold text-amber-900">Tutoring, Auditing, & Consulting Services</h3>
            <p className="text-sm text-amber-700">Full publication is publicly available. Tutoring is a business option paid in KAS.</p>
            <h4 className="font-bold text-amber-900 mt-3 flex items-center gap-2"><Clock size={16}/> Tutoring/Classes/Consulting</h4> 
            <p className="text-xs text-amber-700 mb-2">Available for code auditing, accounting/company auditing, statistics, analytics, and private classes, counseling, and legal consulting (see disclaimer).</p> 
            
            <div className="p-2 bg-red-100 border border-red-200 rounded-lg text-[10px] text-red-800 mb-3 font-bold">
               ⚠️ DISCLAIMER: "Legal Consulting" listed here refers to regulatory compliance guidance and research only. It does NOT constitute an attorney-client relationship or formal legal advice.
            </div>

            <label className="block mt-2 text-sm text-amber-800">Price per hour (KAS)</label>
            <input type="number" className="w-full p-2 border border-amber-300 rounded-xl bg-white" value={tutoringPrice} onChange={(e)=>setTutoringPrice(Number(e.target.value))} />

            <label className="block mt-2 text-sm text-amber-800">Flat Rate Project Fee (KAS)</label>
            <input 
                type="number" 
                className="w-full p-2 border border-amber-300 rounded-xl bg-white" 
                value={flatRatePrice} 
                onChange={(e)=>setFlatRatePrice(Number(e.target.value))} 
            />

            <a href="https://zoom.us/join" target="_blank" rel="noopener noreferrer" className="mt-3 block">
                <Button className="w-full bg-indigo-600">Link to Zoom / Class</Button>
            </a>
        </section>
      </motion.div>
    </div>
  );
}

// --- 14. VALIDATOR DASHBOARD ---
function ValidatorDashboard({ onClose }) {
  const { user } = useContext(GlobalContext);
  const isValidator = user.isValidator;
  const progress = user.validatorEpochProgress;
  const [showCollateralPopup, setShowCollateralPopup] = useState(false);
  const [currentCollateral, setCurrentCollateral] = useState(user.kasPutUp);

  const handleCollateralUpdate = (newAmount) => {
    setCurrentCollateral(newAmount);
    // In production: call API to update collateral
  };

  return (
    <div className="fixed inset-0 bg-amber-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[70]">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl overflow-y-auto max-h-[90vh]">
        <div className="flex justify-between items-center mb-6"><h1 className="text-2xl font-black text-amber-900">Validator Console</h1><Button variant="outline" onClick={onClose} className="rounded-full h-8 w-8 p-0"><X className="w-5 h-5" /></Button></div>
        <Card className="p-4 bg-red-50 border-red-300 mb-4"><div className="flex justify-between items-center mb-2"><h3 className="font-bold text-xl text-red-800">Status: {isValidator ? 'Active' : 'Inactive'}</h3><Code size={24} className="text-red-800" /></div><p className="text-sm text-red-700">L2 consensus node active.</p></Card>
        <Card className="p-4 bg-yellow-100 border-yellow-300 mb-4">
          <div className="flex justify-between mb-2"><span className="text-sm font-bold text-amber-900">KAS Staked (Collateral):</span><span className="text-lg font-black text-red-800">{currentCollateral.toLocaleString()} KAS</span></div>
          <div className="flex justify-between mb-1 text-xs text-stone-500"><span>USD Value:</span><span>${KAS_TO_USD(currentCollateral)}</span></div>
          <div className="flex justify-between mb-2"><span className="text-sm font-bold text-amber-900">Earned XP:</span><span className="text-lg font-black text-green-700">{user.xp.toLocaleString()} XP</span></div>
          <div className="flex justify-between mb-2"><span className="text-sm font-bold text-amber-900">Network Allocation:</span><span className="text-lg font-black text-orange-700">{user.networkAllocation.toLocaleString()} KAS</span></div>
          <Button onClick={() => setShowCollateralPopup(true)} className="w-full bg-green-700 hover:bg-green-800">Adjust KAS Collateral</Button>
        </Card>
        <Card className="p-4 bg-white border-amber-200"><h3 className="font-bold text-amber-900 mb-2">Epoch Progress</h3><div className="w-full bg-amber-200 h-3 rounded-full overflow-hidden"><motion.div className="h-full bg-blue-600" style={{ width: `${progress * 100}%` }}/></div></Card>
      </motion.div>
      
      {/* Collateral Popup */}
      <KaspaCollateralPopup 
        isOpen={showCollateralPopup}
        onClose={() => setShowCollateralPopup(false)}
        currentCollateral={currentCollateral}
        onUpdate={handleCollateralUpdate}
        maxBalance={user.balance}
      />
    </div>
  );
}

// --- NEW COMPONENT: WITHDRAWAL TIMELOCK PANEL ---
const WithdrawalTimelockPanel = ({ onClose }) => {
  const { user, pendingWithdrawals, circuitBreakerStatus, submitWithdrawal } = useContext(GlobalContext);
  const [amount, setAmount] = useState('');
  
  // NEW: Initialize with verified address
  // This value is read-only and comes from the user context
  const [destAddress] = useState(user.kaspaAddress);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const handleSubmit = async () => {
    if (!amount) {
      alert('Please enter amount');
      return;
    }
    // destAddress is guaranteed by state initialization
    setIsSubmitting(true);
    const res = await submitWithdrawal(parseInt(amount), destAddress);
    setResult(res);
    setIsSubmitting(false);
  };

  return (
    <div className="fixed inset-0 bg-stone-900/80 backdrop-blur-sm flex items-center justify-center p-4 z-[70]">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl overflow-y-auto max-h-[90vh]">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-black text-amber-900 flex items-center gap-2">
            <Hourglass className="text-red-800" /> Withdrawal (24h Lock)
          </h1>
          <Button variant="outline" onClick={onClose} className="rounded-full h-8 w-8 p-0"><X className="w-5 h-5" /></Button>
        </div>

        {/* Circuit Breaker Status */}
        <Card className={cn("p-4 mb-4", circuitBreakerStatus.is_tripped ? "bg-red-100 border-red-400" : "bg-green-50 border-green-200")}>
          <div className="flex items-center gap-3">
            {circuitBreakerStatus.is_tripped ? (
              <AlertOctagon className="text-red-600" size={24} />
            ) : (
              <Shield className="text-green-600" size={24} />
            )}
            <div>
              <h3 className={cn("font-bold", circuitBreakerStatus.is_tripped ? "text-red-800" : "text-green-800")}>
                {circuitBreakerStatus.is_tripped ? 'PROTOCOL HALTED' : 'Circuit Breaker OK'}
              </h3>
              <p className="text-xs text-stone-500">
                Outflow last hour: {(circuitBreakerStatus.total_outflow_last_hour / SOMPI_PER_KAS).toLocaleString()} KAS
              </p>
            </div>
          </div>
        </Card>

        {/* Protocol Info */}
        <Card className="p-4 mb-4 bg-amber-50 border-amber-200">
          <div className="flex items-center gap-2 mb-2">
            <Timer className="text-amber-700" size={18} />
            <span className="font-bold text-amber-900">24-Hour Time Lock</span>
          </div>
          <p className="text-xs text-amber-700">
            All withdrawals are subject to a {WITHDRAWAL_DELAY_SECONDS / 3600} hour delay for security. 
            Additionally, {REORG_SAFETY_CONFIRMATIONS} L1 block confirmations are required.
          </p>
        </Card>

        {!result ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold text-stone-600 mb-1">Amount (KAS)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full p-3 border border-amber-300 rounded-xl bg-white"
                placeholder="Enter amount"
                max={user.balance}
              />
              <p className="text-xs text-stone-400 mt-1">Available: {user.balance.toLocaleString()} KAS</p>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-bold text-stone-600">Kaspa L1 Address</label>
                <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded flex items-center gap-1">
                   <ShieldCheck size={10} /> Sanctions Verified
                </span>
              </div>
              <div className="relative">
                <input
                    type="text"
                    value={destAddress}
                    readOnly
                    className="w-full p-3 border border-stone-200 bg-stone-100 text-stone-500 rounded-xl font-mono text-sm cursor-not-allowed pr-10"
                />
                <Lock size={16} className="absolute right-3 top-3.5 text-stone-400" />
              </div>
              <p className="text-[10px] text-stone-400 mt-1 italic">
                 Withdrawals are restricted to your verified, sanctions-screened L1 wallet.
              </p>
            </div>

            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || circuitBreakerStatus.is_tripped}
              className={cn("w-full h-12", circuitBreakerStatus.is_tripped ? "bg-stone-300" : "bg-red-800")}
            >
              {isSubmitting ? 'Submitting...' : 'Submit Withdrawal Request'}
            </Button>
          </div>
        ) : (
          <div className="text-center space-y-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="text-green-600" size={32} />
            </div>
            <h3 className="text-xl font-bold text-green-700">Request Submitted!</h3>
            <Card className="p-4 bg-stone-50 text-left">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-stone-500">Request ID:</span>
                  <span className="font-mono">{result.request_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-500">Unlocks in:</span>
                  <span className="font-bold text-red-800">{formatTimeRemaining(result.seconds_remaining)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-500">L1 Block:</span>
                  <span className="font-mono">{result.l1_block_submitted}</span>
                </div>
              </div>
            </Card>
            <Button variant="outline" onClick={onClose} className="w-full">Close</Button>
          </div>
        )}

        {/* Pending Withdrawals */}
        {pendingWithdrawals.length > 0 && !result && (
          <div className="mt-6 pt-4 border-t border-amber-200">
            <h4 className="font-bold text-amber-900 mb-3 flex items-center gap-2">
              <Clock size={16} /> Pending Withdrawals
            </h4>
            <div className="space-y-2">
              {pendingWithdrawals.map((w, i) => (
                <div key={i} className="p-3 bg-stone-50 rounded-xl flex justify-between items-center">
                  <div>
                    <span className="font-mono text-sm">{w.request_id}</span>
                    <p className="text-xs text-stone-500">{formatTimeRemaining(w.seconds_remaining)} remaining</p>
                  </div>
                  <Badge tier={w.seconds_remaining <= 0 ? 'Ready' : 'Pending'} />
                </div>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};

// --- NEW COMPONENT: WEBSOCKET STATUS INDICATOR ---
const WebSocketStatusIndicator = () => {
  const { wsConnected } = useContext(GlobalContext);
  
  return (
    <div className={cn(
      "flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold",
      wsConnected ? "bg-green-100 text-green-700" : "bg-stone-100 text-stone-500"
    )}>
      {wsConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
      <span>{wsConnected ? 'L2 Connected' : 'Connecting...'}</span>
    </div>
  );
};

// --- RECEIVE MODAL WITH APT ADDRESS & QR ---
const ReceiveModal = ({ onClose, apartment }) => {
  const aptAddress = `kasvillage:apt${apartment}`;
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(aptAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Simple QR code representation (in production, use a QR library)
  const QRPlaceholder = () => (
    <div className="w-48 h-48 bg-white border-4 border-stone-900 rounded-xl flex items-center justify-center mx-auto relative">
      <div className="absolute inset-4 grid grid-cols-8 gap-0.5">
        {Array.from({ length: 64 }).map((_, i) => (
          <div 
            key={i} 
            className={cn(
              "aspect-square",
              Math.random() > 0.5 ? "bg-stone-900" : "bg-white"
            )}
          />
        ))}
      </div>
      <div className="absolute bg-white px-2 py-1 rounded">
        <QrCode size={24} className="text-stone-900"/>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-stone-900/90 backdrop-blur-md flex items-center justify-center p-4 z-50">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl"
      >
        <div className="bg-gradient-to-r from-amber-600 to-orange-600 p-6 text-white text-center">
          <h2 className="text-xl font-black flex items-center justify-center gap-2">
            <QrCode size={24}/> Receive KAS
          </h2>
          <p className="text-xs text-amber-100 mt-1">Share your apartment address to receive L2 payments</p>
        </div>

        <div className="p-6 space-y-6">
          {/* QR Code */}
          <div className="text-center">
            <QRPlaceholder />
            <p className="text-[10px] text-stone-400 mt-2">Scan to send KAS to this apartment</p>
          </div>

          {/* Apartment Address */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-500 uppercase">Your L2 Apartment Address</label>
            <div className="flex gap-2">
              <div className="flex-1 p-3 bg-stone-100 rounded-xl font-mono text-sm text-stone-800 break-all border-2 border-dashed border-stone-300">
                {aptAddress}
              </div>
              <button 
                onClick={handleCopy}
                className={cn(
                  "px-4 rounded-xl font-bold text-sm transition-all",
                  copied ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-800 hover:bg-amber-200"
                )}
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>

          {/* Apartment Number Display */}
          <div className="text-center p-4 bg-amber-50 rounded-xl border border-amber-200">
            <div className="text-xs text-amber-600 uppercase font-bold">Apartment Number</div>
            <div className="text-4xl font-black text-amber-900">{apartment}</div>
          </div>

          {/* How it works */}
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800">
            <strong>How L2 Deposits Work:</strong>
            <ul className="mt-1 space-y-1 list-disc list-inside">
              <li>Share your apartment address with the sender</li>
              <li>Sender initiates L2 transfer to your apartment</li>
              <li>Funds appear in your L2 balance instantly</li>
              <li>For L1→L2 bridge deposits, use the main deposit flow</li>
            </ul>
          </div>

          <Button onClick={onClose} variant="outline" className="w-full h-12">
            Close
          </Button>
        </div>
      </motion.div>
    </div>
  );
};

// --- NEW COMPONENT: PROTOCOL STATS BANNER ---
const ProtocolStatsBanner = () => {
  const { circuitBreakerStatus, pendingWithdrawals } = useContext(GlobalContext);
  
  return (
    <div className="px-6 mb-4">
      <div className="flex gap-2 overflow-x-auto pb-2">
        <div className="flex-shrink-0 px-3 py-2 bg-green-50 border border-green-200 rounded-xl">
          <div className="text-[10px] text-green-600 font-bold uppercase">Circuit Breaker</div>
          <div className="text-sm font-black text-green-800">
            {circuitBreakerStatus.is_tripped ? 'TRIPPED' : 'OK'}
          </div>
        </div>
        <div className="flex-shrink-0 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl">
          <div className="text-[10px] text-amber-600 font-bold uppercase">Pending Withdrawals</div>
          <div className="text-sm font-black text-amber-800">{pendingWithdrawals.length}</div>
        </div>
        <div className="flex-shrink-0 px-3 py-2 bg-blue-50 border border-blue-200 rounded-xl">
          <div className="text-[10px] text-blue-600 font-bold uppercase">Reorg Safety</div>
          <div className="text-sm font-black text-blue-800">{REORG_SAFETY_CONFIRMATIONS} blocks</div>
        </div>
        <div className="flex-shrink-0 px-3 py-2 bg-red-50 border border-red-200 rounded-xl">
          <div className="text-[10px] text-red-600 font-bold uppercase">Time Lock</div>
          <div className="text-sm font-black text-red-800">24h</div>
        </div>
      </div>
    </div>
  );
};

// --- NEW COMPONENT: MONTHLY ALLOCATION CARD ---
const MonthlyFeeCard = () => {
    const { user, paidMonthlyFee, setPaidMonthlyFee } = useContext(GlobalContext);

    const isMerchantTier = user.tier === 'Market Host' || user.tier === 'Trust Anchor'; 
    const feeUSD = isMerchantTier ? NODE_GAS_USD : SHOPPER_GAS_USD;
    const feeKAS = USD_TO_KAS(feeUSD).toFixed(2);
    const feeDescription = isMerchantTier ? "Market Host/Trust Anchor Subscription" : "Villager/Promoter Network Access Gas"; 

    const handlePayFee = () => {
        if (user.balance < feeKAS) {
            alert(`Insufficient balance! Requires ${feeKAS} KAS.`);
            return;
        }
        alert(`Simulating transaction: Sending ${feeKAS} KAS for the Monthly Network Allocation to Validators. Signature successful.`);
        setPaidMonthlyFee(true);
    };

    const getProgress = (current, target) => Math.min(100, (current / target) * 100).toFixed(0);

    const donationTargets = [
        { name: "Akash (Back-End Compute)", target: AKASH_DONATION_TARGET_AKT, current: CURRENT_DONATION_AKT, unit: "AKT", link: "https://akash.network/" },
        { name: "Flux (Frontend CDN)", target: FLUX_DONATION_TARGET, current: CURRENT_DONATION_FLUX, unit: "FLUX", link: "https://runonflux.io/" },
    ];

    return (
        <Card className={cn("p-4 border-2 shadow-lg space-y-4", paidMonthlyFee ? "bg-green-50 border-green-300" : "bg-red-50 border-red-300")}>
            <div>
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-lg font-black text-amber-900 flex items-center gap-2">
                        <Clock size={20} className={paidMonthlyFee ? "text-green-700" : "text-red-800"} /> 
                        PAY VALIDATOR <span className="text-xs text-red-700">| MONTHLY L2 ALLOCATION</span>
                    </h3>
                    <Badge tier={user.tier} />
                </div>
                
                <p className="text-sm text-amber-700 mb-3">{feeDescription}</p>

                {paidMonthlyFee ? (
                    <div className="text-green-700 font-black text-center py-2 bg-green-100 rounded-xl flex items-center justify-center gap-2">
                        <CheckCircle size={18} />
                        ALLOCATION PAID (Next Due: 1 Month)
                    </div>
                ) : (
                    <div className="flex justify-between items-center gap-3">
                        <div className="flex-1">
                            <span className="text-2xl font-black text-red-800">{feeKAS} KAS</span>
                            <span className="text-xs text-amber-700 block">($ {feeUSD.toFixed(2)} USD)</span>
                        </div>
                        <Button 
                            onClick={handlePayFee} 
                            variant="secondary" 
                            className="bg-red-800 h-10 px-6"
                        >
                            Pay {feeKAS} KAS
                        </Button>
                    </div>
                )}
            </div>

            <div className="pt-3 border-t border-amber-200">
                 <h4 className="text-sm font-black text-amber-900 mb-3 flex items-center gap-1">
                     <CloudSun size={16} className="text-blue-600"/> INFRASTRUCTURE <span className="text-xs text-red-700">| COMPUTE & CDN DONATIONS</span>
                 </h4>
                 
                 <div className="space-y-3">
                     {donationTargets.map((target) => (
                         <a key={target.name} href={target.link} target="_blank" rel="noopener noreferrer" className="block">
                             <div className="p-3 bg-white border border-amber-200 rounded-xl hover:bg-amber-50 transition-colors">
                                 <div className="flex justify-between items-center mb-1">
                                     <span className="text-sm font-bold text-amber-900">{target.name}</span>
                                     <span className="text-xs font-mono text-red-800">
                                         {target.current.toFixed(0)}/{target.target} {target.unit}
                                     </span>
                                 </div>
                                 <div className="w-full bg-amber-200 h-2 rounded-full overflow-hidden">
                                    <motion.div 
                                       className={cn("h-full", target.unit === 'AKT' ? 'bg-blue-600' : target.unit === 'FLUX' ? 'bg-purple-600' : 'bg-orange-600')} 
                                       style={{ width: `${getProgress(target.current, target.target)}%` }}
                                       initial={{ width: 0 }}
                                       animate={{ width: `${getProgress(target.current, target.target)}%` }}
                                       transition={{ duration: 1 }}
                                    />
                                 </div>
                                 <div className="mt-2 flex items-center justify-center text-xs text-blue-700 font-bold gap-1">
                                    Get {target.unit} on {target.unit === 'AKT' ? 'Akash' : 'Flux'} <Link size={12}/>
                                 </div>
                             </div>
                         </a>
                     ))}
                 </div>

                 <p className="text-xs text-amber-700 mt-4 text-center">
                    AKT & FLUX are needed to maintain decentralized infrastructure. Please consider contributing.
                 </p>
            </div>
        </Card>
    );
}

// --- DAPP TEMPLATE CODE (Copy-Paste Ready) ---
const DAPP_TEMPLATE_CODE = `// ═══════════════════════════════════════════════════════════════════════════
// KASVILLAGE L2 - DAPP/GAME INTEGRATION TEMPLATE
// ═══════════════════════════════════════════════════════════════════════════
// IDE: https://idx.google.com | Docs: https://kasvillage.dev/docs
// ═══════════════════════════════════════════════════════════════════════════

const kasvillage = new KasVillageL2({ 
  network: "mainnet", 
  endpoint: "https://api.kasvillage.dev" 
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. AUTHENTICATION - Connect wallet, get user session
// ─────────────────────────────────────────────────────────────────────────────
async function auth() {
  const session = await kasvillage.connect();
  return { 
    pubkey: session.pubkey,      // User's L2 public key
    apt: session.apartment,      // Apartment identifier  
    xp: session.xp,              // Experience points
    tier: session.tier           // Villager/Promoter/Custodian/MarketHost/TrustAnchor
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. SAVE STATE - Required for Quality Gate compliance
// ─────────────────────────────────────────────────────────────────────────────
async function saveState(state) {
  return kasvillage.commitState({ 
    gameId: "YOUR_GAME_ID",              // Replace with your unique game ID
    stateHash: hash(state),              // Hash of serialized state
    ts: Date.now()                       // Timestamp
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. LOAD STATE - Retrieve persisted game/app state
// ─────────────────────────────────────────────────────────────────────────────
async function loadState(userId) {
  return kasvillage.getState({ 
    gameId: "YOUR_GAME_ID", 
    userId: userId 
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. TRANSFER - L2 payments (No per-tx protocol fees - monthly subscription only)
// ─────────────────────────────────────────────────────────────────────────────
async function transfer(amount, recipient) {
  return kasvillage.transfer({ 
    amount: amount,           // Amount in KAS
    recipient: recipient,     // Recipient pubkey or apartment
    memo: "game_payment"      // Optional memo
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. SUBMIT QUALITY MANIFEST - For publishing to Village Board
// ─────────────────────────────────────────────────────────────────────────────
async function submitManifest(manifest) {
  const proof = await kasvillage.generateDAppProof({
    name: manifest.name,
    url: manifest.url,
    xpStake: manifest.stake,
    checks: { 
      endpointActive: true,      // URL returns 200/201/204
      hasMainMenu: true,         // UI is functional
      hasL2Sync: true,           // State sync implemented
      isFeatureComplete: true    // Game loop complete
    }
  });
  return kasvillage.submitManifest(proof);
}

// ═══════════════════════════════════════════════════════════════════════════
// QUALITY CHECKLIST (All required for Main/Elite Board):
// ═══════════════════════════════════════════════════════════════════════════
// [ ] URL returns 200 OK
// [ ] UI/Menu functional  
// [ ] L2 state sync implemented
// [ ] Game loop / core feature complete
// [ ] XP staked (500+ Incubator, 1000+ Main, 5000+ Elite)
// ═══════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// BOARDS & XP REQUIREMENTS:
// ─────────────────────────────────────────────────────────────────────────────
// Incubator Board:  500+ XP stake  → Testing/beta apps
// Main Board:      1000+ XP stake  → Verified apps
// Elite Board:     5000+ XP stake  → Premium placement
// ─────────────────────────────────────────────────────────────────────────────
`;

// --- DAPP MARKETPLACE DATA ---
const MOCK_DAPPS = [
  { 
    id: 1, 
    name: "Kaspa Quest", 
    category: "GameRPG", 
    board: "Elite",
    trustScore: 5200, 
    stakeKas: 520,
    owner: "Apt 42A",
    ownerPubkey: "02abc...def",
    description: "Open-world RPG with L2 item trading",
    availableForSwap: false,
    askingPrice: null,
    // Monthly Revenue -> Monthly Throughput
    monthlyThroughput: 1250,
    activeUsers: 340,
    url: "https://kaspquest.kasvillage.dev",
    sourceCodeUrl: "https://github.com/kasvillage/kaspa-quest", // For open source acknowledgment
    isOpenSource: true
  },
  { 
    id: 2, 
    name: "Village Chess", 
    category: "GameStrategy", 
    board: "Main",
    trustScore: 1500, 
    stakeKas: 150,
    owner: "Apt 18C",
    ownerPubkey: "02def...abc",
    description: "Provably fair chess with KAS rewards",
    availableForSwap: true,
    askingPrice: 2500,
    monthlyThroughput: 450,
    activeUsers: 120,
    url: "https://chess.kasvillage.dev",
    sourceCodeUrl: "https://github.com/kasvillage/village-chess",
    isOpenSource: true
  },
  { 
    id: 4, 
    name: "NFT Gallery", 
    category: "UtilityTool", 
    board: "Incubator",
    trustScore: 650, 
    stakeKas: 65,
    owner: "Apt 7B",
    ownerPubkey: "02ghi...jkl",
    description: "Display and trade NFTs on Kaspa L2",
    availableForSwap: true,
    askingPrice: 800,
    monthlyThroughput: 180,
    activeUsers: 45,
    url: "https://nftgallery.kasvillage.dev",
    sourceCodeUrl: null,
    isOpenSource: false
  }
];

// --- DAPP MARKETPLACE COMPONENT ---
const DAppMarketplace = ({ onClose, onOpenQualityGate }) => {
  const { user } = useContext(GlobalContext);
  const [activeBoard, setActiveBoard] = useState("All");
  const [showTemplate, setShowTemplate] = useState(false);
  const [selectedDApp, setSelectedDApp] = useState(null);
  const [showBuyModal, setShowBuyModal] = useState(null);
  const [showSellModal, setShowSellModal] = useState(false);
  const [myDApps, setMyDApps] = useState([]);
  
  // Sumsub KYC state
  const [kycStep, setKycStep] = useState(1); // 1: Info, 2: KYC, 3: Payment, 4: Complete
  const [sellerKycStatus, setSellerKycStatus] = useState('pending');
  const [buyerKycStatus, setBuyerKycStatus] = useState('not_started');

  const boards = ["All", "Elite", "Main", "Incubator"];
  
  const filteredDApps = MOCK_DAPPS.filter(d => 
    d.board !== "REJECTED" && (activeBoard === "All" || d.board === activeBoard)
  );

  const handleStartKyc = () => {
    setBuyerKycStatus('pending');
    // Simulate KYC completion after delay
    setTimeout(() => {
      setBuyerKycStatus('approved');
      setKycStep(3);
    }, 3000);
  };

  const handleLockPayment = () => {
    setKycStep(4);
  };

  const handleSwapDApp = (dapp) => {
    // Reset KYC state
    setKycStep(1);
    setBuyerKycStatus('not_started');
    setSellerKycStatus('approved'); // Assume seller already KYC'd
    setShowBuyModal(dapp);
  };

  const handleListForSwap = (askingPrice) => {
    alert(`Your DApp is now listed for swap at ${askingPrice} KAS.\n\nRecipients will see this in the marketplace.\nYou can delist anytime before swap.`);
    setShowSellModal(false);
  };

  return (
    <div className="fixed inset-0 bg-stone-900/95 backdrop-blur-md flex items-center justify-center p-4 z-50">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-gradient-to-b from-stone-50 to-amber-50 w-full max-w-4xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[95vh]"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-stone-950 via-stone-900 to-amber-950 p-6 text-white border-b border-amber-800/30">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-500 flex items-center gap-3">
                <PlayCircle size={28} className="text-amber-500"/> DApp & Game Directory
              </h2>
              <p className="text-xs text-stone-400 mt-1">Build, Publish, Transfer & Swap L2 Applications</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition">
              <X className="text-stone-400 hover:text-white"/>
            </button>
          </div>
          
          {/* Action Buttons */}
          <div className="flex gap-3 mt-4">
            <button 
              onClick={() => setShowTemplate(true)}
              className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded-xl text-sm font-bold transition"
            >
              <Code size={16}/> Get Template
            </button>
            <a 
              href="https://idx.google.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-sm font-bold transition"
            >
              <ExternalLink size={16}/> Open IDE (idx.google.com)
            </a>
            <button 
              onClick={onOpenQualityGate}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-500 rounded-xl text-sm font-bold transition"
            >
              <ShieldCheck size={16}/> Publish New DApp
            </button>
          </div>
        </div>

        {/* Board Tabs */}
        <div className="px-6 pt-4 flex gap-2 border-b border-amber-200 bg-white/50">
          {boards.map(board => (
            <button
              key={board}
              onClick={() => setActiveBoard(board)}
              className={cn(
                "px-4 py-2 text-sm font-bold rounded-t-xl transition border-b-2 -mb-px",
                activeBoard === board 
                  ? "bg-white border-amber-600 text-amber-900" 
                  : "bg-transparent border-transparent text-stone-500 hover:text-stone-800"
              )}
            >
              {board}
              {board !== "All" && (
                <span className={cn(
                  "ml-2 text-[10px] px-1.5 py-0.5 rounded",
                  board === "Elite" ? "bg-purple-100 text-purple-700" :
                  board === "Main" ? "bg-green-100 text-green-700" :
                  "bg-amber-100 text-amber-700"
                )}>
                  {board === "Elite" ? "5000+" : board === "Main" ? "1000+" : "500+"} XP
                </span>
              )}
            </button>
          ))}
        </div>

        {/* DApp Grid */}
        <div className="p-6 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredDApps.map(dapp => (
              <motion.div
                key={dapp.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "p-4 rounded-2xl border-2 transition-all hover:shadow-lg cursor-pointer",
                  dapp.availableForSwap 
                    ? "bg-gradient-to-br from-green-50 to-emerald-50 border-green-300 hover:border-green-500" 
                    : "bg-white border-stone-200 hover:border-amber-400"
                )}
                onClick={() => setSelectedDApp(dapp)}
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="font-black text-stone-900 text-lg">{dapp.name}</h3>
                    <p className="text-xs text-stone-500">{dapp.category} • {dapp.owner}</p>
                  </div>
                  <div className={cn(
                    "px-2 py-1 rounded-lg text-[10px] font-black uppercase",
                    dapp.board === "Elite" ? "bg-purple-100 text-purple-700" :
                    dapp.board === "Main" ? "bg-green-100 text-green-700" :
                    "bg-amber-100 text-amber-700"
                  )}>
                    {dapp.board}
                  </div>
                </div>
                
                <p className="text-sm text-stone-600 mb-3">{dapp.description}</p>
                
                <div className="grid grid-cols-3 gap-2 text-center mb-3">
                  <div className="bg-stone-50 p-2 rounded-lg">
                    <div className="text-xs text-stone-400">Trust</div>
                    <div className="font-black text-stone-800">{dapp.trustScore}</div>
                  </div>
                  <div className="bg-stone-50 p-2 rounded-lg">
                    <div className="text-xs text-stone-400">Users</div>
                    <div className="font-black text-stone-800">{dapp.activeUsers}</div>
                  </div>
                  <div className="bg-stone-50 p-2 rounded-lg">
                    <div className="text-xs text-stone-400">Throughput</div>
                    <div className="font-black text-stone-800">{dapp.monthlyThroughput}/mo</div>
                  </div>
                </div>

                {/* Visit DApp Button */}
                <a 
                  href={dapp.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="w-full mb-3 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-sm transition"
                >
                  <Globe size={16}/> Visit DApp <ExternalLink size={14}/>
                </a>
                
                {/* Open Source Indicator */}
                {dapp.isOpenSource && (
                  <div className="flex items-center justify-center gap-2 text-xs text-green-700 bg-green-50 px-3 py-1.5 rounded-lg border border-green-200 mb-3">
                    <Code size={14}/> Open Source
                    {dapp.sourceCodeUrl && (
                      <a 
                        href={dapp.sourceCodeUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="underline hover:text-green-900"
                      >
                        View Code
                      </a>
                    )}
                  </div>
                )}

                {dapp.availableForSwap && (
                  <div className="flex items-center justify-between p-3 bg-green-100 rounded-xl border border-green-200">
                    <div>
                      <span className="text-[10px] text-green-600 font-bold uppercase">Available for Swap</span>
                      <div className="text-lg font-black text-green-800">{dapp.askingPrice} KAS</div>
                    </div>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setShowBuyModal(dapp); }}
                      className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold text-sm transition"
                    >
                      Swap Rights
                    </button>
                  </div>
                )}
              </motion.div>
            ))}
          </div>

          {filteredDApps.length === 0 && (
            <div className="text-center py-12 text-stone-400">
              <PlayCircle size={48} className="mx-auto mb-4 opacity-50"/>
              <p>No DApps found in this category</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-stone-100 border-t border-stone-200 text-center">
          <p className="text-xs text-stone-500">
            <strong>Note:</strong> DApp/Game rights swaps are peer-to-peer. Originators set their own prices. 
            Swaps transfer rights, staked collateral, and all Trust XP to the recipient.
          </p>
        </div>

        {/* Template Modal */}
        <AnimatePresence>
          {showTemplate && (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[60]">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-stone-900 w-full max-w-3xl rounded-2xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col"
              >
                <div className="p-4 bg-stone-800 flex justify-between items-center border-b border-stone-700">
                  <h3 className="font-bold text-amber-400 flex items-center gap-2">
                    <Code size={18}/> DApp Integration Template
                  </h3>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(DAPP_TEMPLATE_CODE);
                        alert("Template copied to clipboard!");
                      }}
                      className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold transition"
                    >
                      Copy Code
                    </button>
                    <a 
                      href="https://idx.google.com" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1"
                    >
                      Open IDE <ExternalLink size={12}/>
                    </a>
                    <button onClick={() => setShowTemplate(false)} className="text-stone-400 hover:text-white">
                      <X size={20}/>
                    </button>
                  </div>
                </div>
                <div className="p-4 overflow-auto flex-1">
                  <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap leading-relaxed">
                    {DAPP_TEMPLATE_CODE}
                  </pre>
                </div>
                <div className="p-4 bg-stone-800 border-t border-stone-700">
                  <p className="text-xs text-stone-400 text-center">
                    <strong>Development Environment:</strong> Use <a href="https://idx.google.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">idx.google.com</a> for a free cloud IDE with instant preview.
                  </p>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Buy Modal with Sumsub KYC */}
        <AnimatePresence>
          {showBuyModal && (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[60]">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto"
              >
                <div className="p-6 bg-gradient-to-r from-green-600 to-emerald-600 text-white">
                  <h3 className="text-xl font-black">DApp Swap</h3>
                  <p className="text-sm text-green-100">"{showBuyModal.name}"</p>
                </div>
                
                {/* Progress Steps */}
                <div className="px-6 pt-4 pb-2 bg-stone-50 border-b">
                  <div className="flex items-center justify-between">
                    {['KYC Required', 'Verify Identity', 'Lock Payment', 'Complete'].map((label, i) => (
                      <div key={i} className="flex flex-col items-center">
                        <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold",
                          kycStep > i + 1 ? "bg-green-500 text-white" : 
                          kycStep === i + 1 ? "bg-green-600 text-white" : 
                          "bg-stone-200 text-stone-500"
                        )}>
                          {kycStep > i + 1 ? '✓' : i + 1}
                        </div>
                        <span className="text-[9px] mt-1 text-stone-500 text-center w-16">{label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-6 space-y-4">
                  {/* Step 1: KYC Required Info */}
                  {kycStep === 1 && (
                    <>
                      <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                        <div className="flex items-center gap-2 mb-2">
                          <ShieldCheck className="text-red-600" size={20} />
                          <span className="font-bold text-red-800">KYC Required for DApp Swap</span>
                        </div>
                        <p className="text-xs text-red-700">
                          DApp swaps involve transferring business ownership and revenue streams. 
                          Both buyer and seller must complete Sumsub identity verification to comply with regulations.
                        </p>
                      </div>

                      {/* NOT ESCROW - Clarification */}
                      <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                        <div className="flex items-center gap-2 mb-2">
                          <Lock className="text-blue-600" size={18} />
                          <span className="font-bold text-blue-800 text-sm">How Funds Are Secured</span>
                        </div>
                        <p className="text-xs text-blue-700 mb-2">
                          <strong>This is NOT an escrow.</strong> Your KAS stays in YOUR wallet, locked by a smart contract.
                        </p>
                        <ul className="text-xs text-blue-600 space-y-1">
                          <li>✓ Funds locked in <strong>your own L2 wallet</strong></li>
                          <li>✓ Released when <strong>both parties agree</strong></li>
                          <li>✓ No third party holds your funds</li>
                          <li>✓ Non-custodial mutual release mechanism</li>
                        </ul>
                      </div>

                      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                        <h4 className="font-bold text-amber-800 text-sm mb-2">Why is KYC Required?</h4>
                        <ul className="text-xs text-amber-700 space-y-1">
                          <li>• Money transmission regulations</li>
                          <li>• Business ownership transfer requirements</li>
                          <li>• Anti-money laundering (AML) compliance</li>
                          <li>• Protects both buyer and seller legally</li>
                        </ul>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="bg-stone-50 p-3 rounded-xl">
                          <div className="text-xs text-stone-400">Asking Price</div>
                          <div className="font-black text-green-700">{showBuyModal.askingPrice} KAS</div>
                        </div>
                        <div className="bg-stone-50 p-3 rounded-xl">
                          <div className="text-xs text-stone-400">Includes Stake</div>
                          <div className="font-black text-stone-800">{showBuyModal.stakeKas} KAS</div>
                        </div>
                      </div>

                      <div className="p-3 bg-stone-100 rounded-xl">
                        <h4 className="font-bold text-stone-700 text-sm mb-2">KYC Status</h4>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm">Seller:</span>
                            <span className="text-sm font-bold text-green-600 bg-green-100 px-2 py-1 rounded">✓ Verified</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm">You (Buyer):</span>
                            <span className="text-sm font-bold text-amber-600 bg-amber-100 px-2 py-1 rounded">⚠ Required</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-3">
                        <button 
                          onClick={() => setShowBuyModal(null)}
                          className="flex-1 py-3 border border-stone-300 rounded-xl font-bold text-stone-600 hover:bg-stone-50 transition"
                        >
                          Cancel
                        </button>
                        <button 
                          onClick={() => setKycStep(2)}
                          className="flex-1 py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold transition"
                        >
                          Start KYC Verification
                        </button>
                      </div>
                    </>
                  )}

                  {/* Step 2: Sumsub KYC */}
                  {kycStep === 2 && (
                    <>
                      <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-center">
                        <img 
                          src="https://sumsub.com/wp-content/uploads/2023/07/sumsub-logo.svg" 
                          alt="Sumsub" 
                          className="h-8 mx-auto mb-3"
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                        <h4 className="font-bold text-blue-800">Identity Verification</h4>
                        <p className="text-xs text-blue-600 mt-1">Powered by Sumsub</p>
                      </div>

                      {buyerKycStatus === 'not_started' && (
                        <>
                          <div className="p-4 bg-stone-50 rounded-xl">
                            <h4 className="font-bold text-stone-700 text-sm mb-2">What you'll need:</h4>
                            <ul className="text-xs text-stone-600 space-y-1">
                              <li>✓ Government-issued ID (passport, driver's license)</li>
                              <li>✓ Selfie for facial verification</li>
                              <li>✓ Proof of address (utility bill, bank statement)</li>
                            </ul>
                          </div>

                          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                            <strong>Privacy:</strong> Your documents are processed by Sumsub and not stored by KasVillage. 
                            Verification typically takes 2-5 minutes.
                          </div>

                          <Button onClick={handleStartKyc} className="w-full h-12 bg-blue-600 hover:bg-blue-500">
                            Open Sumsub Verification
                          </Button>
                        </>
                      )}

                      {buyerKycStatus === 'pending' && (
                        <div className="text-center py-8">
                          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                            <Hourglass className="text-blue-600" size={32} />
                          </div>
                          <h4 className="font-bold text-stone-800">Verifying your identity...</h4>
                          <p className="text-sm text-stone-500 mt-2">This usually takes 2-5 minutes</p>
                          <div className="mt-4 w-full bg-stone-200 rounded-full h-2">
                            <div className="bg-blue-600 h-2 rounded-full animate-pulse" style={{ width: '60%' }}></div>
                          </div>
                        </div>
                      )}

                      <button 
                        onClick={() => setKycStep(1)}
                        className="w-full text-center text-sm text-stone-500 hover:text-stone-700 underline"
                      >
                        ← Go back
                      </button>
                    </>
                  )}

                  {/* Step 3: Lock Payment */}
                  {kycStep === 3 && (
                    <>
                      <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-center">
                        <CheckCircle className="text-green-600 mx-auto mb-2" size={32} />
                        <h4 className="font-bold text-green-800">KYC Approved!</h4>
                        <p className="text-xs text-green-600 mt-1">Both parties verified. Ready to proceed.</p>
                      </div>

                      <div className="p-3 bg-stone-100 rounded-xl">
                        <h4 className="font-bold text-stone-700 text-sm mb-2">KYC Status</h4>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-sm">Seller:</span>
                            <span className="text-sm font-bold text-green-600 bg-green-100 px-2 py-1 rounded">✓ Verified</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm">You (Buyer):</span>
                            <span className="text-sm font-bold text-green-600 bg-green-100 px-2 py-1 rounded">✓ Verified</span>
                          </div>
                        </div>
                      </div>

                      {/* Open Source Code Release Acknowledgment */}
                      {showBuyModal.isOpenSource && (
                        <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl">
                          <div className="flex items-center gap-2 mb-2">
                            <Code className="text-purple-600" size={20} />
                            <h4 className="font-bold text-purple-800 text-sm">Open Source Code Release</h4>
                          </div>
                          <p className="text-xs text-purple-700 mb-3">
                            This DApp includes open source code. By completing this swap, you acknowledge that:
                          </p>
                          <ul className="text-xs text-purple-600 space-y-1 mb-3">
                            <li>• Source code location: <strong>{showBuyModal.sourceCodeUrl || 'Included in transfer'}</strong></li>
                            <li>• Code release is documented on the Merkle tree</li>
                            <li>• You accept responsibility for maintaining open source compliance</li>
                          </ul>
                          <label className="flex items-center gap-2 p-2 bg-white rounded-lg border border-purple-200 cursor-pointer">
                            <input 
                              type="checkbox" 
                              className="w-4 h-4 accent-purple-600"
                              id="openSourceAck"
                            />
                            <span className="text-xs font-bold text-purple-800">
                              I acknowledge the open source code release terms
                            </span>
                          </label>
                        </div>
                      )}

                      {/* Legal Disclaimer - Offline Documentation */}
                      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                        <div className="flex items-center gap-2 mb-2">
                          <FileText className="text-amber-600" size={20} />
                          <h4 className="font-bold text-amber-800 text-sm">Legal Documentation Notice</h4>
                        </div>
                        <p className="text-xs text-amber-700 mb-3">
                          <strong>Important:</strong> All other legal documentation for this rights swap transaction 
                          is completed <strong>offline</strong> between buyer and seller.
                        </p>
                        <div className="text-xs text-amber-600 space-y-1 border-l-2 border-amber-300 pl-2">
                          <p><strong>What we document on-chain:</strong></p>
                          <p>✓ A swap transaction for rights was executed</p>
                          <p>✓ Code source release was documented (if applicable)</p>
                          <p>✓ Transaction recorded on Merkle tree</p>
                        </div>
                        <label className="flex items-center gap-2 p-2 bg-white rounded-lg border border-amber-200 cursor-pointer mt-3">
                          <input 
                            type="checkbox" 
                            className="w-4 h-4 accent-amber-600"
                            id="legalAck"
                          />
                          <span className="text-xs font-bold text-amber-800">
                            I understand offline legal documentation is my responsibility
                          </span>
                        </label>
                      </div>

                      <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl">
                        <h4 className="font-bold text-stone-700 text-sm mb-2">Transaction Summary</h4>
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between"><span>DApp:</span><span className="font-bold">{showBuyModal.name}</span></div>
                          <div className="flex justify-between"><span>Price:</span><span className="font-bold text-green-700">{showBuyModal.askingPrice} KAS</span></div>
                          <div className="flex justify-between"><span>Includes Stake:</span><span className="font-bold">{showBuyModal.stakeKas} KAS</span></div>
                          <div className="flex justify-between"><span>Trust XP:</span><span className="font-bold text-purple-700">{showBuyModal.trustScore}</span></div>
                          {showBuyModal.isOpenSource && (
                            <div className="flex justify-between"><span>Source Code:</span><span className="font-bold text-green-600">✓ Open Source</span></div>
                          )}
                        </div>
                      </div>

                      <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800">
                        <strong>What happens next:</strong> Your payment will be locked until the DApp ownership 
                        transfer is verified on-chain. This typically takes 1-2 minutes.
                      </div>

                      <div className="flex gap-3">
                        <button 
                          onClick={() => setShowBuyModal(null)}
                          className="flex-1 py-3 border border-stone-300 rounded-xl font-bold text-stone-600 hover:bg-stone-50 transition"
                        >
                          Cancel
                        </button>
                        <button 
                          onClick={handleLockPayment}
                          className="flex-1 py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold transition"
                        >
                          Lock {showBuyModal.askingPrice} KAS & Swap
                        </button>
                      </div>
                    </>
                  )}

                  {/* Step 4: Complete */}
                  {kycStep === 4 && (
                    <div className="text-center py-4">
                      <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle className="text-green-600" size={40} />
                      </div>
                      <h3 className="text-2xl font-black text-green-700">Swap Complete!</h3>
                      <p className="text-sm text-stone-500 mt-2">You are now the owner of "{showBuyModal.name}"</p>
                      
                      <div className="mt-6 p-4 bg-stone-50 rounded-xl text-left space-y-2 text-sm">
                        <div className="flex justify-between"><span className="text-stone-500">DApp:</span><span className="font-bold">{showBuyModal.name}</span></div>
                        <div className="flex justify-between"><span className="text-stone-500">Paid:</span><span className="font-bold text-green-700">{showBuyModal.askingPrice} KAS</span></div>
                        <div className="flex justify-between"><span className="text-stone-500">Stake Received:</span><span className="font-bold">{showBuyModal.stakeKas} KAS</span></div>
                        <div className="flex justify-between"><span className="text-stone-500">Trust XP:</span><span className="font-bold text-purple-700">+{showBuyModal.trustScore}</span></div>
                      </div>

                      <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                        <strong>Important:</strong> You now have full responsibility for maintaining this DApp, 
                        including the staked collateral and user base.
                      </div>

                      <Button onClick={() => setShowBuyModal(null)} className="w-full h-12 bg-green-600 mt-6">
                        Close
                      </Button>
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

// --- NEW COMPONENT: QUALITY GATE MODAL ---
const QualityGateModal = ({ onClose, onPublish }) => {
  const { user } = useContext(GlobalContext);
  const [isChecking, setIsChecking] = useState(false);
  const [step, setStep] = useState(1);
  const [auditorInput, setAuditorInput] = useState("");
  
  const [manifest, setManifest] = useState({
    name: "",
    gameUrl: "https://dapp-mock-link.com",
    category: "GameRPG",
    description: "",
    codeHash: "",
    stakeAmount: 100, 
    lockDuration: 12, 
    auditors: [],
    checks: {
        endpointActive: false,
        hasMainMenu: false,
        hasL2Sync: false,
        isFeatureComplete: false
    }
  });

  const XP_PER_KAS = 10; 
  const trustFromStake = manifest.stakeAmount * XP_PER_KAS;
  const isElite = trustFromStake >= 5000;
  const isVerified = trustFromStake >= 1000;

  const runHealthCheck = () => {
    setIsChecking(true);
    setTimeout(() => {
        setManifest(prev => ({
            ...prev, 
            checks: { ...prev.checks, endpointActive: true }
        }));
        setIsChecking(false);
    }, 2000);
  };

  const handleAddAuditor = () => {
      if(auditorInput.length > 5) {
          setManifest(prev => ({...prev, auditors: [...prev.auditors, { address: auditorInput, status: 'Pending Sig' }]}));
          setAuditorInput("");
      }
  };

  const handleStake = () => {
      alert(`Initiating Time-Lock Contract for ${manifest.stakeAmount} KAS...`);
      setTimeout(() => setStep(3), 1000);
  };

  const getProjectedBoard = () => {
      if (manifest.stakeAmount >= 500 && manifest.checks.endpointActive) return { name: "ELITE BOARD", color: "text-purple-600", bg: "bg-purple-100", xpMin: 5000 };
      if (manifest.stakeAmount >= 100 && manifest.checks.endpointActive) return { name: "MAIN BOARD", color: "text-green-600", bg: "bg-green-100", xpMin: 1000 };
      return { name: "INCUBATOR", color: "text-amber-600", bg: "bg-amber-100", xpMin: 500 };
  };

  const board = getProjectedBoard();
  
  // Check for prohibited content
  const hasProhibitedContent = containsRestrictedContent(manifest.name) || 
                                containsRestrictedContent(manifest.description) ||
                                PROHIBITED_CATEGORIES.includes(manifest.category);
  
  const canProceed = manifest.checks.endpointActive && 
                     manifest.checks.hasMainMenu && 
                     manifest.checks.hasL2Sync &&
                     !hasProhibitedContent;

  return (
    <div className="fixed inset-0 bg-stone-900/90 backdrop-blur-md flex items-center justify-center p-4 z-50">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white w-full max-w-xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
      >
        <div className="bg-stone-950 p-6 text-white border-b border-stone-800 flex justify-between items-start">
            <div>
                <h2 className="text-xl font-black text-amber-500 flex items-center gap-2">
                    <ShieldCheck /> DApp Quality Gate
                </h2>
                <p className="text-xs text-stone-400">Step {step} of 3: Defining Trust Signals</p>
            </div>
            <button onClick={onClose}><X className="text-stone-500 hover:text-white"/></button>
        </div>

        <div className="p-6 overflow-y-auto">
            
            {step === 1 && (
                <div className="space-y-6">
                    <div>
                        <label className="text-xs font-bold text-stone-500 uppercase">App Name</label>
                         <input 
                            className="w-full p-3 bg-stone-50 rounded-xl border border-stone-200 font-bold" 
                            placeholder="e.g. Kaspa Quest"
                            value={manifest.name}
                            onChange={e => setManifest({...manifest, name: e.target.value})}
                        />
                    </div>
                    
                    <div>
                        <label className="text-xs font-bold text-stone-500 uppercase">Category (Strict)</label>
                        <select 
                            className="w-full p-3 bg-stone-50 rounded-xl border border-stone-200"
                            value={manifest.category}
                            onChange={e => setManifest({...manifest, category: e.target.value})}
                        >
                            <option value="GameRPG">Game: RPG / Adventure</option>
                            <option value="GameStrategy">Game: Strategy / RTS</option>
                            <option value="GameSports">Game: Sports</option>
                            <option value="UtilityTool">Utility / Tool</option>
                        </select>
                        <p className="text-[10px] text-stone-400 mt-1">Prohibited content apps are automatically rejected by the protocol.</p>
                    </div>
                    
                    {/* Prohibited Content Warning */}
                    {hasProhibitedContent && (
                      <div className="p-4 bg-red-50 border-2 border-red-300 rounded-xl">
                        <div className="flex items-center gap-2 mb-2">
                          <Ban className="text-red-600" size={20} />
                          <span className="font-bold text-red-800">Prohibited Content Detected</span>
                        </div>
                        <p className="text-xs text-red-700">
                          Your DApp name or description contains restricted terms. The following content is prohibited:
                        </p>
                        <ul className="text-xs text-red-600 mt-2 space-y-1">
                          <li>• Gambling, casino, slots, poker, blackjack, roulette</li>
                          <li>• Betting, wagering, sportsbook, bookmaker</li>
                          <li>• Lottery, raffle, jackpot</li>
                        </ul>
                        <p className="text-xs text-red-800 mt-2 font-bold">
                          Please modify your content to proceed with submission.
                        </p>
                      </div>
                    )}

                    <div>
                        <h3 className="text-sm font-bold text-stone-900 uppercase mb-3 flex items-center gap-2">
                            <Activity size={16}/> Live Connection Test
                        </h3>
                        <div className="flex gap-2">
                            <input 
                                type="url" 
                                value={manifest.gameUrl}
                                onChange={(e) => setManifest({...manifest, gameUrl: e.target.value})}
                                className="flex-1 p-3 bg-stone-50 border border-stone-200 rounded-xl text-sm font-mono text-stone-700 focus:ring-2 focus:ring-amber-500 outline-none"
                            />
                            <button 
                                onClick={runHealthCheck}
                                disabled={isChecking || manifest.checks.endpointActive}
                                className={cn(
                                    "px-4 rounded-xl font-bold text-xs transition-all",
                                    manifest.checks.endpointActive 
                                        ? 'bg-green-100 text-green-700' 
                                        : 'bg-stone-900 text-white hover:bg-stone-700'
                                )}
                            >
                                {isChecking ? "Pinging..." : manifest.checks.endpointActive ? "Online" : "Test URL"}
                            </button>
                        </div>
                    </div>

                    <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200">
                        <h3 className="text-sm font-bold text-stone-900 uppercase mb-3 flex items-center gap-2">
                            <Layout size={16}/> Functionality Manifesto
                        </h3>
                        <div className="space-y-3">
                            <label className="flex items-center gap-3 p-3 bg-white rounded-xl border border-stone-100 cursor-pointer hover:border-amber-300 transition">
                                <input 
                                    type="checkbox" 
                                    className="w-5 h-5 accent-amber-600"
                                    checked={manifest.checks.hasMainMenu}
                                    onChange={(e) => setManifest(prev => ({...prev, checks: {...prev.checks, hasMainMenu: e.target.checked}}))}
                                />
                                <span className="text-sm font-medium text-stone-700">UI/Menu is functional</span>
                            </label>

                            <label className="flex items-center gap-3 p-3 bg-white rounded-xl border border-stone-100 cursor-pointer hover:border-amber-300 transition">
                                <input 
                                    type="checkbox" 
                                    className="w-5 h-5 accent-amber-600"
                                    checked={manifest.checks.hasL2Sync}
                                    onChange={(e) => setManifest(prev => ({...prev, checks: {...prev.checks, hasL2Sync: e.target.checked}}))}
                                />
                                <span className="text-sm font-medium text-stone-700">L2 Save/Sync Logic is implemented</span>
                            </label>
                        </div>
                    </div>

                    <button 
                        onClick={() => setStep(2)} 
                        disabled={!canProceed}
                        className={cn(
                            "w-full py-4 rounded-xl font-bold text-sm shadow-xl flex items-center justify-center gap-2 transition-all",
                            canProceed
                                ? 'bg-stone-900 text-white hover:bg-stone-800 transform active:scale-95'
                                : 'bg-stone-200 text-stone-400 cursor-not-allowed'
                        )}
                    >
                        Next: Safety & Audits
                    </button>
                </div>
            )}

            {step === 2 && (
              <div className="space-y-6">
                
                <div className="bg-stone-50 p-5 rounded-2xl border-2 border-stone-200">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-black text-stone-800 flex items-center gap-2">
                            <Lock className="text-amber-600" size={20}/> 
                            Collateral Exchange
                        </h3>
                        <div className="text-xs font-bold bg-amber-100 text-amber-800 px-2 py-1 rounded">
                            Rate: 1 KAS = {XP_PER_KAS} Trust XP
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="flex-1">
                            <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">You Lock (KAS)</label>
                            <input 
                                type="number" 
                                className="w-full text-2xl font-black text-stone-900 bg-transparent border-b-2 border-stone-300 focus:border-amber-500 outline-none py-2"
                                value={manifest.stakeAmount}
                                onChange={e => setManifest({...manifest, stakeAmount: Number(e.target.value)})}
                                min="100"
                            />
                        </div>

                        <div className="text-stone-300">➔</div>

                        <div className="flex-1 text-right">
                            <label className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">You Gain (Trust XP)</label>
                            <div className={`text-2xl font-black ${isElite ? 'text-purple-600' : isVerified ? 'text-green-600' : 'text-stone-600'}`}>
                                {trustFromStake.toLocaleString()} XP
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 h-2 w-full bg-stone-200 rounded-full overflow-hidden relative">
                        <div 
                            className={`h-full transition-all duration-500 ${isElite ? 'bg-purple-500' : isVerified ? 'bg-green-500' : 'bg-amber-500'}`}
                            style={{ width: `${Math.min((trustFromStake / 5000) * 100, 100)}%` }}
                        ></div>
                    </div>
                    <div className="flex justify-between text-[10px] font-bold text-stone-400 mt-2 uppercase">
                        <span>Min (100 KAS)</span>
                        <span className={isVerified ? 'text-green-600' : ''}>Verified (1000 Trust XP)</span>
                        <span className={isElite ? 'text-purple-600' : ''}>Elite (5000 Trust XP)</span>
                    </div>
                </div>

                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex gap-3">
                    <ShieldCheck className="text-blue-600 shrink-0" size={20} />
                    <div className="text-xs text-blue-900">
                        <p className="font-bold mb-1">How this works:</p>
                        <p>Your <strong>{manifest.stakeAmount} KAS</strong> is locked in the L2 Protocol for <strong>{manifest.lockDuration} months</strong>.</p>
                        <p className="mt-1">In exchange, your DApp receives a <strong>Trust Score of {trustFromStake}</strong>. If your DApp is malicious, this KAS is slashed (burned).</p>
                    </div>
                </div>

                <div>
                    <label className="text-xs font-bold text-stone-500 uppercase">Auditor Signatures (Optional Boost)</label>
                    <div className="flex gap-2 mb-2 mt-1">
                        <input 
                            className="flex-1 p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs font-mono"
                            placeholder="Auditor Apt # or Pubkey..."
                            value={auditorInput}
                            onChange={e => setAuditorInput(e.target.value)}
                        />
                        <button onClick={handleAddAuditor} className="bg-stone-200 hover:bg-stone-300 px-4 rounded-xl font-bold text-stone-600 transition">+</button>
                    </div>
                    <div className="space-y-1">
                            {manifest.auditors.map((aud, i) => (
                                <div key={i} className="flex justify-between text-xs bg-stone-50 p-2 rounded border border-stone-100">
                                    <span className="font-mono">{aud.address.substring(0, 10)}...</span>
                                    <span className="text-orange-500 font-bold">{aud.status}</span>
                                </div>
                            ))}
                            {manifest.auditors.length === 0 && <p className="text-xs text-stone-400 italic">No audits requested.</p>}
                    </div>
                </div>

                <button onClick={handleStake} className="w-full py-4 bg-stone-900 text-white font-bold rounded-xl shadow-xl hover:bg-stone-800 transition transform active:scale-95">
                    Confirm Exchange & Lock Funds
                </button>
              </div>
            )}

            {step === 3 && (
                <div className="text-center">
                    <div className="w-24 h-24 rounded-full border-4 border-stone-100 flex items-center justify-center mx-auto mb-4 relative">
                        <div className="text-3xl font-black text-stone-800">{trustFromStake}</div>
                        <div className="text-[9px] absolute bottom-4 font-bold text-stone-400">TRUST SCORE</div>
                    </div>
                    
                    <h3 className="text-lg font-bold text-stone-900">Ready to Publish?</h3>
                    <p className="text-sm text-stone-500 mb-6">
                        Your manifest will be inscribed on L2. <br/>
                        Prohibited content categories will be auto-rejected.
                    </p>

                    <div className="grid grid-cols-2 gap-4 text-left text-xs bg-stone-50 p-4 rounded-xl mb-6">
                        <div>
                            <span className="block text-stone-400">Stake</span>
                            <span className="font-bold">{manifest.stakeAmount} KAS</span>
                        </div>
                         <div>
                            <span className="block text-stone-400">Audits</span>
                            <span className="font-bold">{manifest.auditors.length} Signatures</span>
                        </div>
                         <div>
                            <span className="block text-stone-400">Category</span>
                            <span className="font-bold">{manifest.category}</span>
                        </div>
                         <div>
                            <span className="block text-stone-400">Variety Check</span>
                            <span className="font-bold text-green-600">PASSED</span>
                        </div>
                    </div>

                    <button 
                        onClick={() => onPublish({...manifest, targetBoard: board})}
                        className="w-full py-4 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl shadow-lg shadow-green-200 flex items-center justify-center gap-2"
                    >
                        <ShieldCheck size={20}/> Publish to Village Board
                    </button>
                </div>
            )}

        </div>
      </motion.div>
    </div>
  );
};

// --- 15. MAIN DASHBOARD ---

const Dashboard = () => {
  const { 
    user, login, isAuthenticated, needsChallenge, setNeedsChallenge, 
    showTransactionSigner, setShowTransactionSigner, securityStep, 
    paidMonthlyFee, circuitBreakerStatus, pendingWithdrawals, activeConsignments,
    // Clickwrap & geo-blocking
    geoBlocked, userCountry, showClickwrap, setShowClickwrap, signClickwrap
  } = useContext(GlobalContext);
  const [activeTab, setActiveTab] = useState("wallet");
  const [showIdentity, setShowIdentity] = useState(false);
  const [activeHost, setActiveHost] = useState(null); 
  const [activeDApp, setActiveDApp] = useState(null); 
  
  const [showWithdrawalModal, setShowWithdrawalModal] = useState(false);
  // Removed: showConsignmentHold - mutual release replaces hold system
  const [showDAppMarketplace, setShowDAppMarketplace] = useState(false);
  const [showQualityGate, setShowQualityGate] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showMutualPayment, setShowMutualPayment] = useState(false);
  const [showTradeFi, setShowTradeFi] = useState(false);
  const [showOnRamp, setShowOnRamp] = useState(false);
  const [rampMode, setRampMode] = useState('deposit'); // 'deposit' or 'withdraw'
  
  const xpInfo = getXpInfo(user.xp);
  const userHostNode = MOCK_HOST_NODES.find(s => s.owner_tier === user.tier);
  const isHostOwner = !!userHostNode;

  const isMerchantTier = user.tier === 'Market Host' || user.tier === 'Trust Anchor';
  const monthlyFeeText = isMerchantTier ? "$3.45" : "$0.05";
  const feeType = isMerchantTier ? "Market Host/Trust Anchor" : "Villager/Promoter (Base)";

  const openHostNodeInterface = (hostData) => { setActiveHost(hostData); };
  const openAcademicProfile = () => { setActiveDApp('academics'); };

  // Geo-blocked users see 403 screen
  if (geoBlocked) {
    return <GeoBlockScreen countryCode={userCountry} />;
  }

  // Show clickwrap modal if triggered
  if (showClickwrap) {
    return (
      <ClickwrapModal 
        onSign={signClickwrap}
        onCancel={() => setShowClickwrap(false)}
      />
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="h-screen flex flex-col items-center justify-center p-6 bg-amber-50">
        <h1 className="text-3xl font-black text-amber-900 mb-2">KasVillage L2</h1>
        <Button onClick={login} className="w-full max-w-xs h-12 text-lg">Connect Layer 1 Wallet (Kaspa)</Button>
        {securityStep > 0 && <SecurityCheckModal />}
      </div>
    );
  }

  const MailboxTabContent = ({ openHost, onOpenDAppMarketplace }) => {
    const [couponSearch, setCouponSearch] = useState("");
    const [academicSearch, setAcademicSearch] = useState("");
    const [dappSearch, setDappSearch] = useState("");

    const [coupons, setCoupons] = useState([]);
    useEffect(() => { api.getCoupons().then(setCoupons); }, []);

    const filteredCoupons = coupons.filter(coupon => 
      coupon.item_name.toLowerCase().includes(couponSearch.toLowerCase()) || 
      coupon.title.toLowerCase().includes(couponSearch.toLowerCase())
    );
    
    const MOCK_ACADEMIC_RESULTS = [
        { title: "BlockDAG Consensus Auditing", author: "Dr. Sharma", apt: "320", type: "Consulting", cost: 500, flat_rate: true },
        { title: "Psychology of Decentralized Identity", author: "Prof. Jones", apt: "101", type: "Paper Review", cost: 0, flat_rate: false },
        { title: "KAS Layer 2 Scaling Statistics", author: "Anon Dev", apt: "9B", type: "Analytics", cost: 120, flat_rate: false },
        { title: "Corporate Accounting Audit", author: "CPA Smith", apt: "14C", type: "Auditing", cost: 800, flat_rate: true },
        { title: "Biology Class - Cellular Basics", author: "Student TA", apt: "05D", type: "Classes", cost: 40, flat_rate: false },
        { title: "Applied Math: Risk Analysis", author: "Prof. Delta", apt: "22A", type: "Statistics", cost: 250, flat_rate: true },
        { title: "Legal Regulatory Compliance", author: "J. Doe", apt: "12A", type: "Legal Consulting", cost: 600, flat_rate: true },
        { title: "Career & Academic Counseling", author: "Counselor A", apt: "33C", type: "Counseling", cost: 50, flat_rate: false },
    ];
    
    const filteredAcademicResults = MOCK_ACADEMIC_RESULTS.filter(item => {
        const query = academicSearch.toLowerCase();
        return query === "" || 
               item.title.toLowerCase().includes(query) || 
               item.type.toLowerCase().includes(query) || 
               item.author.toLowerCase().includes(query) ||
               query.includes(item.type.toLowerCase()) ||
               (query.includes('auditing') && item.type.toLowerCase().includes('audit')) ||
               (query.includes('statistics') && item.type.toLowerCase().includes('analytic')); 
    });

    // Filter DApps (excluding rejected apps)
    const filteredDApps = MOCK_DAPPS.filter(d => {
        if (d.board === "REJECTED") return false;
        const query = dappSearch.toLowerCase();
        return query === "" ||
               d.name.toLowerCase().includes(query) ||
               d.category.toLowerCase().includes(query) ||
               d.description.toLowerCase().includes(query);
    });

    return (
      <div className="space-y-8 pt-4 pb-8">
        <div className="px-6">
           <h2 className="text-2xl font-black text-amber-900">Village Mailbox</h2>
           <p className="text-sm text-amber-700">Deals, proposals, DApps, and requests feed.</p>
        </div>

        {/* DApps & Games Section */}
        <div className="px-6 space-y-3">
           <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                 <PlayCircle className="text-purple-600" size={20} />
                 <span className="font-black text-lg text-purple-900">DApps & Games</span>
              </div>
              <button 
                onClick={onOpenDAppMarketplace}
                className="text-xs font-bold text-purple-600 hover:text-purple-800 flex items-center gap-1"
              >
                View All <ArrowRight size={14}/>
              </button>
           </div>
           
           <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-[10px] text-red-700">
              <strong>⚠️ Compliance Notice:</strong> Prohibited content apps are restricted and auto-rejected by protocol for regulatory compliance.
           </div>

           <div className="flex gap-2">
              <input 
                 type="text" 
                 placeholder="Search DApps, Games..." 
                 value={dappSearch} 
                 onChange={(e) => setDappSearch(e.target.value)} 
                 className="w-full p-3 rounded-xl border border-purple-200 bg-white outline-none focus:ring-2 focus:ring-purple-500" 
              />
              <Button className="w-12 h-12 p-0 bg-purple-600"><Search size={20} /></Button>
           </div>

           <div className="grid grid-cols-2 gap-3">
              {filteredDApps.slice(0, 4).map(dapp => (
                 <motion.div 
                    key={dapp.id} 
                    whileTap={{ scale: 0.98 }} 
                    onClick={onOpenDAppMarketplace}
                    className={cn(
                       "p-3 rounded-xl border cursor-pointer transition-all hover:shadow-md",
                       dapp.availableForSwap 
                         ? "bg-gradient-to-br from-green-50 to-emerald-50 border-green-300" 
                         : "bg-white border-purple-200"
                    )}
                 >
                    <div className="flex justify-between items-start mb-2">
                       <span className={cn(
                          "text-[9px] font-bold px-1.5 py-0.5 rounded uppercase",
                          dapp.board === "Elite" ? "bg-purple-100 text-purple-700" :
                          dapp.board === "Main" ? "bg-green-100 text-green-700" :
                          "bg-amber-100 text-amber-700"
                       )}>{dapp.board}</span>
                       {dapp.availableForSwap && <span className="text-[9px] font-bold text-green-600">FOR SWAP</span>}
                    </div>
                    <div className="font-bold text-sm text-stone-900 truncate">{dapp.name}</div>
                    <div className="text-[10px] text-stone-500">{dapp.category} • {dapp.activeUsers} users</div>
                    {dapp.availableForSwap && (
                       <div className="mt-2 text-xs font-black text-green-700">{dapp.askingPrice} KAS</div>
                    )}
                 </motion.div>
              ))}
           </div>
           {filteredDApps.length === 0 && <p className="text-center text-purple-400 italic text-sm">No DApps found.</p>}
        </div>

        <div className="px-6 space-y-3 pt-6 border-t-2 border-dashed border-orange-200">
           <div className="flex items-center gap-2">
              <Store className="text-orange-600" size={20} />
              <span className="font-black text-lg text-amber-900">Village Market</span>
           </div>
           <div className="flex gap-2">
              <input 
                 type="text" 
                 placeholder="Search Coupons, Host Nodes..." 
                 value={couponSearch} 
                 onChange={(e) => setCouponSearch(e.target.value)} 
                 className="w-full p-3 rounded-xl border border-orange-200 bg-white outline-none focus:ring-2 focus:ring-orange-500" 
              />
              <Button className="w-12 h-12 p-0 bg-orange-600"><Search size={20} /></Button>
           </div>

           <div className="space-y-3">
              {filteredCoupons.map(coupon => { const hostData = MOCK_HOST_NODES.find(s => s.host_id === coupon.host_id); return (<motion.div key={coupon.coupon_id} whileTap={{ scale: 0.99 }} className="flex bg-white border border-yellow-300 rounded-xl p-4 relative shadow-sm"><div className="flex-1"><div className="text-xs text-amber-700 uppercase tracking-wide">{hostData?.name || "Unknown Host"}</div><div className="font-bold text-lg text-red-800">{coupon.title}</div><div className="text-xs bg-yellow-100 text-amber-800 px-2 py-0.5 rounded w-fit mt-1 font-mono">{coupon.code}</div></div><div className="w-24 flex items-center justify-center"><Button variant="secondary" className="h-8 px-2 text-xs" onClick={() => openHost(hostData)}>Visit</Button></div></motion.div>);})}
              {filteredCoupons.length === 0 && <p className="text-center text-amber-600 italic text-sm">No coupons found.</p>}
           </div>
        </div>
        
        <div className="px-6 space-y-3 pt-6 border-t-2 border-dashed border-indigo-200">
           <div className="flex items-center gap-2">
              <FileText className="text-indigo-600" size={20} />
              <span className="font-black text-lg text-indigo-900">School Dayz / Higher Learning</span>
           </div>
           
           <p className="text-xs text-indigo-800 leading-relaxed bg-indigo-50 p-3 rounded-lg border border-indigo-100">
              Available for code auditing, accounting/company auditing, statistics, analytics, private classes, counseling, and <span className="font-bold">legal consulting*</span>.
              <br/><span className="text-[9px] text-indigo-400">*See disclaimer in listings.</span>
           </p>

           <div className="flex gap-2">
              <input 
                 type="text" 
                 placeholder="Search Papers, Services, Auditing..." 
                 value={academicSearch} 
                 onChange={(e) => setAcademicSearch(e.target.value)} 
                 className="w-full p-3 rounded-xl border border-indigo-200 bg-white outline-none focus:ring-2 focus:ring-indigo-500" 
              />
              <Button className="w-12 h-12 p-0 bg-indigo-600"><Search size={20} /></Button>
           </div>

           {academicSearch.length > 0 && (
             <div className="space-y-3">
                 {filteredAcademicResults.map((item, index) => (
                    <motion.div key={index} whileTap={{ scale: 0.99 }} className="flex bg-white border border-indigo-300 rounded-xl p-4 relative shadow-sm items-center">
                       <div className="flex-1">
                          <div className="text-xs text-indigo-700 uppercase tracking-wide">
                              {item.type} | Apt {item.apt}
                          </div>
                          <div className="font-bold text-lg text-amber-900">{item.title}</div>
                          <div className="text-xs text-stone-500 mt-1">Author: {item.author}</div>
                       </div>
                       <div className="w-28 text-right">
                          <span className={cn("font-bold text-sm block", item.cost === 0 ? "text-green-700" : "text-red-800")}>
                              {item.cost === 0 ? "FREE" : `${item.cost} KAS`}
                          </span>
                          <span className="text-[10px] text-stone-500 block">{item.flat_rate ? '(Flat Fee)' : '(Per Hour)'}</span>
                          <Button variant="outline" className="h-8 py-1 text-xs mt-1 bg-indigo-50 text-indigo-800">Contact</Button>
                       </div>
                    </motion.div>
                 ))}
                 {filteredAcademicResults.length === 0 && <p className="text-center text-indigo-400 italic text-sm">No services found.</p>}
             </div>
           )}
        </div>
        
      </div>
    );
  };
  
  return (
    <div className="min-h-screen bg-amber-50 pb-20 font-sans text-amber-900">
      <div className="sticky top-0 z-10 bg-amber-50/80 backdrop-blur-sm px-6 pt-6 pb-4">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-xl font-black text-amber-900 flex items-center gap-2"><MapPin size={20} className="text-red-800"/> Apt {user.apartment}</h1>
            <p className="text-xs text-amber-700">L2 Wallet Identity</p>
          </div>
          <div className="flex items-center gap-2">
            <WebSocketStatusIndicator />
            <div className="w-10 h-10 bg-white border border-amber-300 rounded-full flex items-center justify-center"><User size={20} className="text-amber-800"/></div>
          </div>
        </div>
        <SafetyMeter />
      </div>
      
      <ProtocolStatsBanner />
      
      <div className="px-6 mb-4 text-xs font-medium text-red-800 bg-red-100 p-3 rounded-xl border border-red-300">
          <p><strong>Protocol Gas:</strong> Your current <strong>{feeType}</strong> status incurs a **{monthlyFeeText}/mo allocation** (COLA-adjusted) sent to Validators. <strong>No Transaction Gas</strong> is charged by the L2 protocol layer.</p>
          <p className="mt-1 text-red-600 italic">Note: Host Node owners also receive a $0.005/visit allocation from their visitors.</p>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
          {activeTab === "wallet" && (
            <div className="px-6">
              <Card className="bg-red-800 text-white border-none shadow-2xl shadow-amber-300 p-6 mb-8 relative overflow-hidden">
                <div className="relative z-10">
                  <div className="flex justify-between items-start mb-6">
                    <div className="p-2 bg-white/10 rounded-lg backdrop-blur-sm"><Zap className="w-5 h-5 text-yellow-400" /></div>
                    <div className="flex gap-2"> 
                       <button onClick={() => setShowDAppMarketplace(true)} className="text-xs font-medium bg-white/10 px-3 py-1 rounded-full hover:bg-white/20 transition flex items-center gap-1">
                          <PlayCircle size={12}/> DApps/Games
                       </button>
                       <button onClick={() => openHostNodeInterface(MOCK_HOST_NODES[0])} className="text-xs font-medium bg-white/10 px-3 py-1 rounded-full hover:bg-white/20 transition flex items-center gap-1">
                          <Store size={12}/> My Host Node
                       </button>
                       <button onClick={openAcademicProfile} className="text-xs font-medium bg-white/10 px-3 py-1 rounded-full hover:bg-white/20 transition flex items-center gap-1">
                          <FileText size={12}/> My Academic Profile
                       </button>
                    </div>
                  </div>
                  <p className="text-amber-300 text-xs font-bold uppercase tracking-widest mb-1">Available Balance</p>
                  <h2 className="text-5xl font-black tracking-tighter">{user.balance.toLocaleString()} <span className="text-2xl text-amber-500">KAS</span></h2>
                </div>
              </Card>
              <div className="space-y-6">
                 
              {/* --- RESERVE DONATION MODULE --- */}
              <Card className="p-4 bg-blue-50 border-blue-200 shadow-lg">
                <div className="flex items-center justify-between mb-2">
                   <h3 className="font-black text-blue-900 flex items-center gap-2">
                      <Shield size={18} className="text-blue-700"/> 
                      Donate to Safety Reserve
                   </h3>
                   <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-1 rounded">
                      Community Insurance
                   </span>
                </div>
                
                <p className="text-xs text-blue-800 mb-3 leading-relaxed border-l-2 border-blue-300 pl-2">
                   <strong>Definition:</strong> This pool strengthens the L2 protocol's collateralization ratio to protect against drainage attacks or liquidity shortages.
                </p>

                <div className="bg-white/50 p-3 rounded-lg border border-blue-100 mb-3">
                   <p className="text-[10px] text-stone-600 font-medium">
                      <span className="text-red-600 font-bold text-xs block mb-1">⚠️ DISCLAIMER: NOT AN INVESTMENT</span>
                      This is a permanent donation to the protocol's security layer. 
                      <strong> You will NOT receive this KAS back.</strong> There is no yield or profit generated from this action.
                   </p>
                </div>

                <div className="flex gap-2">
                   <input 
                      type="number" 
                      placeholder="Amount (KAS)"
                      className="flex-1 p-2 text-sm border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      id="donationInput"
                   />
                   <Button 
                      onClick={() => {
                        const amt = document.getElementById('donationInput').value;
                        if(!amt) return;
                        alert(`Thank you. ${amt} KAS permanently donated to the Safety Reserve.`);
                        document.getElementById('donationInput').value = '';
                      }}
                      className="bg-blue-700 hover:bg-blue-600 text-white h-10 text-xs font-bold"
                   >
                      Donate KAS
                   </Button>
                </div>
              </Card>
              {/* --- END RESERVE DONATION --- */}

                 <MonthlyFeeCard />
                 
                 {/* On/Off Ramp Buttons - Kraken-style guided flow */}
                 <div className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl border-2 border-green-200 mb-4">
                   <h4 className="font-black text-green-800 mb-2 flex items-center gap-2">
                     <Activity size={18}/> Add / Remove Funds
                   </h4>
                   <p className="text-xs text-green-700 mb-3">
                     Guided flows via Kraken, Cash App, Tangem, or SimpleSwap
                   </p>
                   <div className="grid grid-cols-2 gap-3">
                     <Button 
                       onClick={() => { setRampMode('deposit'); setShowOnRamp(true); }}
                       className="h-12 bg-green-600 hover:bg-green-500 flex items-center justify-center gap-2"
                     >
                       📥 Add Funds
                     </Button>
                     <Button 
                       onClick={() => { setRampMode('withdraw'); setShowOnRamp(true); }}
                       className="h-12 bg-orange-600 hover:bg-orange-500 flex items-center justify-center gap-2"
                     >
                       📤 Cash Out
                     </Button>
                   </div>
                 </div>
                 
                 <div className="grid grid-cols-2 gap-4 mb-2">
                   <Button onClick={() => setShowTransactionSigner(true)} variant="pay_direct" className="h-14">Send/Pay (Direct)</Button>
                   <Button onClick={() => setShowMutualPayment(true)} variant="pay_mutual" className="h-14 bg-indigo-600 flex items-center gap-1"><HeartHandshake size={14}/> Mutual Pay</Button>
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                   <Button onClick={() => setShowReceiveModal(true)} variant="secondary" className="h-14 bg-amber-600 flex items-center gap-1"><QrCode size={14}/> Receive</Button>
                   <Button onClick={() => setShowWithdrawalModal(true)} variant="secondary" className="h-14 bg-amber-800 flex items-center gap-1"><Hourglass size={14}/> Withdrawal</Button>
                 </div>
                 <h3 className="text-lg font-bold text-amber-900">XP Status - Next Tier: {xpInfo.nextTier}</h3>
                 <Card className="p-4 flex flex-col gap-3 bg-yellow-100 border-yellow-300"><div className="flex justify-between items-center"><span className="text-2xl font-black text-amber-900">{user.xp} XP</span><Badge tier={xpInfo.currentTier} /></div><div className="w-full bg-amber-300 h-2 rounded-full overflow-hidden"><motion.div className="h-full bg-red-800" initial={{ width: 0 }} animate={{ width: `${xpInfo.progress * 100}%` }} transition={{ duration: 0.5 }}/></div><p className="text-sm text-amber-700">{xpInfo.remaining > 0 ? `${xpInfo.remaining} XP until ${xpInfo.nextTier} Tier` : 'Maximum Tier Reached!'}</p></Card>
                 {user.isValidator && (<Card className="p-4 bg-red-100 border-red-300 shadow-lg"><div className="flex justify-between items-center"><h3 className="text-lg font-bold text-red-800">Validator Staking</h3><Code size={20} className="text-red-800" /></div><p className="text-sm text-red-700">Your L2 consensus role is active.</p><Button variant="secondary" onClick={() => setActiveDApp('validator')} className="w-full mt-3 bg-red-800">View Validator Console</Button></Card>)}
                 <a href="https://www.fbi.gov/scams-and-safety/common-scams-and-crimes/money-mules" target="_blank" rel="noopener noreferrer"><Button className="w-full bg-red-900 hover:bg-red-700 text-white shadow-xl shadow-red-300/50">Report Fraud (FBI.gov)</Button></a>
              </div>
            </div>
          )}
          {activeTab === "mailbox" && <MailboxTabContent openHost={openHostNodeInterface} onOpenDAppMarketplace={() => setShowDAppMarketplace(true)} />}
          {activeTab === "builder" && isHostOwner && userHostNode && <HostNodeBuilder hostNode={userHostNode} userXp={user.xp} openDApp={setActiveDApp} />}
        </motion.div>
      </AnimatePresence>

      <div className="fixed bottom-0 w-full bg-white border-t border-amber-300 p-4 flex justify-around items-center z-30 pb-8">
         <button onClick={() => setActiveTab("wallet")} className={cn("flex flex-col items-center gap-1 transition-colors", activeTab === "wallet" ? "text-amber-900" : "text-amber-600")}><Wallet size={24} strokeWidth={activeTab === "wallet" ? 3 : 2} /><span className="text-[10px] font-bold">Wallet</span></button>
         <button onClick={() => setActiveTab("mailbox")} className={cn("flex flex-col items-center gap-1 transition-colors", activeTab === "mailbox" ? "text-amber-900" : "text-amber-600")}><Mail size={24} strokeWidth={activeTab === "mailbox" ? 3 : 2} /><span className="text-[10px] font-bold">Mailbox</span></button>
         {isHostOwner && (<button onClick={() => setActiveTab("builder")} className={cn("flex flex-col items-center gap-1 transition-colors", activeTab === "builder" ? "text-amber-900" : "text-amber-600")}><Store size={24} strokeWidth={activeTab === "builder" ? 3 : 2} /><span className="text-[10px] font-bold">Builder</span></button>)}
         <button onClick={() => setShowTradeFi(true)} className="flex flex-col items-center gap-1 text-blue-600 hover:text-blue-800 transition-colors"><Scale size={24} strokeWidth={2} /><span className="text-[10px] font-bold">TradeFi Ed</span></button>
      </div>

      <AnimatePresence>
        {(showIdentity || (needsChallenge && securityStep === 0)) && <IdentityModal onClose={() => { setNeedsChallenge(false); }} />}
        {securityStep > 0 && <SecurityCheckModal />}
        {showTransactionSigner && <TransactionSigner onClose={() => setShowTransactionSigner(false)} onOpenMutualPay={() => setShowMutualPayment(true)} />}
        {activeHost && <HostNodeInterface hostNode={activeHost} templateId={activeHost.theme} onClose={() => setActiveHost(null)} />}
        {activeDApp === 'consignment' && <ConsignmentModule onClose={() => setActiveDApp(null)} />}
        {activeDApp === 'academics' && <AcademicResearchPreview onClose={() => setActiveDApp(null)} />}
        {activeDApp === 'validator' && <ValidatorDashboard onClose={() => setActiveDApp(null)} />}
        {showWithdrawalModal && <WithdrawalTimelockPanel onClose={() => setShowWithdrawalModal(false)} />}
        {showReceiveModal && <ReceiveModal onClose={() => setShowReceiveModal(false)} apartment={user.apartment} />}
        {showDAppMarketplace && (
          <DAppMarketplace 
            onClose={() => setShowDAppMarketplace(false)} 
            onOpenQualityGate={() => { setShowDAppMarketplace(false); setShowQualityGate(true); }}
          />
        )}
        {showQualityGate && (
          <QualityGateModal 
            onClose={() => setShowQualityGate(false)}
            onPublish={(manifest) => { alert(`DApp "${manifest.name}" published to ${manifest.targetBoard.name}!`); setShowQualityGate(false); }}
          />
        )}
        {showTradeFi && <TradeFiSection onClose={() => setShowTradeFi(false)} />}
        {showMutualPayment && (
          <MutualPaymentFlow 
            isOpen={showMutualPayment}
            onClose={() => setShowMutualPayment(false)}
          />
        )}
        {showOnRamp && (
          <OnOffRampFlow 
            onClose={() => setShowOnRamp(false)}
            mode={rampMode}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

// ============================================================================
// ON/OFF RAMP GUIDED FLOW (Kraken-style State-Aware UX)
// ============================================================================
// ============================================================================
// ON/OFF RAMP GUIDED FLOW (Kraken-style State-Aware UX)
// Updated: Full Cash Out Support (L2 -> Verified L1 -> Exchange)
// ============================================================================

const RAMP_ROUTES = [
    { 
      id: 'kraken', 
      name: 'Kraken', 
      type: 'exchange',
      supportsBuy: true, 
      supportsSell: true,
      logo: '🦑',
      estimatedTime: '5-30 min',
      kycRequired: true,
      description: 'Bank ↔ Kraken ↔ KAS ↔ L2',
      steps: ['Withdraw to L1', 'Send to Kraken', 'Sell for USD'],
      primaryLink: 'https://kraken.com/u/funding/deposit'
    },
    { 
      id: 'tangem', 
      name: 'Tangem Wallet', 
      type: 'wallet',
      supportsBuy: true, 
      supportsSell: true,
      logo: '💳',
      estimatedTime: '2-5 min',
      kycRequired: false,
      description: 'Hardware wallet ↔ L1 ↔ L2',
      steps: ['Withdraw to L1', 'Secure in Tangem'],
      primaryLink: 'tangem://send'
    },
    { 
      id: 'cashapp_simpleswap', 
      name: 'Cash App + SimpleSwap', 
      type: 'swap',
      supportsBuy: true, 
      supportsSell: true, // Now supported for Cash Out logic
      logo: '🔄',
      estimatedTime: '15-45 min',
      kycRequired: true,
      description: 'Cash App (BTC) ↔ SimpleSwap ↔ KAS',
      steps: ['Withdraw to L1', 'Swap KAS->BTC', 'Receive in Cash App'],
      primaryLink: 'https://cash.app/app',
      secondaryLink: 'https://simpleswap.io/',
      secondaryName: 'SimpleSwap'
    },
    { 
      id: 'cashapp_changenow', 
      name: 'Cash App + ChangeNow', 
      type: 'swap',
      supportsBuy: true, 
      supportsSell: true,
      logo: '💱',
      estimatedTime: '10-30 min',
      kycRequired: true,
      description: 'Cash App (BTC) ↔ ChangeNow ↔ KAS',
      steps: ['Withdraw to L1', 'Swap KAS->BTC', 'Receive in Cash App'],
      primaryLink: 'https://cash.app/app',
      secondaryLink: 'https://changenow.io/',
      secondaryName: 'ChangeNow'
    },
  ];
  
  const RAMP_STATES = {
    IDLE: 'idle',
    INITIATED: 'initiated',
    AWAITING_ONCHAIN: 'awaiting_onchain',
    CONFIRMING: 'confirming',
    CREDITED: 'credited',
    FAILED: 'failed',
    // Withdrawal specific
    SUBMITTING: 'submitting',
    WITHDRAWAL_QUEUED: 'withdrawal_queued'
  };
  
  const OnOffRampFlow = ({ onClose, mode = 'deposit' }) => {
    const { user, verifiedL1Wallet, submitWithdrawal } = useContext(GlobalContext);
    const [selectedRoute, setSelectedRoute] = useState(null);
    const [flowState, setFlowState] = useState(RAMP_STATES.IDLE);
    const [step, setStep] = useState(1);
    const [amount, setAmount] = useState('');
    
    // L2 Deposit Address (Destination for Deposits)
    const [depositAddress] = useState(
      `kaspa:qr${user.pubkey?.substring(2, 30) || 'demo'}...l2deposit`
    );
    
    const [txId, setTxId] = useState(null);
    const [confirmations, setConfirmations] = useState(0);
    const [withdrawalResult, setWithdrawalResult] = useState(null);
  
    // Get the verified route name if available
    const verifiedRouteName = verifiedL1Wallet?.route?.name;
    const verifiedAddress = verifiedL1Wallet?.walletAddress || user.kaspaAddress;
  
    const routes = RAMP_ROUTES.filter(r => 
      mode === 'deposit' ? r.supportsBuy : r.supportsSell
    );
  
    // Simulate chain watching (Deposit Mode)
    useEffect(() => {
      if (mode === 'deposit') {
          if (flowState === RAMP_STATES.AWAITING_ONCHAIN) {
            const timer = setTimeout(() => {
              setTxId('tx_' + Math.random().toString(36).substr(2, 9));
              setFlowState(RAMP_STATES.CONFIRMING);
            }, 5000);
            return () => clearTimeout(timer);
          }
          if (flowState === RAMP_STATES.CONFIRMING) {
            const interval = setInterval(() => {
              setConfirmations(prev => {
                if (prev >= 10) {
                  setFlowState(RAMP_STATES.CREDITED);
                  clearInterval(interval);
                  return 10;
                }
                return prev + 1;
              });
            }, 500);
            return () => clearInterval(interval);
          }
      }
    }, [flowState, mode]);
  
    const handleSelectRoute = (route) => {
      setSelectedRoute(route);
      setStep(2);
    };
  
    const handleStartFlow = () => {
      setFlowState(RAMP_STATES.INITIATED);
      setStep(3);
    };
  
    const handleMarkSent = () => {
      if (!amount || amount <= 0) {
        alert("Please specify the amount.");
        return;
      }
      setFlowState(RAMP_STATES.AWAITING_ONCHAIN);
      setStep(4);
    };
  
    const handleSubmitWithdrawal = async () => {
      if (!amount || amount <= 0) {
          alert("Please specify the withdrawal amount.");
          return;
      }
      if (amount > user.balance) {
          alert("Insufficient balance.");
          return;
      }
      
      setFlowState(RAMP_STATES.SUBMITTING);
      // Execute actual protocol withdrawal logic
      const res = await submitWithdrawal(parseInt(amount), verifiedAddress);
      
      if (res.success) {
          setWithdrawalResult(res);
          setFlowState(RAMP_STATES.WITHDRAWAL_QUEUED);
          setStep(4);
      } else {
          alert("Withdrawal failed. Please try again.");
          setFlowState(RAMP_STATES.IDLE);
      }
    };
  
    return (
      <div className="fixed inset-0 bg-stone-900/95 backdrop-blur-md flex items-center justify-center p-4 z-50">
        <motion.div 
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-gradient-to-b from-white to-stone-50 w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col"
        >
          {/* Header */}
          <div className={cn(
            "p-6 text-white",
            mode === 'deposit' 
              ? "bg-gradient-to-r from-green-600 to-emerald-600" 
              : "bg-gradient-to-r from-orange-600 to-red-600"
          )}>
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-2xl font-black flex items-center gap-3">
                  {mode === 'deposit' ? '📥 Add Funds' : '📤 Cash Out'}
                </h2>
                <p className="text-xs text-white/80 mt-1">
                  {mode === 'deposit' ? 'Bring KAS into Layer 2' : 'Withdraw L2 KAS to Verified Wallet'}
                </p>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition">
                <X className="text-white/80 hover:text-white"/>
              </button>
            </div>
            
            {/* Progress Steps */}
            <div className="flex items-center justify-between mt-4 px-2">
              {[mode === 'deposit' ? 'Source' : 'Target', 'Instructions', mode === 'deposit' ? 'Transfer' : 'Withdraw', 'Confirm'].map((label, i) => (
                <div key={i} className="flex flex-col items-center">
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2",
                    step > i + 1 ? "bg-white text-current border-white" : 
                    step === i + 1 ? "bg-white/20 text-white border-white" : 
                    "bg-transparent text-white/50 border-white/30",
                    mode === 'deposit' ? 'text-green-600' : 'text-orange-600'
                  )}>
                    {step > i + 1 ? '✓' : i + 1}
                  </div>
                  <span className="text-[9px] mt-1 text-white/70">{label}</span>
                </div>
              ))}
            </div>
          </div>
  
          {/* Content */}
          <div className="p-6 overflow-y-auto flex-1">
            
            {/* Step 1: Select Route */}
            {step === 1 && (
              <div className="space-y-4">
                <h3 className="text-lg font-bold text-stone-800 text-center">
                    {mode === 'deposit' ? 'Choose Funding Source' : 'Where do you want to move funds?'}
                </h3>
  
                {/* Verified Wallet Highlight (Withdrawal Mode) */}
                {mode === 'withdraw' && verifiedL1Wallet && (
                   <div className="p-4 bg-green-50 border border-green-200 rounded-xl mb-4">
                      <div className="flex items-center gap-2 mb-2">
                          <ShieldCheck className="text-green-600" size={18} />
                          <span className="font-bold text-green-800 text-sm">Security Requirement</span>
                      </div>
                      <p className="text-xs text-green-700">
                          Funds will first be sent to your <strong>Verified L1 Wallet</strong>. From there, you can move them to any exchange below.
                      </p>
                   </div>
                )}
                
                {routes.map(route => (
                  <div
                    key={route.id}
                    onClick={() => handleSelectRoute(route)}
                    className={cn(
                      "p-4 bg-white rounded-2xl border-2 cursor-pointer transition-all hover:shadow-lg",
                      verifiedRouteName === route.name 
                        ? "border-green-400 bg-green-50/50" 
                        : "border-stone-200 hover:border-green-400"
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <div className="text-3xl">{route.logo}</div>
                      <div className="flex-1">
                        <div className="font-black text-stone-900 flex items-center gap-2">
                          {route.name}
                        </div>
                        <div className="text-xs text-stone-500">{route.description}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
  
            {/* Step 2: Instructions */}
            {step === 2 && selectedRoute && (
              <div className="space-y-4">
                <div className="text-center mb-2">
                  <div className="text-5xl mb-2">{selectedRoute.logo}</div>
                  <h3 className="text-xl font-black text-stone-800">{selectedRoute.name}</h3>
                </div>
  
                {/* INSTRUCTIONS */}
                <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl">
                  <h4 className="font-bold text-stone-800 text-sm mb-2">
                      {mode === 'deposit' ? 'Deposit Instructions' : 'Withdrawal Process'}
                  </h4>
                  
                  {/* DEPOSIT INSTRUCTIONS */}
                  {mode === 'deposit' ? (
                     selectedRoute.type === 'swap' ? (
                         <ol className="text-xs text-stone-700 space-y-3">
                           <li className="flex gap-2">
                             <span className="font-bold bg-stone-200 w-5 h-5 rounded-full flex items-center justify-center shrink-0">1</span>
                             <div><strong>Buy BTC</strong> on Cash App.</div>
                           </li>
                           <li className="flex gap-2">
                             <span className="font-bold bg-stone-200 w-5 h-5 rounded-full flex items-center justify-center shrink-0">2</span>
                             <div>Open <strong>{selectedRoute.secondaryName}</strong> (BTC → KAS).</div>
                           </li>
                           <li className="flex gap-2">
                             <span className="font-bold bg-stone-200 w-5 h-5 rounded-full flex items-center justify-center shrink-0">3</span>
                             <div>Send BTC to {selectedRoute.secondaryName}, set destination to your <strong>L2 Deposit Address</strong>.</div>
                           </li>
                         </ol>
                     ) : (
                         <ol className="text-xs text-stone-700 space-y-3">
                           <li>1. Open <strong>{selectedRoute.name}</strong>.</li>
                           <li>2. Buy or Select <strong>KAS</strong>.</li>
                           <li>3. Send to <strong>L2 Deposit Address</strong> (shown next).</li>
                         </ol>
                     )
                  ) : (
                  /* WITHDRAWAL INSTRUCTIONS */
                     <div className="space-y-4">
                         <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
                            <strong>⚠️ Protocol Security:</strong> 
                            Direct withdrawals to exchanges are not permitted. Funds must settle in your verified self-custody wallet first.
                         </div>
                         <ol className="text-xs text-stone-700 space-y-3 relative">
                             {/* Step 1: L2 -> L1 */}
                             <li className="flex gap-3">
                                 <div className="flex flex-col items-center">
                                    <div className="w-6 h-6 rounded-full bg-orange-600 text-white flex items-center justify-center text-xs font-bold">1</div>
                                    <div className="h-full w-0.5 bg-stone-300 my-1"></div>
                                 </div>
                                 <div>
                                    <strong className="text-orange-700">Withdraw to Verified L1 Wallet</strong>
                                    <p className="text-[10px] text-stone-500">
                                        Funds move from L2 → {verifiedAddress.substring(0,12)}...
                                    </p>
                                    <p className="text-[10px] text-stone-400 italic">Takes 24h (Timelock)</p>
                                 </div>
                             </li>
                             {/* Step 2: L1 -> Exchange */}
                             <li className="flex gap-3">
                                 <div className="w-6 h-6 rounded-full bg-stone-300 text-white flex items-center justify-center text-xs font-bold">2</div>
                                 <div>
                                    <strong>Send to {selectedRoute.name}</strong>
                                    <p className="text-[10px] text-stone-500">
                                        Once funds arrive in your wallet, you can send them to {selectedRoute.name} to cash out.
                                    </p>
                                 </div>
                             </li>
                         </ol>
                     </div>
                  )}
                </div>
  
                <button 
                    onClick={handleStartFlow}
                    className={cn(
                        "w-full py-3 text-white rounded-xl font-bold text-center flex items-center justify-center gap-2",
                        mode === 'deposit' ? "bg-green-600 hover:bg-green-500" : "bg-orange-600 hover:bg-orange-500"
                    )}
                >
                    {mode === 'deposit' ? 'Show Deposit Address' : 'Start Withdrawal'} <ArrowRight size={16}/>
                </button>
                
                <button onClick={() => setStep(1)} className="w-full text-center text-xs text-stone-400 hover:text-stone-600 underline">Back</button>
              </div>
            )}
  
            {/* Step 3: Execution (Deposit Address OR Withdrawal Input) */}
            {step === 3 && (
              <div className="space-y-4">
                
                {/* === DEPOSIT MODE: Show Address === */}
                {mode === 'deposit' && (
                    <>
                        <div>
                           <label className="text-[10px] font-bold uppercase text-stone-500 mb-1 block">From (Your Verified Wallet)</label>
                           <div className="p-3 bg-stone-100 border border-stone-300 rounded-xl flex justify-between items-center opacity-70">
                              <span className="font-mono text-xs text-stone-600 truncate max-w-[200px]">
                                 {verifiedL1Wallet ? verifiedL1Wallet.walletAddress : "External Source"}
                              </span>
                              {verifiedL1Wallet && <span className="text-[9px] bg-green-100 text-green-700 px-2 py-0.5 rounded font-bold">VERIFIED</span>}
                           </div>
                        </div>
  
                        <div className="flex justify-center -my-3 z-10 relative">
                           <div className="bg-stone-200 p-1 rounded-full border border-white"><ArrowRight className="rotate-90 text-stone-500" size={16}/></div>
                        </div>
  
                        <div>
                           <label className="text-[10px] font-bold uppercase text-green-700 mb-1 block">To (L2 Deposit Address)</label>
                           <div className="p-4 bg-green-50 border-2 border-green-500 rounded-xl shadow-lg relative z-0">
                              <div className="font-mono text-sm font-bold text-stone-900 break-all mb-3 text-center">
                                 {depositAddress}
                              </div>
                              <button 
                                 onClick={() => navigator.clipboard.writeText(depositAddress)}
                                 className="w-full py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-1"
                              >
                                 Copy Address
                              </button>
                           </div>
                        </div>
                    </>
                )}
  
                {/* === WITHDRAWAL MODE: Destination Lock === */}
                {mode === 'withdraw' && (
                    <>
                        <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded-r-xl">
                            <h4 className="text-red-800 font-bold text-sm">Mandatory Routing</h4>
                            <p className="text-xs text-red-700 mt-1">
                                Funds are being sent to your <strong>Verified Sanctioned Wallet</strong>.
                            </p>
                        </div>
  
                        <div>
                           <label className="text-[10px] font-bold uppercase text-stone-500 mb-1 block">From (L2 Account)</label>
                           <div className="p-3 bg-stone-100 border border-stone-300 rounded-xl">
                               <div className="font-bold text-stone-800">Apt {user.apartment}</div>
                               <div className="text-xs text-stone-500">Balance: {user.balance.toLocaleString()} KAS</div>
                           </div>
                        </div>
  
                        <div className="flex justify-center -my-3 z-10 relative">
                           <div className="bg-stone-200 p-1 rounded-full border border-white"><ArrowRight className="rotate-90 text-stone-500" size={16}/></div>
                        </div>
  
                        <div>
                           <label className="text-[10px] font-bold uppercase text-orange-700 mb-1 block">To (Verified L1 Wallet)</label>
                           <div className="p-3 bg-orange-50 border-2 border-orange-300 rounded-xl flex items-center gap-2">
                              <Lock size={16} className="text-orange-600"/>
                              <div className="flex-1 font-mono text-xs text-stone-800 break-all">
                                 {verifiedAddress}
                              </div>
                              <span className="text-[9px] bg-green-100 text-green-700 px-2 py-0.5 rounded font-bold">VERIFIED</span>
                           </div>
                        </div>
                    </>
                )}
  
                {/* AMOUNT INPUT SLOT */}
                <div className="pt-2">
                   <label className="block text-sm font-bold text-stone-700 mb-2">Amount ({mode === 'deposit' ? 'Sending' : 'Withdrawing'})</label>
                   <input 
                      type="number" 
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="e.g. 1000"
                      className="w-full p-4 border-2 border-stone-300 rounded-xl text-xl font-bold outline-none focus:border-green-500 focus:ring-4 focus:ring-green-100 transition-all"
                   />
                   {mode === 'withdraw' && (
                       <p className="text-xs text-stone-400 mt-1">Available: {user.balance.toLocaleString()} KAS</p>
                   )}
                </div>
  
                <div className="pt-2">
                    <Button 
                      onClick={mode === 'deposit' ? handleMarkSent : handleSubmitWithdrawal}
                      disabled={!amount}
                      className={cn(
                          "w-full h-12",
                          amount ? (mode === 'deposit' ? "bg-green-600 hover:bg-green-500" : "bg-orange-600 hover:bg-orange-500") : "bg-stone-300 cursor-not-allowed"
                      )}
                    >
                      {mode === 'deposit' ? `I have Sent ${amount || ''} KAS` : `Withdraw ${amount || ''} KAS to Verified Wallet`}
                    </Button>
                    <button onClick={() => setStep(2)} className="w-full text-center text-sm text-stone-500 hover:text-stone-700 underline mt-2">← Back</button>
                </div>
              </div>
            )}
  
            {/* Step 4: Completion / Tracking */}
            {step === 4 && (
              <div className="space-y-4">
                
                {/* DEPOSIT TRACKING UI */}
                {mode === 'deposit' && (
                  <>
                    <div className="text-center mb-6">
                      {flowState === RAMP_STATES.AWAITING_ONCHAIN && (
                        <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse"><Hourglass className="text-amber-600" size={32} /></div>
                      )}
                      {flowState === RAMP_STATES.CONFIRMING && (
                        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4"><RefreshCw className="text-blue-600 animate-spin" size={32} /></div>
                      )}
                      {flowState === RAMP_STATES.CREDITED && (
                         <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4"><CheckCircle className="text-green-600" size={32} /></div>
                      )}
                      
                      <h3 className="text-xl font-black text-stone-800">
                          {flowState === RAMP_STATES.AWAITING_ONCHAIN ? 'Scanning Ledger...' : 
                           flowState === RAMP_STATES.CONFIRMING ? 'Confirming...' : 'Deposit Complete!'}
                      </h3>
                    </div>
                    {/* Progress Bar for Deposit */}
                    <div className="space-y-4 bg-stone-50 p-6 rounded-2xl">
                       <div className="flex items-center gap-3">
                          <div className={cn("w-3 h-3 rounded-full", flowState !== RAMP_STATES.IDLE ? "bg-green-500" : "bg-stone-300")}></div>
                          <span className="text-sm font-bold text-stone-600">Transaction Detected</span>
                       </div>
                       <div className="flex items-center gap-3">
                          <div className={cn("w-3 h-3 rounded-full", flowState === RAMP_STATES.CONFIRMING || flowState === RAMP_STATES.CREDITED ? "bg-green-500" : "bg-stone-300")}></div>
                          <span className="text-sm font-bold text-stone-600">10 Block Confirmations</span>
                       </div>
                       <div className="flex items-center gap-3">
                          <div className={cn("w-3 h-3 rounded-full", flowState === RAMP_STATES.CREDITED ? "bg-green-500" : "bg-stone-300")}></div>
                          <span className="text-sm font-bold text-stone-600">Balance Updated</span>
                       </div>
                    </div>
                  </>
                )}
  
                {/* WITHDRAWAL SUCCESS UI */}
                {mode === 'withdraw' && withdrawalResult && (
                    <div className="text-center">
                      <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                          <CheckCircle className="text-green-600" size={40} />
                      </div>
                      <h3 className="text-2xl font-black text-green-800">Withdrawal Initiated</h3>
                      <div className="mt-4 p-4 bg-stone-50 rounded-xl text-left border border-stone-200">
                          <div className="flex justify-between mb-2">
                              <span className="text-sm text-stone-500">Amount:</span>
                              <span className="font-bold">{amount} KAS</span>
                          </div>
                          <div className="flex justify-between mb-2">
                              <span className="text-sm text-stone-500">Destination:</span>
                              <span className="font-mono text-xs bg-stone-200 px-1 rounded">{verifiedAddress.substring(0,12)}...</span>
                          </div>
                          <div className="flex justify-between">
                              <span className="text-sm text-stone-500">Unlocks In:</span>
                              <span className="font-bold text-orange-600">24 Hours</span>
                          </div>
                      </div>
                      <p className="text-xs text-stone-500 mt-4 px-4">
                          Funds will arrive in your verified wallet after the safety timelock. You can track this in the main Withdrawal panel.
                      </p>
                    </div>
                )}
  
                {(flowState === RAMP_STATES.CREDITED || flowState === RAMP_STATES.WITHDRAWAL_QUEUED) && (
                  <Button onClick={onClose} className="w-full h-12 bg-green-600 font-bold text-lg mt-4">Done</Button>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    );
  };

// ============================================================================
// CLICKWRAP AGREEMENT & GEO-BLOCKING COMPONENTS
// ============================================================================

// --- GEO-BLOCK SCREEN ---
const GeoBlockScreen = ({ countryCode }) => {
  const countryNames = {
    'KP': 'North Korea',
    'IR': 'Iran', 
    'CU': 'Cuba',
    'SY': 'Syria',
    'RU': 'Russia',
    'BY': 'Belarus',
    'SD': 'Sudan',
  };

  return (
    <div className="fixed inset-0 bg-red-900 flex items-center justify-center p-4 z-[100]">
      <div className="bg-white rounded-3xl p-8 max-w-md text-center shadow-2xl">
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <Ban className="text-red-600" size={40} />
        </div>
        <h1 className="text-2xl font-black text-red-800 mb-4">Access Restricted</h1>
        <p className="text-stone-600 mb-6">
          Access from <strong>{countryNames[countryCode] || countryCode}</strong> is not permitted due to international sanctions compliance requirements.
        </p>
        <div className="p-4 bg-red-50 rounded-xl border border-red-200 text-sm text-red-800">
          <strong>HTTP 403 Forbidden</strong><br/>
          This platform complies with OFAC sanctions and cannot provide services to users in restricted jurisdictions.
        </div>
      </div>
    </div>
  );
};

// --- CLICKWRAP AGREEMENT MODAL ---
// ============================================================================
// ONBOARDING ADD FUNDS FLOW (After Clickwrap, Before Full Access)
// ============================================================================

const OnboardingAddFundsFlow = ({ onComplete, onSkip }) => {
  const [step, setStep] = useState(1); // 1: select route, 2: instructions, 3: verify wallet
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [walletAddress, setWalletAddress] = useState('');
  const [verificationStatus, setVerificationStatus] = useState('pending'); // pending, checking, verified, failed
  const [sanctionsStatus, setSanctionsStatus] = useState(null);

  const ONBOARD_ROUTES = [
    { 
      id: 'kraken', 
      name: 'Kraken', 
      logo: '🦑',
      description: 'Exchange - Bank deposit, buy KAS, withdraw',
      kycRequired: true,
      deepLink: 'https://kraken.com/u/funding/deposit'
    },
    { 
      id: 'tangem', 
      name: 'Tangem Wallet', 
      logo: '💳',
      description: 'Hardware wallet - Direct KAS support',
      kycRequired: false,
      deepLink: 'tangem://send'
    },
    { 
      id: 'cashapp', 
      name: 'Cash App + SimpleSwap', 
      logo: '💵',
      description: 'Buy BTC → Swap to KAS',
      kycRequired: true,
      deepLink: 'https://cash.app/app'
    },
  ];

  const handleSelectRoute = (route) => {
    setSelectedRoute(route);
    setStep(2);
  };

  const handleVerifyWallet = () => {
    if (!walletAddress || walletAddress.length < 10) {
      alert('Please enter your Kaspa L1 wallet address');
      return;
    }
    setVerificationStatus('checking');
    setSanctionsStatus('checking');
    
    // Simulate sanctions screening
    setTimeout(() => {
      // Mock: Address passes sanctions check
      setSanctionsStatus('passed');
      setVerificationStatus('verified');
      setStep(3);
    }, 2000);
  };

  const handleComplete = () => {
    onComplete({
      walletAddress,
      route: selectedRoute,
      sanctionsCleared: true,
      verifiedAt: Date.now(),
    });
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-b from-green-900 to-emerald-950 flex items-center justify-center p-4 z-[95]">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }} 
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Wallet className="text-green-600" size={40} />
          </div>
          <h2 className="text-2xl font-black text-green-900">Connect Your Wallet</h2>
          <p className="text-sm text-stone-500 mt-2">
            Link a Kaspa L1 wallet to fund your Layer 2 account
          </p>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-between mb-6 px-4">
          {['Select Source', 'Link Wallet', 'Verified'].map((label, i) => (
            <div key={i} className="flex flex-col items-center">
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold",
                step > i + 1 ? "bg-green-500 text-white" : 
                step === i + 1 ? "bg-green-600 text-white" : 
                "bg-stone-200 text-stone-500"
              )}>
                {step > i + 1 ? '✓' : i + 1}
              </div>
              <span className="text-[9px] mt-1 text-stone-500">{label}</span>
            </div>
          ))}
        </div>

        {/* Step 1: Select Route */}
        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-stone-600 text-center mb-4">
              Choose where your KAS will come from:
            </p>
            
            {ONBOARD_ROUTES.map(route => (
              <div
                key={route.id}
                onClick={() => handleSelectRoute(route)}
                className="p-4 bg-stone-50 rounded-2xl border-2 border-stone-200 hover:border-green-400 cursor-pointer transition-all hover:shadow-lg"
              >
                <div className="flex items-center gap-4">
                  <div className="text-3xl">{route.logo}</div>
                  <div className="flex-1">
                    <div className="font-black text-stone-900">{route.name}</div>
                    <div className="text-xs text-stone-500">{route.description}</div>
                  </div>
                  {route.kycRequired && (
                    <div className="text-[10px] text-amber-600 bg-amber-50 px-2 py-1 rounded">KYC</div>
                  )}
                </div>
              </div>
            ))}

            <button 
              onClick={onSkip}
              className="w-full text-center text-sm text-stone-400 hover:text-stone-600 underline mt-4"
            >
              Skip for now (can add funds later)
            </button>
          </div>
        )}

        {/* Step 2: Link Wallet */}
        {step === 2 && selectedRoute && (
          <div className="space-y-4">
            <div className="text-center mb-4">
              <div className="text-4xl mb-2">{selectedRoute.logo}</div>
              <h3 className="text-lg font-black text-stone-800">{selectedRoute.name}</h3>
            </div>

            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <h4 className="font-bold text-blue-800 text-sm mb-2">📋 Setup Instructions</h4>
              <ol className="text-xs text-blue-700 space-y-2">
                <li>1. Open {selectedRoute.name} and complete verification</li>
                <li>2. Get your Kaspa (KAS) receiving address</li>
                <li>3. Paste that address below to link it</li>
              </ol>
            </div>

            <a 
              href={selectedRoute.deepLink}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-center"
            >
              Open {selectedRoute.name} <ExternalLink size={14} className="inline ml-1"/>
            </a>

            <div className="pt-4 border-t border-stone-200">
              <label className="block text-sm font-bold text-stone-600 mb-2">
                Your Kaspa L1 Wallet Address
              </label>
              <input
                type="text"
                placeholder="kaspa:qr..."
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                className="w-full p-3 rounded-xl border border-stone-300 bg-white outline-none focus:ring-2 focus:ring-green-500 font-mono text-sm"
              />
              <p className="text-[10px] text-stone-400 mt-1">
                This address will be sanctions-screened and linked to your L2 account
              </p>
            </div>

            {verificationStatus === 'checking' && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-center">
                <Hourglass className="text-amber-600 mx-auto mb-2 animate-pulse" size={24} />
                <p className="text-sm font-bold text-amber-800">Running Sanctions Check...</p>
                <p className="text-xs text-amber-600">Verifying against OFAC SDN list</p>
              </div>
            )}

            <div className="flex gap-3">
              <button 
                onClick={() => setStep(1)}
                className="flex-1 py-3 border border-stone-300 rounded-xl font-bold text-stone-600"
              >
                ← Back
              </button>
              <button 
                onClick={handleVerifyWallet}
                disabled={!walletAddress || verificationStatus === 'checking'}
                className={cn(
                  "flex-1 py-3 rounded-xl font-bold text-white",
                  walletAddress && verificationStatus !== 'checking' 
                    ? "bg-green-600 hover:bg-green-500" 
                    : "bg-stone-300 cursor-not-allowed"
                )}
              >
                Verify & Link Wallet
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Verified */}
        {step === 3 && (
          <div className="space-y-4 text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="text-green-600" size={40} />
            </div>
            <h3 className="text-xl font-black text-green-800">Wallet Verified!</h3>
            
            <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-left space-y-2">
              <div className="flex items-center gap-2">
                <ShieldCheck className="text-green-600" size={16} />
                <span className="text-sm font-bold text-green-800">Sanctions Check: PASSED</span>
              </div>
              <div className="text-xs text-green-700 font-mono break-all">
                {walletAddress}
              </div>
            </div>

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 text-left">
              <strong>What's linked:</strong>
              <ul className="mt-1 space-y-1">
                <li>✓ This L1 address is now your verified funding source</li>
                <li>✓ Future deposits must come from this address</li>
                <li>✓ Withdrawals will return to this address</li>
              </ul>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
              <strong>Ready to fund?</strong> Send KAS from {selectedRoute?.name} to your L2 deposit address (shown after setup).
            </div>

            <Button onClick={handleComplete} className="w-full h-12 bg-green-600 hover:bg-green-500">
              Continue to KasVillage →
            </Button>
          </div>
        )}
      </motion.div>
    </div>
  );
};

const ClickwrapModal = ({ onSign, onCancel }) => {
  const [agreed, setAgreed] = useState({
    jurisdiction: false,
    nonCustodial: false,
    taxResponsibility: false,
    riskAcknowledgment: false,
  });
  const [signature, setSignature] = useState('');
  const [showAddFunds, setShowAddFunds] = useState(false);
  const [clickwrapSigned, setClickwrapSigned] = useState(false);
  const [verifiedWallet, setVerifiedWallet] = useState(null);

  const allAgreed = Object.values(agreed).every(v => v);
  const canSign = allAgreed && signature.length >= 3;

  const handleSignClickwrap = () => {
    const sigData = {
      terms: agreed,
      signature,
      timestamp: Date.now(),
      hash: btoa(JSON.stringify({ ...agreed, signature, ts: Date.now() })),
    };
    setClickwrapSigned(true);
    setShowAddFunds(true);
    // Store clickwrap signature
    localStorage.setItem('clickwrap_signature', JSON.stringify(sigData));
  };

  const handleAddFundsComplete = (walletData) => {
    setVerifiedWallet(walletData);
    // Store verified wallet
    localStorage.setItem('verified_l1_wallet', JSON.stringify(walletData));
    // Complete the full onboarding
    onSign({
      terms: agreed,
      signature,
      timestamp: Date.now(),
      hash: btoa(JSON.stringify({ ...agreed, signature, ts: Date.now() })),
      verifiedWallet: walletData,
    });
  };

  const handleSkipAddFunds = () => {
    // Allow skip but still complete clickwrap
    onSign({
      terms: agreed,
      signature,
      timestamp: Date.now(),
      hash: btoa(JSON.stringify({ ...agreed, signature, ts: Date.now() })),
      verifiedWallet: null,
    });
  };

  // Show Add Funds flow after clickwrap is signed
  if (showAddFunds) {
    return (
      <OnboardingAddFundsFlow 
        onComplete={handleAddFundsComplete}
        onSkip={handleSkipAddFunds}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[90]">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }} 
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="text-amber-600" size={32} />
          </div>
          <h2 className="text-2xl font-black text-amber-900">Terms of Service Agreement</h2>
          <p className="text-sm text-stone-500 mt-2">You must agree to these terms before using the platform</p>
        </div>

        <div className="space-y-4 mb-6">
          {/* Jurisdiction Certification */}
          <label className="flex items-start gap-3 p-4 bg-stone-50 rounded-xl border border-stone-200 cursor-pointer hover:border-amber-300 transition">
            <input 
              type="checkbox" 
              checked={agreed.jurisdiction}
              onChange={(e) => setAgreed(p => ({ ...p, jurisdiction: e.target.checked }))}
              className="w-5 h-5 mt-0.5 accent-amber-600"
            />
            <div>
              <div className="font-bold text-stone-800">Jurisdiction Certification</div>
              <p className="text-xs text-stone-500 mt-1">
                I certify that I am NOT a resident, citizen, or located in any OFAC-sanctioned jurisdiction including North Korea, Iran, Cuba, Syria, Russia, Belarus, or Sudan.
              </p>
            </div>
          </label>

          {/* Non-Custodial Acknowledgment */}
          <label className="flex items-start gap-3 p-4 bg-stone-50 rounded-xl border border-stone-200 cursor-pointer hover:border-amber-300 transition">
            <input 
              type="checkbox" 
              checked={agreed.nonCustodial}
              onChange={(e) => setAgreed(p => ({ ...p, nonCustodial: e.target.checked }))}
              className="w-5 h-5 mt-0.5 accent-amber-600"
            />
            <div>
              <div className="font-bold text-stone-800">Non-Custodial Acknowledgment</div>
              <p className="text-xs text-stone-500 mt-1">
                I understand this is a non-custodial Layer 2 protocol. I control my own keys and am solely responsible for my funds. The protocol operators do not have access to or control over my assets.
              </p>
            </div>
          </label>

          {/* Tax Responsibility */}
          <label className="flex items-start gap-3 p-4 bg-stone-50 rounded-xl border border-stone-200 cursor-pointer hover:border-amber-300 transition">
            <input 
              type="checkbox" 
              checked={agreed.taxResponsibility}
              onChange={(e) => setAgreed(p => ({ ...p, taxResponsibility: e.target.checked }))}
              className="w-5 h-5 mt-0.5 accent-amber-600"
            />
            <div>
              <div className="font-bold text-stone-800">Tax Responsibility</div>
              <p className="text-xs text-stone-500 mt-1">
                I acknowledge that I am solely responsible for determining and paying any taxes owed on transactions conducted through this platform in accordance with applicable laws in my jurisdiction.
              </p>
            </div>
          </label>

          {/* Risk Acknowledgment */}
          <label className="flex items-start gap-3 p-4 bg-stone-50 rounded-xl border border-stone-200 cursor-pointer hover:border-amber-300 transition">
            <input 
              type="checkbox" 
              checked={agreed.riskAcknowledgment}
              onChange={(e) => setAgreed(p => ({ ...p, riskAcknowledgment: e.target.checked }))}
              className="w-5 h-5 mt-0.5 accent-amber-600"
            />
            <div>
              <div className="font-bold text-stone-800">Risk Acknowledgment</div>
              <p className="text-xs text-stone-500 mt-1">
                I understand that cryptocurrency transactions involve risks including but not limited to: price volatility, smart contract bugs, network congestion, and potential total loss of funds. I accept these risks.
              </p>
            </div>
          </label>
        </div>

        {/* Signature */}
        <div className="mb-6">
          <label className="block text-sm font-bold text-stone-600 mb-2">
            Digital Signature (Type your name)
          </label>
          <input
            type="text"
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            placeholder="Type your full name to sign"
            className="w-full p-3 border border-amber-300 rounded-xl text-lg font-mono"
            disabled={!allAgreed}
          />
          <p className="text-xs text-stone-400 mt-1">
            Your signature will be cryptographically stored as proof of agreement
          </p>
        </div>

        {/* Legal Notice */}
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 mb-6">
          <strong>Legal Notice:</strong> By signing, you enter into a legally binding agreement. This clickwrap signature constitutes your electronic consent under the E-SIGN Act and similar international regulations.
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <Button 
            onClick={onCancel}
            variant="outline" 
            className="flex-1 h-12"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSignClickwrap}
            disabled={!canSign}
            className={cn("flex-1 h-12", canSign ? "bg-amber-600 hover:bg-amber-500" : "bg-stone-300")}
          >
            Sign & Continue
          </Button>
        </div>
      </motion.div>
    </div>
  );
};

// ============================================================================
// NEW COMPONENTS: Popups for Collateral, Coupons, Inventory, Mutual Payment
// ============================================================================

// --- KASPA COLLATERAL POPUP ---
const KaspaCollateralPopup = ({ isOpen, onClose, currentCollateral, onUpdate, maxBalance }) => {
  const [amount, setAmount] = useState(100);
  const [action, setAction] = useState('add');

  if (!isOpen) return null;

  const handleSubmit = () => {
    const newCollateral = action === 'add' 
      ? currentCollateral + amount 
      : Math.max(0, currentCollateral - amount);
    onUpdate(newCollateral);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-[80]">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-black text-amber-900 flex items-center gap-2"><Lock size={20} /> Adjust Kaspa Collateral</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600"><X size={24} /></button>
        </div>

        <div className="bg-amber-50 p-4 rounded-xl border border-amber-200 mb-6">
          <div className="flex justify-between items-center">
            <span className="text-sm text-amber-700">Current Collateral</span>
            <span className="text-2xl font-black text-red-800">{currentCollateral.toLocaleString()} KAS</span>
          </div>
          <div className="flex justify-between items-center mt-2">
            <span className="text-xs text-stone-500">USD Value</span>
            <span className="text-sm font-bold text-stone-600">${KAS_TO_USD(currentCollateral)}</span>
          </div>
        </div>

        <div className="flex mb-4 p-1 bg-stone-100 rounded-xl">
          <button onClick={() => setAction('add')} className={cn("flex-1 py-2 text-sm font-bold rounded-lg transition", action === 'add' ? "bg-green-600 text-white" : "text-stone-600")}>+ Add</button>
          <button onClick={() => setAction('decrease')} className={cn("flex-1 py-2 text-sm font-bold rounded-lg transition", action === 'decrease' ? "bg-red-600 text-white" : "text-stone-600")}>- Decrease</button>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-bold text-stone-600 mb-2">Amount (KAS)</label>
          <input type="number" value={amount} onChange={(e) => setAmount(Math.max(0, parseInt(e.target.value) || 0))} className="w-full p-4 border border-amber-300 rounded-xl text-2xl font-bold text-center" min={0} max={action === 'add' ? maxBalance : currentCollateral} />
          <div className="flex justify-between mt-2 text-xs text-stone-500">
            <span>≈ ${KAS_TO_USD(amount)} USD</span>
            <span>Available: {maxBalance.toLocaleString()} KAS</span>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 mb-6">
          {[100, 500, 1000, 5000].map(val => (<button key={val} onClick={() => setAmount(val)} className="py-2 bg-stone-100 hover:bg-stone-200 rounded-lg text-sm font-bold text-stone-700 transition">{val}</button>))}
        </div>

        <div className="bg-stone-50 p-4 rounded-xl border border-stone-200 mb-6">
          <div className="flex justify-between items-center">
            <span className="text-sm text-stone-600">New Collateral</span>
            <span className="text-xl font-black text-amber-900">{action === 'add' ? (currentCollateral + amount).toLocaleString() : Math.max(0, currentCollateral - amount).toLocaleString()} KAS</span>
          </div>
        </div>

        {action === 'decrease' && (<div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 mb-4"><strong>⚠️ Warning:</strong> Decreasing collateral may affect your validator status.</div>)}

        <Button onClick={handleSubmit} className={cn("w-full h-12 text-lg font-bold", action === 'add' ? "bg-green-600 hover:bg-green-500" : "bg-red-600 hover:bg-red-500")}>{action === 'add' ? 'Add' : 'Decrease'} {amount.toLocaleString()} KAS</Button>
      </motion.div>
    </div>
  );
};

// --- COUPON CREATION POPUP ---
const CouponCreationPopup = ({ isOpen, onClose, onCreate }) => {
  const [couponData, setCouponData] = useState({ description: '', discountPercent: 10, dollarPrice: 0, kaspaPrice: 0, expiryDays: 30, maxUses: 100 });

  if (!isOpen) return null;

  const handleDollarChange = (usd) => setCouponData(prev => ({ ...prev, dollarPrice: usd, kaspaPrice: USD_TO_KAS(usd) }));
  const discountedKaspa = Math.round(couponData.kaspaPrice * (1 - couponData.discountPercent / 100));

  const handleCreate = () => {
    onCreate({ ...couponData, discountedKaspa, code: `COUP${Date.now().toString(36).toUpperCase()}`, createdAt: Date.now() });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-[80]">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-black text-purple-900 flex items-center gap-2"><ShoppingBag size={20} /> Create Coupon</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600"><X size={24} /></button>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-bold text-stone-600 mb-2">Description</label>
          <textarea value={couponData.description} onChange={(e) => setCouponData(prev => ({ ...prev, description: e.target.value }))} className="w-full p-3 border border-purple-200 rounded-xl h-20 resize-none" placeholder="e.g., 10% off all items" />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-bold text-stone-600 mb-2">Original Price (USD)</label>
          <div className="relative">
            <span className="absolute left-4 top-3 text-stone-400 font-bold">$</span>
            <input type="number" value={couponData.dollarPrice} onChange={(e) => handleDollarChange(parseFloat(e.target.value) || 0)} className="w-full p-3 pl-8 border border-purple-200 rounded-xl text-lg font-bold" min={0} step={0.01} />
          </div>
        </div>

        <div className="mb-4 p-4 bg-amber-50 rounded-xl border border-amber-200">
          <div className="flex justify-between items-center">
            <span className="text-sm text-amber-700">KAS Price</span>
            <span className="text-xl font-black text-amber-900">{couponData.kaspaPrice.toLocaleString()} KAS</span>
          </div>
          <p className="text-xs text-amber-600 mt-1">Rate: 1 KAS = ${KAS_USD_RATE}</p>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-bold text-stone-600 mb-2">Discount %</label>
          <div className="flex items-center gap-4">
            <input type="range" value={couponData.discountPercent} onChange={(e) => setCouponData(prev => ({ ...prev, discountPercent: parseInt(e.target.value) }))} className="flex-1" min={1} max={50} />
            <span className="text-2xl font-black text-purple-700 w-16 text-right">{couponData.discountPercent}%</span>
          </div>
        </div>

        <div className="mb-6 p-4 bg-green-50 rounded-xl border border-green-200 text-center">
          <p className="text-xs text-green-600 uppercase font-bold mb-1">Coupon Price</p>
          <div className="flex items-center justify-center gap-4">
            <span className="text-lg line-through text-stone-400">${couponData.dollarPrice.toFixed(2)}</span>
            <ArrowRight className="text-green-600" size={20} />
            <div className="text-right">
              <span className="text-2xl font-black text-green-700">{discountedKaspa.toLocaleString()} KAS</span>
              <p className="text-xs text-green-600">≈ ${(discountedKaspa * KAS_USD_RATE).toFixed(2)}</p>
            </div>
          </div>
        </div>

        <Button onClick={handleCreate} disabled={!couponData.description || couponData.kaspaPrice <= 0} className="w-full h-12 bg-purple-600 hover:bg-purple-500 text-lg font-bold">Create Coupon</Button>
      </motion.div>
    </div>
  );
};

// --- INVENTORY ITEM POPUP ---
const InventoryItemPopup = ({ isOpen, onClose, onSave, item = null }) => {
  const [itemData, setItemData] = useState(item || { name: '', description: '', dollarPrice: 0, kaspaPrice: 0, stock: 1, category: 'physical', visualsUrl: '', visualsPlatform: 'Instagram' });

  useEffect(() => { if (item) setItemData(item); else setItemData({ name: '', description: '', dollarPrice: 0, kaspaPrice: 0, stock: 1, category: 'physical', visualsUrl: '', visualsPlatform: 'Instagram' }); }, [item]);

  if (!isOpen) return null;

  const handleDollarChange = (usd) => setItemData(prev => ({ ...prev, dollarPrice: usd, kaspaPrice: USD_TO_KAS(usd) }));

  const handleSave = () => {
    onSave({ ...itemData, id: item?.id || Date.now(), createdAt: item?.createdAt || Date.now(), updatedAt: Date.now() });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-[80]">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-black text-blue-900 flex items-center gap-2"><ShoppingBag size={20} /> {item ? 'Edit' : 'Add'} Item</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600"><X size={24} /></button>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-bold text-stone-600 mb-2">Item Name</label>
          <input type="text" value={itemData.name} onChange={(e) => setItemData(prev => ({ ...prev, name: e.target.value }))} className="w-full p-3 border border-blue-200 rounded-xl" placeholder="e.g., Vintage Jacket" />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-bold text-stone-600 mb-2">Description</label>
          <textarea value={itemData.description} onChange={(e) => setItemData(prev => ({ ...prev, description: e.target.value }))} className="w-full p-3 border border-blue-200 rounded-xl h-20 resize-none" placeholder="Item details..." />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-bold text-stone-600 mb-2">Price (USD)</label>
          <div className="relative">
            <span className="absolute left-4 top-3 text-stone-400 font-bold">$</span>
            <input type="number" value={itemData.dollarPrice} onChange={(e) => handleDollarChange(parseFloat(e.target.value) || 0)} className="w-full p-3 pl-8 border border-blue-200 rounded-xl text-lg font-bold" min={0} step={0.01} />
          </div>
        </div>

        <div className="mb-4 p-4 bg-amber-50 rounded-xl border border-amber-200">
          <div className="flex justify-between items-center">
            <span className="text-sm text-amber-700">KAS Price</span>
            <span className="text-xl font-black text-amber-900">{itemData.kaspaPrice.toLocaleString()} KAS</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs font-bold text-stone-500 mb-1">Stock</label>
            <input type="number" value={itemData.stock} onChange={(e) => setItemData(prev => ({ ...prev, stock: parseInt(e.target.value) || 1 }))} className="w-full p-2 border border-stone-200 rounded-lg" min={1} />
          </div>
          <div>
            <label className="block text-xs font-bold text-stone-500 mb-1">Category</label>
            <select value={itemData.category} onChange={(e) => setItemData(prev => ({ ...prev, category: e.target.value }))} className="w-full p-2 border border-stone-200 rounded-lg">
              <option value="physical">Physical</option>
              <option value="digital">Digital</option>
              <option value="service">Service</option>
            </select>
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-bold text-stone-600 mb-2">Visuals URL</label>
          <div className="flex gap-2">
            <select value={itemData.visualsPlatform} onChange={(e) => setItemData(prev => ({ ...prev, visualsPlatform: e.target.value }))} className="p-2 border border-stone-200 rounded-lg text-sm">
              <option value="Instagram">Instagram</option>
              <option value="TikTok">TikTok</option>
              <option value="Etsy">Etsy</option>
              <option value="Pinterest">Pinterest</option>
            </select>
            <input type="url" value={itemData.visualsUrl} onChange={(e) => setItemData(prev => ({ ...prev, visualsUrl: e.target.value }))} className="flex-1 p-2 border border-stone-200 rounded-lg text-sm" placeholder="https://..." />
          </div>
        </div>

        <Button onClick={handleSave} disabled={!itemData.name || itemData.kaspaPrice <= 0} className="w-full h-12 bg-blue-600 hover:bg-blue-500 text-lg font-bold">{item ? 'Update' : 'Add'} Item</Button>
      </motion.div>
    </div>
  );
};

// --- MUTUAL PAYMENT 2-ROUND FLOW ---
const MutualPaymentFlow = ({ isOpen, onClose }) => {
  const { user } = useContext(GlobalContext);
  const [step, setStep] = useState(1);
  const [role, setRole] = useState(null);
  const [contract, setContract] = useState({ 
    itemPriceKas: 0, 
    sellerCollateralKas: 0, 
    stipulations: '', 
    itemDescription: '', 
    expiryHours: 24 
  });
  const [buyerLocked, setBuyerLocked] = useState(false);
  const [sellerLocked, setSellerLocked] = useState(false);
  const [paymentSent, setPaymentSent] = useState(false);
  const [deliveryConfirmed, setDeliveryConfirmed] = useState(false);
  
  // Mutual release state
  const [buyerRequestedRelease, setBuyerRequestedRelease] = useState(false);
  const [sellerRequestedRelease, setSellerRequestedRelease] = useState(false);

  if (!isOpen) return null;

  const handleLock = () => {
    if (role === 'buyer') {
      setBuyerLocked(true);
      // Simulate seller locking after delay
      setTimeout(() => {
        setSellerLocked(true);
        setStep(4);
      }, 1500);
    } else {
      setSellerLocked(true);
      // Simulate buyer locking after delay
      setTimeout(() => {
        setBuyerLocked(true);
        setStep(4);
      }, 1500);
    }
  };

  const handlePayment = () => {
    setPaymentSent(true);
    // Simulate delivery confirmation after delay
    setTimeout(() => {
      setDeliveryConfirmed(true);
      setStep(5);
    }, 2000);
  };
  
  const handleRequestRelease = () => {
    if (role === 'buyer') {
      setBuyerRequestedRelease(true);
      // Simulate seller also requesting after delay (for demo)
      setTimeout(() => {
        setSellerRequestedRelease(true);
        // Both agreed - mutual release
        setTimeout(() => setStep(7), 1000);
      }, 2000);
    } else {
      setSellerRequestedRelease(true);
      // Simulate buyer also requesting after delay (for demo)
      setTimeout(() => {
        setBuyerRequestedRelease(true);
        // Both agreed - mutual release
        setTimeout(() => setStep(7), 1000);
      }, 2000);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-[70]">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-black text-indigo-900 flex items-center gap-2"><HeartHandshake size={24} /> Mutual Payment</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600"><X size={24} /></button>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-between mb-6 px-4">
          {['Create', 'Role', 'Lock', 'Pay', 'Done'].map((label, i) => (
            <div key={i} className="flex flex-col items-center">
              <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold", step > i + 1 ? "bg-green-500 text-white" : step === i + 1 ? "bg-indigo-600 text-white" : "bg-stone-200 text-stone-500")}>{step > i + 1 ? '✓' : i + 1}</div>
              <span className="text-[10px] mt-1 text-stone-500">{label}</span>
            </div>
          ))}
        </div>

        {/* Step 1: Create */}
        {step === 1 && (
          <div className="space-y-4">
            {/* Clear Process Explanation */}
            <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-200">
              <h4 className="font-bold text-indigo-800 mb-3">How Mutual Pay Works</h4>
              
              <div className="space-y-3">
                <div className="flex gap-3 items-start">
                  <div className="w-6 h-6 bg-indigo-600 text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">1</div>
                  <div>
                    <p className="text-sm font-bold text-indigo-800">Both Lock Funds</p>
                    <p className="text-xs text-indigo-600">Buyer locks item price • Seller locks collateral</p>
                    <p className="text-[10px] text-indigo-500">Funds stay in YOUR wallet - not transferred anywhere</p>
                  </div>
                </div>
                
                <div className="flex gap-3 items-start">
                  <div className="w-6 h-6 bg-indigo-600 text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">2</div>
                  <div>
                    <p className="text-sm font-bold text-indigo-800">Exchange Happens</p>
                    <p className="text-xs text-indigo-600">Seller delivers item • Buyer inspects</p>
                  </div>
                </div>
                
                <div className="flex gap-3 items-start">
                  <div className="w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">3</div>
                  <div>
                    <p className="text-sm font-bold text-green-800">Buyer Confirms Delivery</p>
                    <p className="text-xs text-green-600">Payment transfers to seller • Both collaterals unlock</p>
                  </div>
                </div>
              </div>
            </div>
            
            {/* What happens if there's a problem */}
            <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
              <h4 className="font-bold text-amber-800 mb-2">⚠️ If There's a Problem</h4>
              <div className="space-y-2 text-xs">
                <div className="flex gap-2">
                  <span className="text-green-600 font-bold">✓</span>
                  <span className="text-amber-700"><strong>Both agree to cancel:</strong> Both request release → All funds unlock → No payment</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-red-600 font-bold">✗</span>
                  <span className="text-amber-700"><strong>One refuses:</strong> Deadlock → Both funds stay frozen forever + XP loss</span>
                </div>
              </div>
              <p className="text-[10px] text-amber-600 mt-2 italic">This creates mutual incentive to resolve disputes fairly.</p>
            </div>
            
            {/* Benefits & Risks */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-green-50 rounded-xl border border-green-200">
                <h5 className="font-bold text-green-800 text-xs mb-2">✓ Benefits</h5>
                <ul className="text-[10px] text-green-700 space-y-1">
                  <li>• Trustless - no need to trust stranger</li>
                  <li>• Non-custodial - you control your keys</li>
                  <li>• Seller has skin in the game</li>
                  <li>• Atomic - both complete or neither</li>
                </ul>
              </div>
              <div className="p-3 bg-red-50 rounded-xl border border-red-200">
                <h5 className="font-bold text-red-800 text-xs mb-2">⚠ Risks</h5>
                <ul className="text-[10px] text-red-700 space-y-1">
                  <li>• Deadlock if dispute unresolved</li>
                  <li>• Both lose XP if deadlocked</li>
                  <li>• Funds frozen until resolved</li>
                  <li>• Requires counterparty cooperation</li>
                </ul>
              </div>
            </div>
            
            {/* NOT ESCROW clarification */}
            <div className="p-3 bg-blue-50 rounded-xl border border-blue-200">
              <p className="text-xs text-blue-800">
                <strong>🔒 NOT Escrow:</strong> Your funds stay in YOUR wallet. No third party holds anything. 
                This is a bilateral lock - like two people each freezing their own funds voluntarily.
              </p>
            </div>
            
            {/* Contract Form */}
            <div className="border-t border-stone-200 pt-4">
              <h4 className="font-bold text-stone-700 mb-3">Create Contract</h4>
              
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-bold text-stone-600 mb-1">Item Description</label>
                  <input type="text" value={contract.itemDescription} onChange={(e) => setContract(p => ({ ...p, itemDescription: e.target.value }))} className="w-full p-3 border border-indigo-200 rounded-xl" placeholder="e.g., Vintage Watch, iPhone 15, etc." />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-stone-600 mb-1">Item Price (KAS)</label>
                    <input type="number" value={contract.itemPriceKas} onChange={(e) => setContract(p => ({ ...p, itemPriceKas: parseInt(e.target.value) || 0 }))} className="w-full p-3 border border-green-200 rounded-xl" min={0} />
                    <p className="text-[10px] text-stone-400 mt-1">Buyer locks this</p>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-stone-600 mb-1">Seller Collateral (KAS)</label>
                    <input type="number" value={contract.sellerCollateralKas} onChange={(e) => setContract(p => ({ ...p, sellerCollateralKas: parseInt(e.target.value) || 0 }))} className="w-full p-3 border border-blue-200 rounded-xl" min={0} />
                    <p className="text-[10px] text-stone-400 mt-1">Good faith deposit</p>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-stone-600 mb-1">Terms & Conditions</label>
                  <textarea value={contract.stipulations} onChange={(e) => setContract(p => ({ ...p, stipulations: e.target.value }))} className="w-full p-3 border border-stone-200 rounded-xl h-16 resize-none text-sm" placeholder="Shipping method, condition requirements, timeline..." />
                </div>
              </div>
            </div>
            
            {/* Summary Box */}
            <div className="p-4 bg-stone-100 rounded-xl">
              <h4 className="font-bold text-stone-700 text-sm mb-2">Summary</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 bg-green-100 rounded-lg">
                  <span className="text-green-600">Buyer Locks:</span>
                  <span className="font-bold text-green-800 block text-lg">{contract.itemPriceKas} KAS</span>
                </div>
                <div className="p-2 bg-blue-100 rounded-lg">
                  <span className="text-blue-600">Seller Locks:</span>
                  <span className="font-bold text-blue-800 block text-lg">{contract.sellerCollateralKas} KAS</span>
                </div>
              </div>
              <p className="text-xs text-stone-500 mt-2 text-center">
                Only <strong>{contract.itemPriceKas} KAS</strong> transfers on successful delivery. Collateral returns to each party.
              </p>
            </div>
            
            <Button onClick={() => setStep(2)} disabled={!contract.itemDescription || contract.itemPriceKas <= 0} className="w-full h-12 bg-indigo-600">Continue to Role Selection</Button>
          </div>
        )}

        {/* Step 2: Role */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="p-4 bg-stone-50 rounded-xl">
              <div className="flex justify-between mb-2"><span className="text-sm text-stone-600">Item:</span><span className="font-bold">{contract.itemDescription}</span></div>
              <div className="flex justify-between mb-2"><span className="text-sm text-stone-600">Item Price:</span><span className="font-bold text-green-700">{contract.itemPriceKas} KAS</span></div>
              <div className="flex justify-between"><span className="text-sm text-stone-600">Seller Collateral:</span><span className="font-bold text-blue-700">{contract.sellerCollateralKas} KAS</span></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => { setRole('buyer'); setStep(3); }} className="p-6 bg-green-50 hover:bg-green-100 border-2 border-green-300 rounded-2xl transition">
                <ShoppingBag className="mx-auto mb-2 text-green-600" size={32} />
                <div className="font-bold text-green-800">I'm Buyer</div>
                <div className="text-xs text-green-600">Lock {contract.itemPriceKas} KAS</div>
              </button>
              <button onClick={() => { setRole('seller'); setStep(3); }} className="p-6 bg-blue-50 hover:bg-blue-100 border-2 border-blue-300 rounded-2xl transition">
                <Store className="mx-auto mb-2 text-blue-600" size={32} />
                <div className="font-bold text-blue-800">I'm Seller</div>
                <div className="text-xs text-blue-600">Lock {contract.sellerCollateralKas} KAS</div>
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Lock Funds */}
        {step === 3 && (
          <div className="space-y-4">
            <h3 className="font-bold text-lg text-indigo-800">Step 1: Lock Funds</h3>
            <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
              <p className="text-sm text-amber-800"><strong>Your Role:</strong> {role === 'buyer' ? 'Buyer' : 'Seller'}</p>
              <p className="text-sm text-amber-700 mt-2">
                Lock <strong>{role === 'buyer' ? contract.itemPriceKas : contract.sellerCollateralKas} KAS</strong> in your wallet.
              </p>
              <p className="text-xs text-amber-600 mt-2">
                {role === 'buyer' 
                  ? "This covers the item price. It stays in YOUR wallet until you confirm delivery."
                  : "This is your good-faith collateral. It stays in YOUR wallet and unlocks after sale completes."
                }
              </p>
            </div>
            
            <div className="p-4 bg-stone-50 rounded-xl">
              <h4 className="text-sm font-bold text-stone-700 mb-2">Lock Status</h4>
              <div className="flex items-center gap-2 mb-2">
                <div className={cn("w-4 h-4 rounded-full", buyerLocked ? "bg-green-500" : "bg-stone-300")} />
                <span className="text-sm">Buyer: {buyerLocked ? 'Locked ✓' : 'Waiting...'}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className={cn("w-4 h-4 rounded-full", sellerLocked ? "bg-blue-500" : "bg-stone-300")} />
                <span className="text-sm">Seller: {sellerLocked ? 'Locked ✓' : 'Waiting...'}</span>
              </div>
            </div>
            
            <div className="flex gap-3">
              <Button onClick={() => setStep(2)} variant="outline" className="flex-1 h-12">Back</Button>
              <Button onClick={handleLock} className={cn("flex-1 h-12", role === 'buyer' ? "bg-green-600" : "bg-blue-600")}>
                Lock {role === 'buyer' ? contract.itemPriceKas : contract.sellerCollateralKas} KAS
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Payment & Delivery */}
        {step === 4 && (
          <div className="space-y-4">
            <h3 className="font-bold text-lg text-green-800 flex items-center gap-2"><CheckCircle size={20} /> Step 2: Complete Transaction</h3>
            <div className="p-4 bg-green-50 rounded-xl border border-green-200">
              <p className="text-sm text-green-700">Both parties locked! Now complete the exchange.</p>
            </div>
            
            <div className="p-4 bg-stone-50 rounded-xl">
              <div className="flex items-center gap-2 mb-2">
                <div className={cn("w-4 h-4 rounded-full", paymentSent ? "bg-green-500" : "bg-amber-400 animate-pulse")} />
                <span className="text-sm">{role === 'buyer' ? 'Confirm delivery & release payment' : 'Waiting for buyer confirmation'}</span>
              </div>
            </div>

            {role === 'buyer' ? (
              <>
                <div className="p-6 bg-stone-50 rounded-2xl text-center">
                  <p className="text-sm text-stone-500 mb-2">Releasing to seller:</p>
                  <p className="text-4xl font-black text-amber-900">{contract.itemPriceKas} KAS</p>
                  <p className="text-xs text-stone-400 mt-2">Your {contract.itemPriceKas} KAS collateral unlocks</p>
                </div>
                <Button onClick={handlePayment} className="w-full h-14 text-lg font-bold bg-green-600">
                  Confirm Delivery & Pay
                </Button>
                <button 
                  onClick={() => setStep(6)} 
                  className="w-full text-center text-sm text-red-600 hover:text-red-800 underline mt-2"
                >
                  Problem? Request Mutual Release
                </button>
              </>
            ) : (
              <>
                <div className="p-6 bg-blue-50 rounded-2xl text-center">
                  <Hourglass className="mx-auto mb-2 text-blue-600 animate-pulse" size={32} />
                  <p className="text-sm text-blue-700">Waiting for buyer to confirm delivery...</p>
                  <p className="text-xs text-blue-500 mt-2">Your {contract.sellerCollateralKas} KAS will unlock when confirmed</p>
                </div>
                <button 
                  onClick={() => setStep(6)} 
                  className="w-full text-center text-sm text-red-600 hover:text-red-800 underline mt-4"
                >
                  Problem? Request Mutual Release
                </button>
              </>
            )}
          </div>
        )}
        
        {/* Step 6: Dispute / Mutual Release */}
        {step === 6 && (
          <div className="space-y-4">
            <h3 className="font-bold text-lg text-red-800 flex items-center gap-2"><AlertTriangle size={20} /> Problem? Let's Resolve It</h3>
            
            {/* Clear explanation */}
            <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
              <h4 className="font-bold text-amber-800 mb-2">How Mutual Release Works</h4>
              <div className="space-y-2 text-xs text-amber-700">
                <p>Since there's no third party holding funds, <strong>both parties must agree</strong> to cancel and unlock funds.</p>
              </div>
            </div>
            
            {/* Two possible outcomes */}
            <div className="grid grid-cols-1 gap-3">
              <div className="p-3 bg-green-50 rounded-xl border border-green-200">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle size={16} className="text-green-600" />
                  <span className="font-bold text-green-800 text-sm">If Both Agree to Cancel</span>
                </div>
                <ul className="text-xs text-green-700 ml-6 space-y-1">
                  <li>• Buyer's locked KAS → unlocked, back to buyer</li>
                  <li>• Seller's collateral → unlocked, back to seller</li>
                  <li>• No payment transfers</li>
                  <li>• No XP penalty</li>
                </ul>
              </div>
              
              <div className="p-3 bg-red-50 rounded-xl border border-red-200">
                <div className="flex items-center gap-2 mb-1">
                  <X size={16} className="text-red-600" />
                  <span className="font-bold text-red-800 text-sm">If One Refuses (Deadlock)</span>
                </div>
                <ul className="text-xs text-red-700 ml-6 space-y-1">
                  <li>• Buyer's locked KAS → <strong>frozen forever</strong></li>
                  <li>• Seller's collateral → <strong>frozen forever</strong></li>
                  <li>• Both parties lose XP (-100 each)</li>
                  <li>• Neither can access frozen funds</li>
                </ul>
              </div>
            </div>
            
            {/* Current Status */}
            <div className="p-4 bg-stone-50 rounded-xl border border-stone-200">
              <h4 className="font-bold text-sm text-stone-700 mb-3">Release Request Status</h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-2 bg-white rounded-lg">
                  <div className="flex items-center gap-2">
                    <ShoppingBag size={16} className="text-green-600" />
                    <span className="text-sm">Buyer</span>
                  </div>
                  <span className={cn(
                    "text-sm font-bold px-2 py-1 rounded",
                    buyerRequestedRelease ? "bg-green-100 text-green-700" : "bg-stone-100 text-stone-500"
                  )}>
                    {buyerRequestedRelease ? '✓ Wants to cancel' : 'No request yet'}
                  </span>
                </div>
                <div className="flex items-center justify-between p-2 bg-white rounded-lg">
                  <div className="flex items-center gap-2">
                    <Store size={16} className="text-blue-600" />
                    <span className="text-sm">Seller</span>
                  </div>
                  <span className={cn(
                    "text-sm font-bold px-2 py-1 rounded",
                    sellerRequestedRelease ? "bg-green-100 text-green-700" : "bg-stone-100 text-stone-500"
                  )}>
                    {sellerRequestedRelease ? '✓ Wants to cancel' : 'No request yet'}
                  </span>
                </div>
              </div>
              
              {buyerRequestedRelease && sellerRequestedRelease && (
                <div className="mt-3 p-2 bg-green-100 rounded-lg text-center">
                  <span className="text-green-700 font-bold text-sm">Both agreed! Releasing funds...</span>
                </div>
              )}
            </div>
            
            {/* Warning */}
            <div className="p-3 bg-red-100 border border-red-300 rounded-xl">
              <p className="text-xs text-red-800 text-center font-bold">
                ⚠️ If you request release and the other party refuses, you'll be stuck until they agree or contract expires (deadlock).
              </p>
            </div>
            
            {/* Action Buttons */}
            <Button 
              onClick={handleRequestRelease} 
              disabled={(role === 'buyer' && buyerRequestedRelease) || (role === 'seller' && sellerRequestedRelease)}
              className={cn(
                "w-full h-12",
                (role === 'buyer' && buyerRequestedRelease) || (role === 'seller' && sellerRequestedRelease)
                  ? "bg-stone-300"
                  : "bg-amber-600 hover:bg-amber-500"
              )}
            >
              {(role === 'buyer' && buyerRequestedRelease) || (role === 'seller' && sellerRequestedRelease)
                ? '⏳ Waiting for other party to agree...'
                : 'Request Mutual Release (Cancel Transaction)'
              }
            </Button>
            
            <button 
              onClick={() => setStep(4)} 
              className="w-full text-center text-sm text-indigo-600 hover:text-indigo-800 underline"
            >
              ← Go back and complete transaction instead
            </button>
          </div>
        )}

        {/* Step 5: Complete */}
        {step === 5 && (
          <div className="text-center space-y-6">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto"><CheckCircle className="text-green-600" size={40} /></div>
            <h3 className="text-2xl font-black text-green-700">Transaction Complete!</h3>
            <div className="p-4 bg-stone-50 rounded-xl text-left space-y-2">
              <div className="flex justify-between"><span className="text-sm text-stone-500">Item:</span><span className="font-bold">{contract.itemDescription}</span></div>
              <div className="flex justify-between"><span className="text-sm text-stone-500">Payment transferred:</span><span className="font-bold text-green-700">{contract.itemPriceKas} KAS → Seller</span></div>
              <hr className="my-2 border-stone-200" />
              <div className="flex justify-between text-xs"><span className="text-stone-400">Buyer collateral:</span><span className="text-green-600">Unlocked ✓</span></div>
              <div className="flex justify-between text-xs"><span className="text-stone-400">Seller collateral:</span><span className="text-green-600">Unlocked ✓</span></div>
            </div>
            <Button onClick={onClose} className="w-full h-12 bg-indigo-600">Close</Button>
          </div>
        )}
        
        {/* Step 7: Mutual Release Complete */}
        {step === 7 && (
          <div className="text-center space-y-6">
            <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto"><HeartHandshake className="text-amber-600" size={40} /></div>
            <h3 className="text-2xl font-black text-amber-700">Mutually Released</h3>
            <div className="p-4 bg-stone-50 rounded-xl text-left space-y-2">
              <div className="flex justify-between"><span className="text-sm text-stone-500">Item:</span><span className="font-bold">{contract.itemDescription}</span></div>
              <div className="flex justify-between"><span className="text-sm text-stone-500">Payment:</span><span className="font-bold text-amber-700">No transfer (cancelled)</span></div>
              <hr className="my-2 border-stone-200" />
              <div className="flex justify-between text-xs"><span className="text-stone-400">Buyer collateral:</span><span className="text-green-600">Unlocked ✓</span></div>
              <div className="flex justify-between text-xs"><span className="text-stone-400">Seller collateral:</span><span className="text-green-600">Unlocked ✓</span></div>
            </div>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
              Both parties agreed to cancel. No payment transferred. All locked funds returned to respective owners.
            </div>
            <Button onClick={onClose} className="w-full h-12 bg-amber-600">Close</Button>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <Dashboard />
    </AppProvider>
  );
}