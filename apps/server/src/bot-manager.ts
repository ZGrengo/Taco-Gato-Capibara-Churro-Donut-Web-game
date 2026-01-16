import type { RoomWithGame, InternalGameState } from "./room-manager";
import type { Player } from "@acme/shared";

/**
 * Bot Manager - Handles bot behavior and actions
 */
export class BotManager {
  private botTimeouts = new Map<string, NodeJS.Timeout>(); // botId -> timeout

  /**
   * Generates a unique bot ID
   */
  generateBotId(): string {
    return `bot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Creates a bot player
   */
  createBotPlayer(botId: string): Player {
    return {
      id: botId,
      name: "Bot",
      joinedAt: Date.now(),
      ready: true, // Bots are always ready
      isBot: true,
    };
  }

  /**
   * Cleans up bot timeouts for a room
   */
  cleanup(roomCode: string, room: RoomWithGame): void {
    // Clean up all bot timeouts in this room
    const bots = room.players.filter((p) => p.isBot);
    for (const bot of bots) {
      const timeout = this.botTimeouts.get(bot.id);
      if (timeout) {
        clearTimeout(timeout);
        this.botTimeouts.delete(bot.id);
      }
    }
  }

  /**
   * Handles bot turn (flip card)
   */
  handleBotTurn(
    room: RoomWithGame,
    botId: string,
    onFlip: (botId: string) => void
  ): void {
    if (!room.internalGame || room.phase !== "IN_GAME") {
      return;
    }

    const { internalGame } = room;
    const currentPlayer = room.players[internalGame.turnIndex];

    // Check if it's the bot's turn
    if (!currentPlayer || currentPlayer.id !== botId || !currentPlayer.isBot) {
      return;
    }

    // Check if there's an active claim - bot cannot flip during claim window
    if (internalGame.claim) {
      return;
    }

    // Check if bot has cards
    const botHand = internalGame.hands[botId];
    if (!botHand || botHand.length === 0) {
      return;
    }

    // Don't create a new timeout if one already exists for this bot
    if (this.botTimeouts.has(botId)) {
      return;
    }

    // Human-like delay: 600-1200ms
    const delay = 600 + Math.random() * 600;
    
    const timeout = setTimeout(() => {
      this.botTimeouts.delete(botId);
      onFlip(botId);
    }, delay);

    this.botTimeouts.set(botId, timeout);
  }

  /**
   * Handles bot claim decision
   */
  handleBotClaim(
    room: RoomWithGame,
    botId: string,
    onClaim: (botId: string, claimId?: string) => void
  ): void {
    if (!room.internalGame || room.phase !== "IN_GAME") {
      return;
    }

    const { internalGame } = room;
    const claim = internalGame.claim;

    // No active claim window
    if (!claim) {
      // Small chance of false claim (5%)
      if (Math.random() < 0.05 && internalGame.pile.length > 0) {
        // Don't create a new timeout if one already exists for this bot
        if (this.botTimeouts.has(botId)) {
          return;
        }
        const delay = 300 + Math.random() * 200; // 300-500ms for false claim
        const timeout = setTimeout(() => {
          this.botTimeouts.delete(botId);
          onClaim(botId); // No claimId = false claim
        }, delay);
        this.botTimeouts.set(botId, timeout);
      }
      return;
    }

    // Check if bot already claimed
    if (claim.claimers.includes(botId)) {
      return;
    }

    // Check if bot is OUT
    const botStatus = internalGame.statuses[botId] || "ACTIVE";
    if (botStatus === "OUT") {
      return;
    }

    // Calculate claim probability
    let claimProbability = 0.5; // Base 50% (reduced from 70%)
    
    // Increase probability if pile is large (>6 cards)
    if (internalGame.pile.length > 6) {
      claimProbability = 0.65; // 65% for large piles (reduced from 85%)
    }

    // Decide if bot should claim
    if (Math.random() < claimProbability) {
      // Don't create a new timeout if one already exists for this bot
      if (this.botTimeouts.has(botId)) {
        return;
      }
      
      // Longer delay for gestures to simulate completion time
      let delay: number;
      if (claim.gestureType) {
        // For gestures: 2000-4000ms (2-4 seconds) to simulate gesture completion
        delay = 2000 + Math.random() * 2000;
      } else {
        // Regular claim: 500-1200ms (increased from 300-900ms for slower reaction)
        delay = 500 + Math.random() * 700;
      }
      
      const timeout = setTimeout(() => {
        this.botTimeouts.delete(botId);
        // Pass the claimId for valid claims
        onClaim(botId, claim.id);
      }, delay);

      this.botTimeouts.set(botId, timeout);
    }
  }

  /**
   * Processes bot actions for a room
   * Should be called after room state changes
   */
  processBotActions(
    room: RoomWithGame,
    onFlip: (botId: string) => void,
    onClaim: (botId: string, claimId?: string) => void
  ): void {
    if (!room.internalGame || room.phase !== "IN_GAME") {
      return;
    }

    // Find all bots in the room
    const bots = room.players.filter((p) => p.isBot);

    const { internalGame } = room;
    const currentPlayer = room.players[internalGame.turnIndex];

    for (const bot of bots) {
      // Check if it's this bot's turn
      if (currentPlayer?.id === bot.id) {
        this.handleBotTurn(room, bot.id, onFlip);
      }

      // Check if there's an active claim window
      if (internalGame.claim) {
        this.handleBotClaim(room, bot.id, onClaim);
      }
    }
  }
}

// Singleton instance
export const botManager = new BotManager();

