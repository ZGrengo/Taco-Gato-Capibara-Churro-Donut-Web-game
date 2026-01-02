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

// Player schema
export const PlayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  joinedAt: z.number(),
  ready: z.boolean(),
});

// Room state (server -> client)
export const RoomStateSchema = z.object({
  code: z.string().length(5),
  phase: PhaseSchema,
  hostId: z.string(),
  players: z.array(PlayerSchema),
  createdAt: z.number(),
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
export type Player = z.infer<typeof PlayerSchema>;
export type RoomState = z.infer<typeof RoomStateSchema>;
export type ErrorPayload = z.infer<typeof ErrorSchema>;

