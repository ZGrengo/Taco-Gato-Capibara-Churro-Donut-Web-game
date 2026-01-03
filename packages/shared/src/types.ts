import type {
  Player,
  RoomState,
  Phase,
  Kind,
  Word,
  CardBgColor,
  CardStyle,
  SpecialType,
  CardVisualNormal,
  CardVisualSpecial,
  CardVisual,
  Card,
  GameState,
} from "./schemas";

/**
 * Base types for the game (can be extended)
 */

// Re-export types from schemas for convenience
export type {
  Player,
  RoomState,
  Phase,
  Kind,
  Word,
  CardBgColor,
  CardStyle,
  SpecialType,
  CardVisualNormal,
  CardVisualSpecial,
  CardVisual,
  Card,
  GameState,
} from "./schemas";

/**
 * In-memory room data structure (used in server)
 */
export interface Room {
  code: string;
  phase: Phase;
  hostId: string;
  players: Player[];
  createdAt: number;
}

/**
 * Helper to create a player
 */
export function createPlayer(id: string, name: string): Player {
  return {
    id,
    name,
    joinedAt: Date.now(),
    ready: false,
  };
}

