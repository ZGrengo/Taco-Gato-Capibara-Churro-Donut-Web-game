/**
 * Game constants
 */
export const KINDS = ["taco", "gato", "capibara", "churro", "donut"] as const;

// Legacy alias for backward compatibility
export const WORDS = KINDS;

export const BG_COLORS = ["yellow", "orange", "green", "blue", "red"] as const;

export const STYLES = ["style1", "style2", "style3"] as const;

export const TOTAL_CARDS = 64;
export const SPECIAL_COUNT = 9;
export const NORMAL_COUNT = 55;

export const CLAIM_WINDOW_MS = 1200; // Duration of claim window in milliseconds

