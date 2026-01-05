import type { Room, Player, Phase, Card, GameState, GestureType } from "@acme/shared";
import {
  createPlayer,
  KINDS,
  BG_COLORS,
  STYLES,
  CLAIM_WINDOW_MS,
} from "@acme/shared";
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
 * Claim window internal state
 */
interface ClaimWindow {
  id: string;
  opensAt: number;
  closesAt: number;
  triggerTurnIndex: number; // Index of player who triggered the claim
  claimers: string[]; // Array of player IDs in order of claim
  timeoutId?: NodeJS.Timeout; // Timeout to close the claim window
  gestureType?: GestureType | null; // Gesture required for this claim (null for MATCH)
  specialType?: "SPECIAL_1" | "SPECIAL_2" | "SPECIAL_3"; // Special card type if applicable
}

/**
 * Internal game state (server-side only)
 */
interface InternalGameState {
  hands: Record<string, Card[]>; // playerId -> cards
  pile: Card[]; // Central pile
  turnIndex: number;
  wordIndex: number;
  claim?: ClaimWindow;
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
  private io?: any; // Socket.IO server instance (set externally)

  /**
   * Sets the Socket.IO server instance for emitting events
   */
  setIO(io: any): void {
    this.io = io;
  }

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

    // If in game, adjust turn index and handle hands
    if (wasInGame && room.internalGame) {
      // Remove player's hand (cards are lost)
      delete room.internalGame.hands[playerId];

      // If the leaving player was before or at the current turn index, adjust
      if (playerIndex <= room.internalGame.turnIndex) {
        const nextIndex = this.findNextPlayerWithCards(
          room,
          room.internalGame.turnIndex % room.players.length
        );
        if (nextIndex !== null) {
          room.internalGame.turnIndex = nextIndex;
        }
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

    // Distribute cards evenly to players (round-robin)
    const hands: Record<string, Card[]> = {};
    room.players.forEach((player) => {
      hands[player.id] = [];
    });

    // Round-robin distribution
    let playerIndex = 0;
    for (const card of deck) {
      const playerId = room.players[playerIndex].id;
      hands[playerId].push(card);
      playerIndex = (playerIndex + 1) % room.players.length;
    }

    room.internalGame = {
      hands,
      pile: [],
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

    // Calculate hand counts
    const handCounts: Record<string, number> = {};
    room.players.forEach((player) => {
      handCounts[player.id] = internalGame.hands[player.id]?.length || 0;
    });

    // Get top card from pile
    const topCard =
      internalGame.pile.length > 0
        ? internalGame.pile[internalGame.pile.length - 1]
        : undefined;

    // Build claim window public state if exists
    const claim = internalGame.claim
      ? {
          claimId: internalGame.claim.id,
          openedAt: internalGame.claim.opensAt,
          claimers: [...internalGame.claim.claimers],
          reason:
            internalGame.pile.length > 0 &&
            internalGame.pile[internalGame.pile.length - 1]?.type === "SPECIAL"
              ? ("SPECIAL" as const)
              : ("MATCH" as const),
          gestureType: internalGame.claim.gestureType ?? null,
          specialType: internalGame.claim.specialType,
        }
      : undefined;

    return {
      turnPlayerId: turnPlayer.id,
      turnIndex: internalGame.turnIndex,
      wordIndex: internalGame.wordIndex,
      currentWord: KINDS[internalGame.wordIndex],
      pileCount: internalGame.pile.length,
      topCard,
      handCounts,
      claim,
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
   * Resolves and closes the claim window
   */
  private resolveClaim(room: RoomWithGame): void {
    if (!room.internalGame?.claim) return;

    const claim = room.internalGame.claim;
    const allPlayerIds = room.players.map((p) => p.id);
    const nonClaimers = allPlayerIds.filter(
      (playerId) => !claim.claimers.includes(playerId)
    );

    // Clear timeout if exists
    if (claim.timeoutId) {
      clearTimeout(claim.timeoutId);
    }

    if (nonClaimers.length > 0) {
      // CASE A: Not everyone claimed - distribute pile to non-claimers
      const pile = [...room.internalGame.pile];
      room.internalGame.pile = [];

      // Distribute round-robin
      let cardIndex = 0;
      for (const card of pile) {
        const playerId = nonClaimers[cardIndex % nonClaimers.length];
        const hand = room.internalGame?.hands[playerId];
        if (hand) {
          hand.push(card);
        }
        cardIndex++;
      }
    } else {
      // CASE B: Everyone claimed - last claimer (slowest) loses
      if (claim.claimers.length > 0) {
        const loserId = claim.claimers[claim.claimers.length - 1];
        const loserHand = room.internalGame.hands[loserId];
        if (loserHand) {
          loserHand.push(...room.internalGame.pile);
        }
      }
      room.internalGame.pile = [];
    }

    // Clear claim
    room.internalGame.claim = undefined;

    // Reset word index to 0 (taco) after claim resolution
    if (room.internalGame) {
      room.internalGame.wordIndex = 0;

      // Advance turn index to next player with cards
      const nextIndex = this.findNextPlayerWithCards(
        room,
        (claim.triggerTurnIndex + 1) % room.players.length
      );
      if (nextIndex === null) {
        // No players with cards, end game
        room.phase = "ENDED";
        room.internalGame = undefined;
      } else {
        room.internalGame.turnIndex = nextIndex;
      }
    }
  }

  /**
   * Finds next player with cards
   */
  private findNextPlayerWithCards(
    room: RoomWithGame,
    startIndex: number
  ): number | null {
    const { internalGame } = room;
    if (!internalGame) return null;

    for (let i = 0; i < room.players.length; i++) {
      const index = (startIndex + i) % room.players.length;
      const player = room.players[index];
      const hand = internalGame.hands[player.id];
      if (hand && hand.length > 0) {
        return index;
      }
    }
    return null;
  }

  /**
   * Maps special type to gesture type
   */
  private mapSpecialTypeToGesture(specialType: "SPECIAL_1" | "SPECIAL_2" | "SPECIAL_3"): GestureType {
    switch (specialType) {
      case "SPECIAL_1":
        return "CLICK_FRENZY";
      case "SPECIAL_2":
        return "BUBBLES";
      case "SPECIAL_3":
        return "CIRCLE";
    }
  }

  /**
   * Opens a claim window for a room
   */
  private openClaimWindow(
    room: RoomWithGame,
    reason: "MATCH" | "SPECIAL",
    card?: Card
  ): void {
    if (!room.internalGame) return;

    const now = Date.now();
    const claimId = randomUUID();

    // Clear any existing timeout
    if (room.internalGame.claim?.timeoutId) {
      clearTimeout(room.internalGame.claim.timeoutId);
    }

    // Determine gesture type and special type if it's a SPECIAL card
    let gestureType: GestureType | null = null;
    let specialType: "SPECIAL_1" | "SPECIAL_2" | "SPECIAL_3" | undefined = undefined;

    if (reason === "SPECIAL" && card && card.type === "SPECIAL" && card.visual.kind === "special") {
      specialType = card.visual.specialType;
      gestureType = this.mapSpecialTypeToGesture(specialType);
    }

    room.internalGame.claim = {
      id: claimId,
      opensAt: now,
      closesAt: now + CLAIM_WINDOW_MS,
      triggerTurnIndex: room.internalGame.turnIndex,
      claimers: [],
      gestureType,
      specialType,
    };

    // Set timeout to resolve claim
    room.internalGame.claim.timeoutId = setTimeout(() => {
      this.resolveClaim(room);
      if (this.io && room.code) {
        const gameState = this.getGameState(room);
        this.io.to(room.code).emit("ROOM_STATE", {
          code: room.code,
          phase: room.phase,
          hostId: room.hostId,
          players: room.players,
          createdAt: room.createdAt,
          game: gameState,
        });
      }
    }, CLAIM_WINDOW_MS);
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

    // Cannot flip if claim is active
    if (internalGame.claim) {
      return null;
    }

    // Validate it's the player's turn
    const currentPlayer = room.players[internalGame.turnIndex];
    if (!currentPlayer || currentPlayer.id !== playerId) {
      return null;
    }

    // Check if player has cards
    const playerHand = internalGame.hands[playerId];
    if (!playerHand || playerHand.length === 0) {
      // Skip this player's turn
      const nextIndex = this.findNextPlayerWithCards(
        room,
        (internalGame.turnIndex + 1) % room.players.length
      );
      if (nextIndex === null) {
        // No players with cards, end game
        room.phase = "ENDED";
        room.internalGame = undefined;
        return room;
      }
      internalGame.turnIndex = nextIndex;
      return room;
    }

    // Take card from front of hand and add to pile
    const card = playerHand.shift();
    if (!card) {
      return null;
    }

    internalGame.pile.push(card);

    // Check if match triggers claim window
    const currentWord = KINDS[internalGame.wordIndex];
    const isMatch = card.word === currentWord || card.type === "SPECIAL";

    if (isMatch) {
      // Open claim window (pass card to determine gesture type if SPECIAL)
      this.openClaimWindow(
        room,
        card.type === "SPECIAL" ? "SPECIAL" : "MATCH",
        card
      );
    } else {
      // Advance word index (circular) only if no claim
      internalGame.wordIndex = (internalGame.wordIndex + 1) % KINDS.length;
    }

    // Advance turn index to next player with cards (if no claim opened)
    if (!internalGame.claim) {
      const nextIndex = this.findNextPlayerWithCards(
        room,
        (internalGame.turnIndex + 1) % room.players.length
      );
      if (nextIndex === null) {
        // No players with cards, end game
        room.phase = "ENDED";
        room.internalGame = undefined;
        return room;
      }
      internalGame.turnIndex = nextIndex;
    }

    return room;
  }

  /**
   * Handles a claim attempt from a player
   */
  claimAttempt(playerId: string, claimId: string): Room | null {
    const room = this.getPlayerRoom(playerId);
    if (!room || !room.internalGame || room.phase !== "IN_GAME") {
      return null;
    }

    const { internalGame } = room;
    const now = Date.now();

    // CASE C: False slap - claim outside window or wrong claimId
    if (
      !internalGame.claim ||
      internalGame.claim.id !== claimId ||
      now >= internalGame.claim.closesAt
    ) {
      // Player takes entire pile if not empty
      if (internalGame.pile.length > 0) {
        const playerHand = internalGame.hands[playerId];
        if (playerHand) {
          playerHand.push(...internalGame.pile);
        }
        internalGame.pile = [];
      }

      // Clear claim if exists
      if (internalGame.claim) {
        if (internalGame.claim.timeoutId) {
          clearTimeout(internalGame.claim.timeoutId);
        }
        internalGame.claim = undefined;
      }

      return room;
    }

    // Valid claim - add player to claimers if not already there
    if (!internalGame.claim.claimers.includes(playerId)) {
      internalGame.claim.claimers.push(playerId);
    }

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

