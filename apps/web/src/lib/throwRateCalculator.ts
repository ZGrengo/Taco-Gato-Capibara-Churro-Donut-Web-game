/**
 * Throw Rate Calculator
 * 
 * Calculates progressive pitch for card_throw sound effect.
 * As the pile grows, the sound becomes lower and heavier (more grave).
 */

/**
 * Compute target throw rate (pitch) based on pile count and optional turn streak
 * 
 * @param pileCount - Current number of cards in the pile (primary factor, 75% weight)
 * @param turnStreak - Optional consecutive turn streak (secondary factor, 25% weight)
 * @returns Target pitch rate between 0.72 and 1.38 (doubled range for testing)
 */
export function computeThrowRate(pileCount: number, turnStreak: number = 0): number {
  // Target: ~0.1 change per card (increased from ~0.063)
  // Range: 1.38 (high) to 0.72 (low) = 0.66 total
  // For ~0.1 per card: 0.66 / 0.1 ≈ 6.6 cards to span full range
  
  // Use more linear approach with reduced max pile for sensitivity
  // Normalize pileCount: max effective pile ~7 cards for full range
  const normalizedPile = Math.min(pileCount / 7, 1);
  // Use linear curve (power 1.0) for consistent 0.1 change per card
  const pileFactor = normalizedPile; // Linear: direct relationship
  
  // Normalize turnStreak (assuming max streak of ~10 turns)
  const normalizedStreak = Math.min(turnStreak / 10, 1);
  const streakFactor = normalizedStreak * normalizedStreak; // Quadratic curve
  
  // Combine factors: pileCount 75%, turnStreak 25%
  const combinedFactor = pileFactor * 0.75 + streakFactor * 0.25;
  
  // Map to pitch range: 1.38 (high/normal) down to 0.72 (low/heavy)
  // Inverse relationship: more cards = lower pitch
  // Linear calculation for ~0.1 change per card
  const baseRate = 1.38 - (combinedFactor * (1.38 - 0.72));
  
  // Add small jitter (+-0.02) for variety
  const jitter = (Math.random() - 0.5) * 0.04; // -0.02 to +0.02
  
  // Clamp final rate
  return Math.max(0.72, Math.min(1.38, baseRate + jitter));
}

/**
 * Linear interpolation (lerp) between two values
 * 
 * @param current - Current value
 * @param target - Target value
 * @param alpha - Interpolation factor (0-1), higher = faster change
 * @returns Interpolated value
 */
export function lerp(current: number, target: number, alpha: number): number {
  return current + (target - current) * alpha;
}

