import { z } from "zod";

/**
 * Zod schemas for validating Socket.IO payloads
 */

// Phase type
export const PhaseSchema = z.enum(["LOBBY", "IN_GAME", "ENDED"]);
export type Phase = z.infer<typeof PhaseSchema>;

// Room creation payload (client -> server)
export const RoomCreateSchema = z.object({
  name: z.string().min(1).max(50),
});

// Room join payload (client -> server)
export const RoomJoinSchema = z.object({
  code: z.string().length(5),
  name: z.string().min(1).max(50),
});

// Ready toggle payload (client -> server) - no payload needed, server toggles
export const ReadyToggleSchema = z.object({});

// Start game payload (client -> server) - no payload needed
export const StartGameSchema = z.object({});

// Flip request payload (client -> server) - no payload needed
export const FlipRequestSchema = z.object({});

// Claim request payload (client -> server) - no payload needed
export const ClaimRequestSchema = z.object({});

// Claim attempt payload (client -> server)
export const ClaimAttemptSchema = z.object({
  claimId: z.string(),
});

// Player schema
export const PlayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  joinedAt: z.number(),
  ready: z.boolean(),
});

// Word type schema (for validation) - using KINDS
export const KindSchema = z.enum(["taco", "gato", "capibara", "churro", "donut"]);
// Legacy alias
export const WordSchema = KindSchema;

export const CardBgColorSchema = z.enum(["yellow", "orange", "green", "blue", "red"]);
export const CardStyleSchema = z.enum(["style1", "style2", "style3"]);
export const SpecialTypeSchema = z.enum(["SPECIAL_1", "SPECIAL_2", "SPECIAL_3"]);

// Card visual schemas
export const CardVisualNormalSchema = z.object({
  kind: KindSchema,
  style: CardStyleSchema,
  bgColor: CardBgColorSchema,
});

export const CardVisualSpecialSchema = z.object({
  kind: z.literal("special"),
  bgColor: CardBgColorSchema,
  specialType: SpecialTypeSchema,
});

export const CardVisualSchema = z.discriminatedUnion("kind", [
  CardVisualNormalSchema,
  CardVisualSpecialSchema,
]);

// Card schema
export const CardSchema = z.object({
  id: z.string(),
  type: z.enum(["NORMAL", "SPECIAL"]),
  word: z.union([KindSchema, z.literal("special")]),
  visual: CardVisualSchema,
});

// Claim window public state (sent to clients)
export const ClaimWindowPublicSchema = z.object({
  claimId: z.string(),
  openedAt: z.number(),
  claimers: z.array(z.string()), // Array of player IDs in order of claim
});

// Game state schema
export const GameStateSchema = z.object({
  turnPlayerId: z.string(),
  turnIndex: z.number(),
  wordIndex: z.number(),
  currentWord: KindSchema,
  pileCount: z.number(),
  topCard: CardSchema.optional(),
  handCounts: z.record(z.string(), z.number()), // Record<playerId, count>
  claim: ClaimWindowPublicSchema.optional(),
});

// Room state (server -> client)
export const RoomStateSchema = z.object({
  code: z.string().length(5),
  phase: PhaseSchema,
  hostId: z.string(),
  players: z.array(PlayerSchema),
  createdAt: z.number(),
  game: GameStateSchema.optional(),
});

// Error payload (server -> client)
export const ErrorSchema = z.object({
  message: z.string(),
});

// Export inferred types
export type RoomCreatePayload = z.infer<typeof RoomCreateSchema>;
export type RoomJoinPayload = z.infer<typeof RoomJoinSchema>;
export type ReadyTogglePayload = z.infer<typeof ReadyToggleSchema>;
export type StartGamePayload = z.infer<typeof StartGameSchema>;
export type FlipRequestPayload = z.infer<typeof FlipRequestSchema>;
export type ClaimRequestPayload = z.infer<typeof ClaimRequestSchema>;
export type ClaimAttemptPayload = z.infer<typeof ClaimAttemptSchema>;
export type ClaimWindowPublic = z.infer<typeof ClaimWindowPublicSchema>;
export type Player = z.infer<typeof PlayerSchema>;
export type Kind = z.infer<typeof KindSchema>;
export type Word = Kind; // Legacy alias
export type CardBgColor = z.infer<typeof CardBgColorSchema>;
export type CardStyle = z.infer<typeof CardStyleSchema>;
export type SpecialType = z.infer<typeof SpecialTypeSchema>;
export type CardVisualNormal = z.infer<typeof CardVisualNormalSchema>;
export type CardVisualSpecial = z.infer<typeof CardVisualSpecialSchema>;
export type CardVisual = z.infer<typeof CardVisualSchema>;
export type Card = z.infer<typeof CardSchema>;
export type GameState = z.infer<typeof GameStateSchema>;
export type RoomState = z.infer<typeof RoomStateSchema>;
export type ErrorPayload = z.infer<typeof ErrorSchema>;

