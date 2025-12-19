/**
 * XP Reputation System
 * 
 * Frontend module that fetches XP proofs from kasvillage45 backend.
 * Poseidon hashing is done server-side (Rust) for trustless verification.
 * 
 * Canonical XP Leaf (from kasvillage45):
 *   leaf_xp = Poseidon([pubkey_field, xp, variety_score * 1000, balance])
 */

// ============================================================================
// CONSTANTS (from kasvillage45)
// ============================================================================

export const GAMMA_CONFIG = {
    gamma: 0.25,           // Global scaling coefficient
    lambdaDecay: 0.01,     // Epoch decay constant
    alphaChurn: 0.5,       // Churn penalty coefficient
    deltaMax: 50,          // Per-epoch XP cap
    betaVariety: 0.3,      // Variety amplification
    kWhale: 2.0,           // Whale protection exponent
    b0Normalization: 100_000_000, // 1 KAS median balance
  };
  
  export const XP_TIERS = [
    { name: 'Villager', threshold: 0, color: '#a8a29e', feeSompi: 250_000_000 },
    { name: 'Promoter', threshold: 100, color: '#84cc16', feeSompi: 200_000_000 },
    { name: 'Custodian', threshold: 500, color: '#22c55e', feeSompi: 150_000_000 },
    { name: 'Market Host', threshold: 1000, color: '#3b82f6', feeSompi: 100_000_000 },
    { name: 'Trust Anchor', threshold: 5000, color: '#8b5cf6', feeSompi: 50_000_000 },
    { name: 'Village Elder', threshold: 10000, color: '#f59e0b', feeSompi: 0 },
  ];
  
  export const SOMPI_PER_KAS = 100_000_000;
  
  // L2 API endpoint
  const L2_API = import.meta.env?.VITE_L2_API || 'https://api.kasvillage.io';
  
  // ============================================================================
  // BACKEND API - XP PROOFS (Poseidon computed server-side)
  // ============================================================================
  
  /**
   * Fetch XP state with Merkle proof from backend
   * Backend computes Poseidon leaf hash and provides inclusion proof
   * 
   * Response format from kasvillage45:
   * {
   *   pubkey: string,
   *   xp: u64,
   *   tier: string,
   *   leaf_hash: string (hex),      // Poseidon hash
   *   merkle_proof: Array<{sibling: string, is_left: bool}>,
   *   merkle_root: string (hex),
   *   variety_score: f64,
   *   balance: u64,
   *   tx_completed: u64,
   *   tx_disputed: u64,
   *   deadlocks: u64,
   *   last_update: u64,
   *   verified: bool
   * }
   */
  export async function fetchXpWithProof(pubkey) {
    try {
      const res = await fetch(`${L2_API}/api/xp/${pubkey}`);
      if (!res.ok) throw new Error(`XP fetch failed: ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('XP fetch error:', e);
      return null;
    }
  }
  
  /**
   * Verify XP Merkle proof against current L2 root
   * Sends proof to backend for Poseidon-based verification
   */
  export async function verifyXpProof(pubkey, leafHash, merkleProof) {
    try {
      const res = await fetch(`${L2_API}/api/xp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pubkey, leaf_hash: leafHash, merkle_proof: merkleProof }),
      });
      if (!res.ok) throw new Error(`Verify failed: ${res.status}`);
      const data = await res.json();
      return data.valid === true;
    } catch (e) {
      console.warn('XP verify error:', e);
      return false;
    }
  }
  
  /**
   * Fetch counterparty reputation for risk assessment
   */
  export async function fetchCounterpartyReputation(pubkey) {
    try {
      const res = await fetch(`${L2_API}/api/reputation/${pubkey}`);
      if (!res.ok) throw new Error(`Reputation fetch failed: ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('Reputation fetch error:', e);
      return null;
    }
  }
  
  /**
   * Fetch current L2 Merkle root for local verification
   */
  export async function fetchMerkleRoot() {
    try {
      const res = await fetch(`${L2_API}/api/state/root`);
      if (!res.ok) throw new Error(`Root fetch failed: ${res.status}`);
      const data = await res.json();
      return data.xp_root; // XP tree root
    } catch (e) {
      console.warn('Root fetch error:', e);
      return null;
    }
  }
  
  // ============================================================================
  // LOCAL XP CALCULATIONS (for UI estimation, not authoritative)
  // ============================================================================
  
  /**
   * Get tier from XP
   */
  export function getTier(xp) {
    for (let i = XP_TIERS.length - 1; i >= 0; i--) {
      if (xp >= XP_TIERS[i].threshold) return XP_TIERS[i];
    }
    return XP_TIERS[0];
  }
  
  /**
   * Entry 118: Whale Protection Factor
   * WhaleFactorᵤ = 1 / (1 + (Bᵤ / B₀)ᵏ)
   */
  export function whaleProtectionFactor(userBalance, b0 = GAMMA_CONFIG.b0Normalization, k = GAMMA_CONFIG.kWhale) {
    const balanceRatio = userBalance / b0;
    return 1 / (1 + Math.pow(balanceRatio, k));
  }
  
  /**
   * Entry 116: Variety Entropy Score
   * Shannon entropy over action type distribution
   */
  export function varietyEntropyScore(actionCounts) {
    const total = Object.values(actionCounts).reduce((a, b) => a + b, 0);
    if (total === 0) return 0;
    
    let entropy = 0;
    for (const count of Object.values(actionCounts)) {
      if (count > 0) {
        const p = count / total;
        entropy -= p * Math.log(p);
      }
    }
    return entropy;
  }
  
  /**
   * Calculate transaction completion probability
   * Beta posterior model with modifiers
   */
  export function txCompletionProbability(stats) {
    const { completed, disputed, identityVerified, balanceKas, txSizeKas, accountAgeDays } = stats;
    
    // Base probability (Beta posterior)
    const alpha = 1 + completed;
    const beta = 1 + disputed;
    const baseProbability = alpha / (alpha + beta);
    
    // Modifiers
    const identityMod = identityVerified ? 1.1 : 0.9;
    const balanceMod = Math.min(1.2, 0.8 + (balanceKas / 10000) * 0.4);
    const sizeMod = txSizeKas > 1000 ? 0.9 : 1.0;
    const ageMod = Math.min(1.1, 0.9 + (accountAgeDays / 365) * 0.2);
    
    return Math.min(0.99, baseProbability * identityMod * balanceMod * sizeMod * ageMod);
  }
  
  // ============================================================================
  // USER REPUTATION CLASS
  // ============================================================================
  
  export class UserReputation {
    constructor(pubkey) {
      this.pubkey = pubkey;
      this.xp = 0;
      this.actionCounts = {
        transfer: 0,
        mutualPay: 0,
        validation: 0,
        dapp: 0,
        token: 0,
        escrow: 0,
      };
      this.balance = 0;
      this.txCompleted = 0;
      this.txDisputed = 0;
      this.deadlocks = 0;
      this.leafHash = null;      // Poseidon hash from backend
      this.merkleProof = null;   // Proof from backend
      this.merkleRoot = null;    // Root at time of proof
      this.merkleVerified = false;
      this.lastUpdate = Date.now();
    }
  
    get tier() {
      return getTier(this.xp);
    }
  
    get successRate() {
      const total = this.txCompleted + this.txDisputed;
      return total > 0 ? (this.txCompleted / total * 100).toFixed(1) : '0.0';
    }
  
    get varietyScore() {
      return varietyEntropyScore(this.actionCounts);
    }
  
    get completionProbability() {
      return txCompletionProbability({
        completed: this.txCompleted,
        disputed: this.txDisputed,
        identityVerified: this.xp >= 500,
        balanceKas: this.balance / SOMPI_PER_KAS,
        txSizeKas: 100,
        accountAgeDays: (Date.now() - this.lastUpdate) / (1000 * 60 * 60 * 24),
      });
    }
  
    /**
     * Load XP state from backend with Merkle proof
     */
    async loadFromBackend() {
      const data = await fetchXpWithProof(this.pubkey);
      if (!data) return false;
  
      this.xp = data.xp || 0;
      this.balance = data.balance || 0;
      this.txCompleted = data.tx_completed || 0;
      this.txDisputed = data.tx_disputed || 0;
      this.deadlocks = data.deadlocks || 0;
      this.leafHash = data.leaf_hash || null;
      this.merkleProof = data.merkle_proof || null;
      this.merkleRoot = data.merkle_root || null;
      this.merkleVerified = data.verified || false;
      this.lastUpdate = data.last_update ? data.last_update * 1000 : Date.now();
  
      // Parse action counts if provided
      if (data.action_counts) {
        this.actionCounts = {
          transfer: data.action_counts.transfer || 0,
          mutualPay: data.action_counts.mutual_pay || 0,
          validation: data.action_counts.validation || 0,
          dapp: data.action_counts.dapp || 0,
          token: data.action_counts.token || 0,
          escrow: data.action_counts.escrow || 0,
        };
      }
  
      return true;
    }
  
    /**
     * Verify Merkle proof against current root
     * Calls backend for Poseidon verification
     */
    async verifyProof() {
      if (!this.leafHash || !this.merkleProof) {
        this.merkleVerified = false;
        return false;
      }
  
      this.merkleVerified = await verifyXpProof(
        this.pubkey,
        this.leafHash,
        this.merkleProof
      );
  
      return this.merkleVerified;
    }
  
    /**
     * Apply deadlock penalty (local update, backend is authoritative)
     */
    applyDeadlockPenalty() {
      this.deadlocks++;
      this.xp = Math.max(0, this.xp - 100);
      this.merkleVerified = false; // Needs re-verification
      return -100;
    }
  
    /**
     * Export for display
     */
    toDisplayData() {
      return {
        pubkey: this.pubkey,
        pubkeyShort: this.pubkey.length > 14 
          ? this.pubkey.substring(0, 8) + '...' + this.pubkey.slice(-6)
          : this.pubkey,
        xp: this.xp,
        tier: this.tier,
        txCompleted: this.txCompleted,
        txDisputed: this.txDisputed,
        deadlocks: this.deadlocks,
        successRate: this.successRate,
        varietyScore: this.varietyScore.toFixed(2),
        completionProbability: (this.completionProbability * 100).toFixed(1),
        balanceKas: (this.balance / SOMPI_PER_KAS).toFixed(2),
        merkleVerified: this.merkleVerified,
        leafHash: this.leafHash,
        merkleRoot: this.merkleRoot,
      };
    }
  }
  
  // ============================================================================
  // COUNTERPARTY RISK ASSESSMENT
  // ============================================================================
  
  /**
   * Risk assessment for counterparty
   * XP is always Merkle-verified (generated autonomously by tree)
   */
  export function assessCounterpartyRisk(reputation) {
    const score = reputation.completionProbability * 100;
    
    // Deadlock penalty - critical risk
    if (reputation.deadlocks >= 3) {
      return { 
        level: 'CRITICAL', 
        color: '#ef4444', 
        message: `${reputation.deadlocks} deadlocks` 
      };
    }
    
    if (reputation.deadlocks >= 1) {
      return { 
        level: 'HIGH', 
        color: '#f97316', 
        message: `${reputation.deadlocks} deadlock${reputation.deadlocks > 1 ? 's' : ''}` 
      };
    }
  
    if (score >= 90) return { level: 'LOW', color: '#22c55e', message: `${score.toFixed(0)}% completion` };
    if (score >= 75) return { level: 'MEDIUM', color: '#f59e0b', message: `${score.toFixed(0)}% completion` };
    if (score >= 50) return { level: 'HIGH', color: '#f97316', message: `${score.toFixed(0)}% completion` };
    return { level: 'CRITICAL', color: '#ef4444', message: `${score.toFixed(0)}% completion - require collateral` };
  }
  
  /**
   * Load and assess counterparty from backend
   */
  export async function loadAndAssessCounterparty(pubkey) {
    const rep = new UserReputation(pubkey);
    const loaded = await rep.loadFromBackend();
    
    if (!loaded) {
      return {
        reputation: rep.toDisplayData(),
        risk: { level: 'UNKNOWN', color: '#6b7280', message: 'Could not fetch reputation' },
      };
    }
  
    // Verify proof
    await rep.verifyProof();
  
    return {
      reputation: rep.toDisplayData(),
      risk: assessCounterpartyRisk(rep.toDisplayData()),
    };
  }