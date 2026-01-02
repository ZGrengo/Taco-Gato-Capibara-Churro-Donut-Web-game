import { z } from "zod";

/**
 * Zod schemas for validating Socket.IO payloads
 */

// Room creation payload (client -> server)
export const RoomCreateSchema = z.object({
  name: z.string().min(1).max(50),
});

// Room join payload (client -> server)
export const RoomJoinSchema = z.object({
  code: z.string().length(5),
  name: z.string().min(1).max(50),
});

// Player schema
export const PlayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  joinedAt: z.number(),
});

// Room state (server -> client)
export const RoomStateSchema = z.object({
  code: z.string().length(5),
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
export type Player = z.infer<typeof PlayerSchema>;
export type RoomState = z.infer<typeof RoomStateSchema>;
export type ErrorPayload = z.infer<typeof ErrorSchema>;

