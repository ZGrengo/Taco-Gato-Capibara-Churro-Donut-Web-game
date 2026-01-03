import type { Room, Player, Phase, Card, GameState } from "@acme/shared";
import { createPlayer, KINDS, BG_COLORS, STYLES } from "@acme/shared";
import { randomUUID } from "crypto";

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
 * Shuffles an array using Fisher-Yates algorithm
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Generates a complete deck of 64 cards (55 normal + 9 special)
 */
function generateDeck(): Card[] {
  const deck: Card[] = [];

  // Generate 55 normal cards (11 per kind)
  for (const kind of KINDS) {
    // 1 card with style3 (rare)
    const bgColorStyle3 = BG_COLORS[Math.floor(Math.random() * BG_COLORS.length)];
    deck.push({
      id: randomUUID(),
      type: "NORMAL",
      word: kind,
      visual: {
        kind,
        style: "style3",
        bgColor: bgColorStyle3,
      },
    });

    // 5 cards with style1
    for (let i = 0; i < 5; i++) {
      const bgColor = BG_COLORS[i % BG_COLORS.length]; // Cycle through colors
      deck.push({
        id: randomUUID(),
        type: "NORMAL",
        word: kind,
        visual: {
          kind,
          style: "style1",
          bgColor,
        },
      });
    }

    // 5 cards with style2
    for (let i = 0; i < 5; i++) {
      const bgColor = BG_COLORS[(i + 2) % BG_COLORS.length]; // Offset cycle
      deck.push({
        id: randomUUID(),
        type: "NORMAL",
        word: kind,
        visual: {
          kind,
          style: "style2",
          bgColor,
        },
      });
    }
  }

  // Generate 9 special cards (3 of each type)
  const specialTypes: Array<"SPECIAL_1" | "SPECIAL_2" | "SPECIAL_3"> = [
    "SPECIAL_1",
    "SPECIAL_2",
    "SPECIAL_3",
  ];
  for (const specialType of specialTypes) {
    for (let i = 0; i < 3; i++) {
      const bgColor = BG_COLORS[i % BG_COLORS.length];
      deck.push({
        id: randomUUID(),
        type: "SPECIAL",
        word: "special",
        visual: {
          kind: "special",
          bgColor,
          specialType,
        },
      });
    }
  }

  // Shuffle the deck
  return shuffleArray(deck);
}

/**
 * Internal game state (server-side only)
 */
interface InternalGameState {
  deck: Card[];
  discard: Card[];
  currentCard?: Card;
  turnIndex: number;
  wordIndex: number;
  lastFlipAt?: number;
}

/**
 * Extended Room with internal game state
 */
interface RoomWithGame extends Room {
  internalGame?: InternalGameState;
}

/**
 * In-memory room manager
 */
export class RoomManager {
  private rooms = new Map<string, RoomWithGame>();
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
    const playerIndex = room.players.findIndex((p) => p.id === playerId);
    const wasInGame = room.phase === "IN_GAME" && room.internalGame;

    room.players = room.players.filter((p) => p.id !== playerId);
    this.playerToRoom.delete(playerId);

    // Delete room if empty
    if (room.players.length === 0) {
      this.rooms.delete(roomCode);
      return null;
    }

    // If in game, adjust turn index
    if (wasInGame && room.internalGame) {
      // If the leaving player was before or at the current turn index, adjust
      if (playerIndex <= room.internalGame.turnIndex) {
        room.internalGame.turnIndex =
          (room.internalGame.turnIndex - 1 + room.players.length) %
          room.players.length;
      }
      // If less than 2 players remain, end game
      if (room.players.length < 2) {
        room.phase = "ENDED";
        room.internalGame = undefined;
      }
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
   * Initializes the game state for a room
   */
  private initGame(room: RoomWithGame): void {
    // Generate complete deck of 64 cards (55 normal + 9 special)
    const deck = generateDeck();

    room.internalGame = {
      deck,
      discard: [],
      currentCard: undefined,
      turnIndex: 0,
      wordIndex: 0,
    };
  }

  /**
   * Gets the public game state for a room
   */
  getGameState(room: RoomWithGame): GameState | undefined {
    if (!room.internalGame || room.phase !== "IN_GAME") {
      return undefined;
    }

    const { internalGame } = room;
    const turnPlayer = room.players[internalGame.turnIndex];
    if (!turnPlayer) {
      return undefined;
    }

    return {
      turnPlayerId: turnPlayer.id,
      turnIndex: internalGame.turnIndex,
      wordIndex: internalGame.wordIndex,
      currentWord: KINDS[internalGame.wordIndex],
      currentCard: internalGame.currentCard,
      deckCount: internalGame.deck.length,
      discardCount: internalGame.discard.length,
      lastFlipAt: internalGame.lastFlipAt,
    };
  }

  /**
   * Starts the game (changes phase to IN_GAME and initializes game state)
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
    this.initGame(room);
    return room;
  }

  /**
   * Handles a flip request from a player
   */
  flipCard(playerId: string): Room | null {
    const room = this.getPlayerRoom(playerId);
    if (!room || !room.internalGame || room.phase !== "IN_GAME") {
      return null;
    }

    const { internalGame } = room;

    // Validate it's the player's turn
    const currentPlayer = room.players[internalGame.turnIndex];
    if (!currentPlayer || currentPlayer.id !== playerId) {
      return null;
    }

    // If deck is empty, recycle discard (except currentCard)
    if (internalGame.deck.length === 0) {
      if (internalGame.discard.length === 0) {
        // No cards left, game ends?
        return null;
      }
      // Recycle discard into deck (shuffle)
      internalGame.deck = shuffleArray(internalGame.discard);
      internalGame.discard = [];
    }

    // Move currentCard to discard if exists
    if (internalGame.currentCard) {
      internalGame.discard.push(internalGame.currentCard);
    }

    // Draw new card
    const newCard = internalGame.deck.pop();
    if (!newCard) {
      return null;
    }

    internalGame.currentCard = newCard;

    // Advance word index (circular)
    internalGame.wordIndex = (internalGame.wordIndex + 1) % KINDS.length;

    // Advance turn index (circular)
    internalGame.turnIndex = (internalGame.turnIndex + 1) % room.players.length;

    // Update lastFlipAt timestamp
    internalGame.lastFlipAt = Date.now();

    return room;
  }

  /**
   * Gets a room by code
   */
  getRoom(code: string): RoomWithGame | null {
    return this.rooms.get(code) || null;
  }

  /**
   * Gets the room a player is in
   */
  getPlayerRoom(playerId: string): RoomWithGame | null {
    const roomCode = this.playerToRoom.get(playerId);
    if (!roomCode) {
      return null;
    }
    return this.rooms.get(roomCode) || null;
  }
}

