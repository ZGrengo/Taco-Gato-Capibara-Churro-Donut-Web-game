import type { Room, Player, Phase } from "@acme/shared";
import { createPlayer } from "@acme/shared";

/**
 * Generates a random 5-character room code
 * Excludes 0, O, 1, I to avoid confusion
 */
function generateRoomCode(): string {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * In-memory room manager
 */
export class RoomManager {
  private rooms = new Map<string, Room>();
  private playerToRoom = new Map<string, string>(); // playerId -> roomCode

  /**
   * Creates a new room with the given player
   */
  createRoom(playerName: string, playerId: string): Room {
    const code = generateRoomCode();
    const player = createPlayer(playerId, playerName);

    const room: Room = {
      code,
      phase: "LOBBY",
      hostId: playerId,
      players: [player],
      createdAt: Date.now(),
    };

    this.rooms.set(code, room);
    this.playerToRoom.set(playerId, code);
    return room;
  }

  /**
   * Joins a player to an existing room
   */
  joinRoom(code: string, playerName: string, playerId: string): Room | null {
    const room = this.rooms.get(code);
    if (!room) {
      return null;
    }

    // Don't allow joining if game has started
    if (room.phase !== "LOBBY") {
      return null;
    }

    // Check if player is already in this room
    if (room.players.some((p) => p.id === playerId)) {
      return room;
    }

    const player = createPlayer(playerId, playerName);
    room.players.push(player);
    this.playerToRoom.set(playerId, code);
    return room;
  }

  /**
   * Removes a player from their room
   * Returns the updated room or null if room was deleted
   */
  leaveRoom(playerId: string): Room | null {
    const roomCode = this.playerToRoom.get(playerId);
    if (!roomCode) {
      return null;
    }

    const room = this.rooms.get(roomCode);
    if (!room) {
      this.playerToRoom.delete(playerId);
      return null;
    }

    const wasHost = room.hostId === playerId;

    room.players = room.players.filter((p) => p.id !== playerId);
    this.playerToRoom.delete(playerId);

    // Delete room if empty
    if (room.players.length === 0) {
      this.rooms.delete(roomCode);
      return null;
    }

    // Transfer host if needed
    if (wasHost && room.players.length > 0) {
      // Sort by joinedAt and pick the first (oldest player)
      const sortedPlayers = [...room.players].sort(
        (a, b) => a.joinedAt - b.joinedAt
      );
      room.hostId = sortedPlayers[0].id;
    }

    // Reset all ready states when someone leaves in LOBBY phase
    if (room.phase === "LOBBY") {
      room.players.forEach((p) => {
        p.ready = false;
      });
    }

    return room;
  }

  /**
   * Toggles ready state for a player
   */
  toggleReady(playerId: string): Room | null {
    const room = this.getPlayerRoom(playerId);
    if (!room || room.phase !== "LOBBY") {
      return null;
    }

    const player = room.players.find((p) => p.id === playerId);
    if (!player) {
      return null;
    }

    player.ready = !player.ready;
    return room;
  }

  /**
   * Starts the game (changes phase to IN_GAME)
   */
  startGame(playerId: string): Room | null {
    const room = this.getPlayerRoom(playerId);
    if (!room) {
      return null;
    }

    // Only host can start
    if (room.hostId !== playerId) {
      return null;
    }

    // Must be in LOBBY phase
    if (room.phase !== "LOBBY") {
      return null;
    }

    // Must have at least 2 players
    if (room.players.length < 2) {
      return null;
    }

    // All players must be ready (optional but recommended)
    const allReady = room.players.every((p) => p.ready);
    if (!allReady) {
      return null;
    }

    room.phase = "IN_GAME";
    return room;
  }

  /**
   * Gets a room by code
   */
  getRoom(code: string): Room | null {
    return this.rooms.get(code) || null;
  }

  /**
   * Gets the room a player is in
   */
  getPlayerRoom(playerId: string): Room | null {
    const roomCode = this.playerToRoom.get(playerId);
    if (!roomCode) {
      return null;
    }
    return this.rooms.get(roomCode) || null;
  }
}

