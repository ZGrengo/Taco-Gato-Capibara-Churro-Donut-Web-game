/**
 * Socket.IO event names shared between client and server
 */
export const EVENTS = {
  // Client -> Server
  ROOM_CREATE: "ROOM_CREATE",
  ROOM_CREATE_SOLO: "ROOM_CREATE_SOLO",
  ROOM_JOIN: "ROOM_JOIN",
  ROOM_LEAVE: "ROOM_LEAVE",
  READY_TOGGLE: "READY_TOGGLE",
  START_GAME: "START_GAME",
  FLIP_REQUEST: "FLIP_REQUEST",
  CLAIM_ATTEMPT: "CLAIM_ATTEMPT",

  // Server -> Client
  ROOM_STATE: "ROOM_STATE",
  ERROR: "ERROR",
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

