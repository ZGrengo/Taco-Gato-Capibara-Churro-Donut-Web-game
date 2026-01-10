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

export const CLAIM_WINDOW_MS = 7000; // Duration of claim window in milliseconds (7 seconds)

// Gesture constants
export const CLICK_FRENZY_REQUIRED_CLICKS = 10;
export const CLICK_FRENZY_MIN_INTERVAL_MS = 40;

// Bubbles gesture constants
export const BUBBLES_COUNT = 4;
export const BUBBLES_MIN_DISTANCE_PX = 70;
export const BUBBLES_SIZE_PX = 56;

// Circle gesture constants
export const CIRCLE_MIN_PATH_LEN = 300;
export const CIRCLE_CLOSE_DIST = 40;
export const CIRCLE_MIN_RADIUS = 40;
export const CIRCLE_MAX_RADIUS_VAR = 0.35;
export const CIRCLE_TARGET_CENTER_TOL = 70;
export const CIRCLE_MIN_POINTS = 12;

