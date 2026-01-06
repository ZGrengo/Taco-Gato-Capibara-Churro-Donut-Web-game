import type { Room, Player, Phase, Card, GameState, GestureType, PlayerGameStatus } from "@acme/shared";
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
  statuses: Record<string, "ACTIVE" | "PENDING_EXIT" | "OUT">; // playerId -> status
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
      // Remove player's status
      delete room.internalGame.statuses[playerId];

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

      // Update player statuses and check end game
      this.updatePlayerStatuses(room);
      this.checkEndGame(room);

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

    // Initialize all players as ACTIVE
    const statuses: Record<string, PlayerGameStatus> = {};
    room.players.forEach((player) => {
      statuses[player.id] = "ACTIVE";
    });

    room.internalGame = {
      hands,
      pile: [],
      turnIndex: 0,
      wordIndex: 0, // Start at "taco" (index 0)
      statuses,
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

    // Build player statuses (public)
    const playerStatuses: Record<string, PlayerGameStatus> = {};
    room.players.forEach((player) => {
      playerStatuses[player.id] = internalGame.statuses[player.id] || "ACTIVE";
    });

    // Get top card from pile
    const topCard =
      internalGame.pile.length > 0
        ? internalGame.pile[internalGame.pile.length - 1]
        : undefined;

    // Calculate spoken word (word that was "said" in the last flip)
    const spokenWord =
      internalGame.pile.length > 0
        ? KINDS[(internalGame.pile.length - 1) % KINDS.length]
        : null;

    // Build claim window public state if exists
    const claim = internalGame.claim
      ? {
          id: internalGame.claim.id,
          opensAt: internalGame.claim.opensAt,
          closesAt: internalGame.claim.closesAt,
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
      currentWord: KINDS[internalGame.wordIndex], // NEXT word (for UI)
      spokenWord, // Word that was "said" in the last flip
      pileCount: internalGame.pile.length,
      topCard,
      handCounts,
      playerStatuses,
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
   * Updates player statuses based on hand counts
   */
  private updatePlayerStatuses(room: RoomWithGame): void {
    if (!room.internalGame) return;

    room.players.forEach((player) => {
      const handCount = room.internalGame!.hands[player.id]?.length || 0;
      const currentStatus = room.internalGame!.statuses[player.id] || "ACTIVE";

      // If OUT, stay OUT
      if (currentStatus === "OUT") {
        return;
      }

      // If has cards, must be ACTIVE
      if (handCount > 0) {
        room.internalGame!.statuses[player.id] = "ACTIVE";
      } else {
        // If no cards and not OUT, set to PENDING_EXIT
        room.internalGame!.statuses[player.id] = "PENDING_EXIT";
      }
    });
  }

  /**
   * Checks if game should end and sets phase to ENDED if needed
   */
  private checkEndGame(room: RoomWithGame): void {
    if (!room.internalGame || room.phase !== "IN_GAME") return;

    // Get participants (players who are not OUT)
    const participants = room.players.filter(
      (p) => room.internalGame!.statuses[p.id] !== "OUT"
    );

    // Count participants with cards
    const aliveWithCards = participants.filter(
      (p) => (room.internalGame!.hands[p.id]?.length || 0) > 0
    );

    if (aliveWithCards.length <= 1) {
      room.phase = "ENDED";
      // Clear any active claim
      if (room.internalGame.claim?.timeoutId) {
        clearTimeout(room.internalGame.claim.timeoutId);
      }
      room.internalGame.claim = undefined;
      // Note: winnerId could be added to RoomState if needed
    }
  }

  /**
   * Resolves and closes the claim window
   */
  private resolveClaim(room: RoomWithGame): void {
    if (!room.internalGame?.claim) return;

    const claim = room.internalGame.claim;
    
    // Get participants (players who are not OUT)
    const participants = room.players.filter(
      (p) => room.internalGame!.statuses[p.id] !== "OUT"
    );
    const participantIds = participants.map((p) => p.id);
    
    // Calculate non-claimers only among participants
    const nonClaimers = participantIds.filter(
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

    // Update player statuses after distributing cards
    this.updatePlayerStatuses(room);

    // Handle PENDING_EXIT -> OUT transition
    // Players in PENDING_EXIT who claimed and still have 0 cards become OUT
    const pendingExitPlayers = room.players.filter(
      (p) => room.internalGame!.statuses[p.id] === "PENDING_EXIT"
    );

    for (const player of pendingExitPlayers) {
      const handCount = room.internalGame!.hands[player.id]?.length || 0;
      const claimedInThisWindow = claim.claimers.includes(player.id);

      // If they claimed and still have 0 cards, they exit (become OUT)
      if (claimedInThisWindow && handCount === 0) {
        room.internalGame!.statuses[player.id] = "OUT";
      }
      // If they received cards, status was already updated to ACTIVE by updatePlayerStatuses
    }

    // Clear claim
    room.internalGame.claim = undefined;

    // Reset word index to 0 ("taco") after claim resolution
    if (room.internalGame) {
      room.internalGame.wordIndex = 0;

      // Advance turn index to next player with cards
      const nextIndex = this.findNextPlayerWithCards(
        room,
        (claim.triggerTurnIndex + 1) % room.players.length
      );
      if (nextIndex === null) {
        // Check end game condition
        this.checkEndGame(room);
      } else {
        room.internalGame.turnIndex = nextIndex;
      }
    }

    // Check end game after claim resolution
    this.checkEndGame(room);
  }

  /**
   * Finds next player with cards
   * Only considers ACTIVE players (not PENDING_EXIT or OUT)
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
      const status = internalGame.statuses[player.id] || "ACTIVE";
      // Only consider ACTIVE players (skip OUT and PENDING_EXIT)
      if (status !== "ACTIVE") {
        continue;
      }
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

    // Check if player is OUT or PENDING_EXIT (cannot flip)
    const playerStatus = internalGame.statuses[playerId] || "ACTIVE";
    if (playerStatus === "OUT" || playerStatus === "PENDING_EXIT") {
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

    // Capture pile size BEFORE adding the card
    const pileSizeBeforeFlip = internalGame.pile.length;

    // Take card from front of hand and add to pile
    const card = playerHand.shift();
    if (!card) {
      return null;
    }

    internalGame.pile.push(card);

    // Calculate spoken word for this flip based on pile size BEFORE flip
    // This ensures the word matches what was "said" when flipping
    const spokenWordForThisFlip = KINDS[pileSizeBeforeFlip % KINDS.length];

    // Check if match triggers claim window
    const isMatch =
      card.type === "SPECIAL" ||
      (card.type === "NORMAL" && card.word === spokenWordForThisFlip);

    if (isMatch) {
      // Open claim window (pass card to determine gesture type if SPECIAL)
      this.openClaimWindow(
        room,
        card.type === "SPECIAL" ? "SPECIAL" : "MATCH",
        card
      );
    }

    // Always synchronize wordIndex with pile length (NEXT word for UI)
    // wordIndex represents the word that will be "said" in the next flip
    if (internalGame.pile.length === 0) {
      internalGame.wordIndex = 0;
    } else {
      internalGame.wordIndex = internalGame.pile.length % KINDS.length;
    }

    // Update player statuses based on hand counts
    this.updatePlayerStatuses(room);

    // Advance turn index to next player with cards (if no claim opened)
    if (!internalGame.claim) {
      const nextIndex = this.findNextPlayerWithCards(
        room,
        (internalGame.turnIndex + 1) % room.players.length
      );
      if (nextIndex === null) {
        // Check end game condition
        this.checkEndGame(room);
        return room;
      }
      internalGame.turnIndex = nextIndex;
    }

    return room;
  }

  /**
   * Handles a claim attempt from a player
   */
  claimAttempt(playerId: string, claimId?: string): Room | null {
    const room = this.getPlayerRoom(playerId);
    if (!room || !room.internalGame || room.phase !== "IN_GAME") {
      return null;
    }

    const { internalGame } = room;
    const currentPlayerStatus = internalGame.statuses[playerId] || "ACTIVE";

    // OUT players cannot claim
    if (currentPlayerStatus === "OUT") {
      return null;
    }

    const now = Date.now();

    // Determine if this is a valid claim attempt
    const hasActiveClaim = internalGame.claim && now < internalGame.claim.closesAt;
    const claimIdMatches = hasActiveClaim && claimId && internalGame.claim?.id === claimId;

    // CASE C: False slap - no active claim, or claimId provided but doesn't match, or expired
    if (
      !hasActiveClaim ||
      (claimId && !claimIdMatches) ||
      (hasActiveClaim && internalGame.claim && now >= internalGame.claim.closesAt)
    ) {
      // Player takes entire pile if not empty
      if (internalGame.pile.length > 0) {
        const playerHand = internalGame.hands[playerId];
        if (playerHand) {
          playerHand.push(...internalGame.pile);
        }
        internalGame.pile = [];
      }

      // Update statuses after false slap
      this.updatePlayerStatuses(room);

      // Clear claim if exists
      if (internalGame.claim) {
        if (internalGame.claim.timeoutId) {
          clearTimeout(internalGame.claim.timeoutId);
        }
        internalGame.claim = undefined;
      }

      // Check end game
      this.checkEndGame(room);

      return room;
    }

    // Valid claim - add player to claimers if not already there
    // Only allow if player is not OUT (already checked above)
    // This handles both: claimId provided and matches, OR claimId absent but claim is active
    if (internalGame.claim && !internalGame.claim.claimers.includes(playerId)) {
      internalGame.claim.claimers.push(playerId);

      // Check if all active participants have claimed
      const participants = room.players.filter(
        (p) => internalGame.statuses[p.id] !== "OUT"
      );
      const participantIds = participants.map((p) => p.id);
      const allClaimed = participantIds.every((id) =>
        internalGame.claim!.claimers.includes(id)
      );

      // If all participants have claimed, resolve immediately
      if (allClaimed && internalGame.claim) {
        this.resolveClaim(room);
        // Emit room state after resolving
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
        return room;
      }
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

