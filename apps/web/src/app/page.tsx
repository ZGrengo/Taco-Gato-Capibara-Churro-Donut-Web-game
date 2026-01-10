"use client";

import { useEffect, useState, useRef, useCallback, memo } from "react";
import { io, Socket } from "socket.io-client";
import {
  EVENTS,
  type RoomState,
  type ErrorPayload,
  type GameState,
  type Card,
  type GestureType,
  CLAIM_WINDOW_MS,
  CLICK_FRENZY_REQUIRED_CLICKS,
  CLICK_FRENZY_MIN_INTERVAL_MS,
  BUBBLES_COUNT,
  BUBBLES_MIN_DISTANCE_PX,
  BUBBLES_SIZE_PX,
  CIRCLE_MIN_PATH_LEN,
  CIRCLE_CLOSE_DIST,
  CIRCLE_MIN_RADIUS,
  CIRCLE_MAX_RADIUS_VAR,
  CIRCLE_TARGET_CENTER_TOL,
  CIRCLE_MIN_POINTS,
} from "@acme/shared";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ClickFrenzyGesture } from "../components/ClickFrenzyGesture";
import { BubblesGesture } from "../components/BubblesGesture";
import { CircleGesture } from "../components/CircleGesture";
import { DeckStack } from "../components/DeckStack";
import { PileCenter } from "../components/PileCenter";
import { FlyingCardLayer } from "../components/FlyingCardLayer";
import { ClickablePileArea } from "../components/ClickablePileArea";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";

// Sound effects hook (placeholder for future audio implementation)
function playSfx(name: 'oops' | 'flip' | 'slap' | 'pop') {
  // TODO: Implement audio playback
  // Example: new Audio(`/sounds/${name}.mp3`).play();
  console.log(`[SFX] Playing: ${name}`);
}

// Card Display Component - memoized to prevent unnecessary re-renders
const CardDisplay = memo(function CardDisplay({ card }: { card: Card }) {
  const bgColorClasses = {
    yellow: "bg-yellow-400",
    orange: "bg-orange-400",
    green: "bg-green-400",
    blue: "bg-blue-400",
    red: "bg-red-400",
  };

  const bgColor = bgColorClasses[card.visual.bgColor] || "bg-gray-400";
  const [imageError, setImageError] = useState(false);

  if (card.type === "SPECIAL" && card.visual.kind === "special") {
    // Map SPECIAL_1 -> special_1.png, SPECIAL_2 -> special_2.png, etc.
    const specialTypeToFileName: Record<"SPECIAL_1" | "SPECIAL_2" | "SPECIAL_3", string> = {
      SPECIAL_1: "special_1",
      SPECIAL_2: "special_2",
      SPECIAL_3: "special_3",
    };
    // Map SPECIAL_1 -> "Frenzy click", SPECIAL_2 -> "¡Bubbles!", SPECIAL_3 -> "Circles"
    const specialTypeToDisplayName: Record<"SPECIAL_1" | "SPECIAL_2" | "SPECIAL_3", string> = {
      SPECIAL_1: "Frenzy click",
      SPECIAL_2: "¡Bubbles!",
      SPECIAL_3: "Circles",
    };
    const fileName = specialTypeToFileName[card.visual.specialType];
    const displayName = specialTypeToDisplayName[card.visual.specialType];
    const imagePath = `/assets/specials/${fileName}.png`;

    return (
      <motion.div
        layoutId={`card-${card.id}`}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        transition={{ duration: 0.3 }}
        className={`${bgColor} rounded-xl shadow-xl border-4 border-gray-300 dark:border-gray-600 w-56 h-72 mx-auto flex flex-col items-center justify-center p-4 relative overflow-hidden`}
      >
        {!imageError && (
          <div className="absolute inset-0 flex items-center justify-center">
            <img
              src={imagePath}
              alt={`Special card ${displayName}`}
              className="object-contain w-full h-full"
              onError={() => setImageError(true)}
            />
          </div>
        )}
        {/* Fallback text if image fails to load */}
        {imageError && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <p className="text-2xl font-bold text-white mb-2">SPECIAL</p>
              <p className="text-lg text-white/90">{displayName}</p>
            </div>
          </div>
        )}
        {/* Card label */}
        <div className="absolute bottom-2 left-0 right-0 text-center">
          <p className="text-sm font-semibold text-white/90 uppercase drop-shadow">
            {displayName}
          </p>
        </div>
      </motion.div>
    );
  }

  // NORMAL card - visual.kind must be one of the normal kinds
  if (card.visual.kind !== "special") {
    const imagePath = `/assets/${card.visual.kind}/${card.visual.style}.png`;

    return (
      <motion.div
        layoutId={`card-${card.id}`}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        transition={{ duration: 0.3 }}
        className={`${bgColor} rounded-xl shadow-xl border-4 border-gray-300 dark:border-gray-600 w-56 h-72 mx-auto flex flex-col items-center justify-center p-4 relative overflow-hidden`}
      >
      {!imageError && (
        <div className="absolute inset-0 flex items-center justify-center">
          <img
            src={imagePath}
            alt={`${card.visual.kind} ${card.visual.style}`}
            className="object-contain w-full h-full"
            onError={() => setImageError(true)}
          />
        </div>
      )}
      {/* Fallback text if image fails to load */}
      {imageError && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-3xl font-bold text-white uppercase drop-shadow-lg">
            {card.visual.kind}
          </p>
        </div>
      )}
      {/* Card label */}
      <div className="absolute bottom-2 left-0 right-0 text-center">
        <p className="text-sm font-semibold text-white/90 uppercase drop-shadow">
          {card.visual.kind}
        </p>
      </div>
      </motion.div>
    );
  }

  // Fallback (shouldn't happen)
  return null;
});

export default function Home() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [playerName, setPlayerName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [socketId, setSocketId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [isAttemptingClaim, setIsAttemptingClaim] = useState(false);
  const [currentClaimId, setCurrentClaimId] = useState<string | null>(null);
  
  // Reduced motion preference (at component level)
  const shouldReduceMotion = useReducedMotion();
  
  // Refs for animation calculations
  const deckRef = useRef<HTMLDivElement>(null);
  const pileRef = useRef<HTMLDivElement>(null);
  const playerRowRefs = useRef<Record<string, HTMLDivElement>>({});
  
  // Flying cards state
  const [flyingCards, setFlyingCards] = useState<Array<{
    id: string;
    from: { x: number; y: number };
    to: { x: number; y: number };
    kind: "BACK" | "FRONT";
    frontSrc?: string;
    backSrc: string;
  }>>([]);
  
  // Previous game state for detecting flips
  const prevGameStateRef = useRef<{
    topCardId?: string;
    pileCount: number;
  }>({ pileCount: 0 });

  useEffect(() => {
    const newSocket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
    });

    newSocket.on("connect", () => {
      console.log("Connected to server");
      setConnected(true);
      setSocketId(newSocket.id || null);
      setError(null);
    });

    newSocket.on("disconnect", () => {
      console.log("Disconnected from server");
      setConnected(false);
      setSocketId(null);
    });

    newSocket.on(EVENTS.ROOM_STATE, (data: RoomState) => {
      setRoomState(data);
      setRoomCode(data.code);
      setError(null);
    });

    newSocket.on(EVENTS.ERROR, (data: ErrorPayload) => {
      setError(data.message);
      console.error("Error:", data.message);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  // Update current time every 100ms for countdown display
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const handleCreateRoom = () => {
    if (!socket || !playerName.trim()) {
      setError("Please enter your name");
      return;
    }
    socket.emit(EVENTS.ROOM_CREATE, { name: playerName.trim() });
  };

  const handleJoinRoom = () => {
    if (!socket || !playerName.trim() || !joinCode.trim()) {
      setError("Please enter your name and room code");
      return;
    }
    socket.emit(EVENTS.ROOM_JOIN, {
      code: joinCode.trim().toUpperCase(),
      name: playerName.trim(),
    });
  };

  const handleLeaveRoom = () => {
    if (!socket) return;
    socket.emit(EVENTS.ROOM_LEAVE);
    setRoomState(null);
    setRoomCode("");
  };

  const handleReadyToggle = () => {
    if (!socket || !roomState) return;
    socket.emit(EVENTS.READY_TOGGLE, {});
  };

  const handleStartGame = () => {
    if (!socket || !roomState) return;
    socket.emit(EVENTS.START_GAME, {});
  };

  const handleFlipCard = () => {
    if (!socket || !roomState) return;
    socket.emit(EVENTS.FLIP_REQUEST, {});
  };

  // Handler for disabled deck click feedback
  const handleDisabledDeckClick = useCallback((reason: string) => {
    const toastKey = Date.now();
    setDisabledToast({ message: reason, key: toastKey });
    
    // Clear toast after 800ms
    setTimeout(() => {
      setDisabledToast((prev) => prev?.key === toastKey ? null : prev);
    }, 800);
  }, []);

  const handleClaim = (claimId?: string) => {
    if (!socket || !roomState) return;
    // Send CLAIM_ATTEMPT with optional claimId
    socket.emit(EVENTS.CLAIM_ATTEMPT, claimId ? { claimId } : {});
  };

  // Reset claim attempt state when claim changes
  useEffect(() => {
    const claimId = roomState?.game?.claim?.id || null;
    if (claimId !== currentClaimId) {
      setCurrentClaimId(claimId);
      setIsAttemptingClaim(false);
      // If claim disappeared while we were attempting a gesture, it means we failed/expired
      // But don't reset gesture tracking refs here - let the penalty detection handle it
    }
  }, [roomState?.game?.claim?.id, currentClaimId]);

  // Track when gesture attempt is cleared (gesture completed successfully or manually reset)
  useEffect(() => {
    if (!isAttemptingClaim) {
      // If gesture attempt ended and it wasn't due to claim change, reset tracking
      // (This happens when handleGestureComplete is called)
      if (gestureAttemptStartedAtRef.current !== null && gestureClaimIdRef.current === roomState?.game?.claim?.id) {
        // Gesture was completed successfully, clear tracking
        gestureAttemptStartedAtRef.current = null;
        gestureClaimIdRef.current = null;
      }
    }
  }, [isAttemptingClaim, roomState?.game?.claim?.id]);

  // Handle pile click - this is the main interaction point
  const handlePileClick = (e: React.MouseEvent) => {
    if (!socket || !roomState || !roomState.game) return;

    // Check if player can participate (not OUT)
    const myStatus =
      socketId && roomState.game.playerStatuses
        ? roomState.game.playerStatuses[socketId] || "ACTIVE"
        : "ACTIVE";
    if (myStatus === "OUT") return;

    // Mark slap intent timestamp and snapshot pileCount
    setSlapIntentAt(Date.now());
    slapPileSnapshotRef.current = roomState.game.pileCount;

    // If gesture is active, don't handle click here (let gesture handle it)
    if (isAttemptingClaim && roomState.game.claim?.gestureType) {
      // For CLICK_FRENZY, the gesture overlay will handle the click
      // For other gestures, we don't want to interfere
      return;
    }

    const claim = roomState.game.claim;

    // If no claim active, this is a false slap
    if (!claim) {
      handleClaim();
      return;
    }

    // Check if player already claimed (is in claimers list)
    const alreadyClaimed = socketId && claim.claimers.includes(socketId);

    // If player already claimed, don't allow reactivating gesture
    if (alreadyClaimed) {
      return;
    }

    const hasGesture = claim.gestureType && claim.gestureType !== null;

    // If claim has gesture and we haven't started attempting, activate gesture mode
    if (hasGesture && !isAttemptingClaim) {
      setIsAttemptingClaim(true);
      // Mark gesture attempt start time and claim ID for penalty detection
      // Also ensure we have a snapshot of pileCount at gesture start (already captured in handlePileClick above)
      gestureAttemptStartedAtRef.current = Date.now();
      gestureClaimIdRef.current = claim.id;
      // Ensure snapshot is set (should already be set above, but double-check)
      if (slapPileSnapshotRef.current === null) {
        slapPileSnapshotRef.current = roomState.game.pileCount;
      }
      e.stopPropagation(); // Prevent any other handlers
      return;
    }

    // If no gesture required, send claim immediately
    if (!hasGesture) {
      handleClaim(claim.id);
    }
    // If gesture is active, the gesture component will call handleClaim on completion
  };

  // Handle gesture completion
  const handleGestureComplete = () => {
    if (!roomState?.game?.claim) return;
    handleClaim(roomState.game.claim.id);
    setIsAttemptingClaim(false);
    // Reset gesture tracking when gesture completes successfully
    gestureAttemptStartedAtRef.current = null;
    gestureClaimIdRef.current = null;
  };

  // Calculate center point of an element
  const getElementCenter = (element: HTMLElement | null): { x: number; y: number } | null => {
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  };

  // Impact key state for triggering pile animations
  const [impactKey, setImpactKey] = useState(0);
  
  // False slap detection states
  const [slapIntentAt, setSlapIntentAt] = useState<number | null>(null);
  const slapPileSnapshotRef = useRef<number | null>(null); // Snapshot of pileCount at slap intent
  const [oopsKey, setOopsKey] = useState(0);
  const [oopsCardCount, setOopsCardCount] = useState<number>(0); // Number of cards for "Oops!" message
  const [shakeKey, setShakeKey] = useState(0);
  const [screenShakeKey, setScreenShakeKey] = useState(0); // Key for screen shake animation
  const gestureAttemptStartedAtRef = useRef<number | null>(null); // When gesture attempt started (for detecting expired/failed gestures)
  const gestureClaimIdRef = useRef<string | null>(null); // Claim ID we're attempting (to detect if it expired/failed)
  
  // Toast state for disabled deck feedback
  const [disabledToast, setDisabledToast] = useState<{ message: string; key: number } | null>(null);
  
  // Track number of flips the local player has made (for hiding hint bubble after 5 turns)
  const myFlipCountRef = useRef<number>(0);
  
  // Refs for tracking previous counts to detect penalties
  const prevPileCountRef = useRef<number>(0);
  const prevMyHandCountRef = useRef<number>(0);
  
  // Trigger impact animation (bounce + ripple)
  const triggerImpact = useCallback(() => {
    setImpactKey((prev) => prev + 1);
  }, []);

  // Handle impact callback (triggered by FlyingCardLayer when card lands)
  const handlePileImpact = useCallback(() => {
    triggerImpact();
  }, [triggerImpact]);

  // Handle flying card completion
  const handleFlyingCardComplete = useCallback((id: string) => {
    setFlyingCards((prev) => prev.filter((card) => card.id !== id));
    // Impact is triggered by onImpact callback in FlyingCardLayer
  }, []);
  
  // Fallback: detect pileCount increase and trigger impact if no flying card triggered it
  useEffect(() => {
    if (!roomState?.game) return;
    
    const currentPileCount = roomState.game.pileCount;
    const prevPileCount = prevGameStateRef.current.pileCount;
    
    // If pileCount increased but we didn't detect a flying card (edge case)
    // Trigger impact as fallback
    if (currentPileCount > prevPileCount && currentPileCount > 0) {
      // Small delay to allow flying card to trigger first if it exists
      const timer = setTimeout(() => {
        // Only trigger if no flying cards are active (fallback case)
        if (flyingCards.length === 0) {
          triggerImpact();
        }
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [roomState?.game, triggerImpact, flyingCards.length]);

  // Detect false slap (penalty) - when player receives cards after clicking pile or failing gesture
  useEffect(() => {
    if (!roomState?.game || !socketId) {
      // Update refs even if game is not available
      if (roomState?.game && socketId) {
        const game = roomState.game;
        prevMyHandCountRef.current = game.handCounts[socketId] ?? 0;
        prevPileCountRef.current = game.pileCount;
      }
      return;
    }

    const game = roomState.game;
    const myHandCount = game.handCounts[socketId] ?? 0;
    const pileCount = game.pileCount;

    // Check for penalty condition: hand count increased AND pile count decreased
    const handCountIncreased = myHandCount > prevMyHandCountRef.current;
    const pileCountDecreased = pileCount < prevPileCountRef.current;

    if (handCountIncreased && pileCountDecreased) {
      // Penalty detected! Check if it's from a slap intent or a failed gesture attempt
      let shouldShowOops = false;
      let cardCount = prevPileCountRef.current;

      // Case 1: Direct slap intent (click on pile without gesture, or false slap)
      if (slapIntentAt !== null) {
        const timeSinceSlap = Date.now() - slapIntentAt;
        // Check within the 1500ms window for direct slaps
        if (timeSinceSlap < CLAIM_WINDOW_MS) {
          shouldShowOops = true;
          cardCount = slapPileSnapshotRef.current ?? prevPileCountRef.current;
          setSlapIntentAt(null); // Consume the intent
          slapPileSnapshotRef.current = null; // Reset snapshot
        }
      }

      // Case 2: Failed/expired gesture attempt
      // We were attempting a gesture, but the claim expired, failed, or we're not in claimers, and we received cards
      if (!shouldShowOops && gestureAttemptStartedAtRef.current !== null) {
        const currentClaimId = game.claim?.id || null;
        const attemptedClaimId = gestureClaimIdRef.current;

        // Check if the claim we were attempting no longer exists, or we're not in the claimers list
        const isClaimGone = attemptedClaimId !== null && currentClaimId !== attemptedClaimId;
        const wasInClaimers = attemptedClaimId && currentClaimId && game.claim?.claimers.includes(socketId);
        const isNotInClaimers = attemptedClaimId && currentClaimId && !wasInClaimers;

        // If claim expired, changed, or we failed and aren't in claimers, show "Oops!"
        if (isClaimGone || isNotInClaimers) {
          shouldShowOops = true;
          // Use snapshot from when gesture started (captured at click), or fallback to previous pile count
          cardCount = slapPileSnapshotRef.current ?? prevPileCountRef.current;

          // Reset gesture tracking
          gestureAttemptStartedAtRef.current = null;
          gestureClaimIdRef.current = null;
          setIsAttemptingClaim(false);
        }
      }

      if (shouldShowOops) {
        // Trigger animations and set card count for display
        setOopsCardCount(cardCount);
        setOopsKey((prev) => prev + 1);
        setShakeKey((prev) => prev + 1);
        setScreenShakeKey((prev) => prev + 1);
        
        // Play sound effect (placeholder)
        playSfx('oops');
        
        // Hide "Oops!" toast after ~900ms (display time + exit animation)
        setTimeout(() => {
          setOopsKey(0);
          setOopsCardCount(0);
          // Reset screen shake after animation completes
          setScreenShakeKey(0);
        }, 900);
      }
    }

    // Update refs for next comparison
    prevMyHandCountRef.current = myHandCount;
    prevPileCountRef.current = pileCount;
  }, [roomState?.game, socketId, slapIntentAt, isAttemptingClaim]);

  // Clear slap intent after 1500ms if not consumed
  useEffect(() => {
    if (slapIntentAt === null) return;

    const timer = setTimeout(() => {
      setSlapIntentAt(null);
      slapPileSnapshotRef.current = null; // Reset snapshot if intent expires
    }, 1500);

    return () => clearTimeout(timer);
  }, [slapIntentAt]);

  // Detect flips and trigger flying card animation
  useEffect(() => {
    if (!roomState?.game || !socketId) return;

    const game = roomState.game;
    const currentTopCardId = game.topCard?.id;
    const currentPileCount = game.pileCount;
    const prevState = prevGameStateRef.current;

    // Check if a flip occurred (pileCount increased and topCard changed)
    if (
      currentPileCount > prevState.pileCount &&
      currentTopCardId &&
      currentTopCardId !== prevState.topCardId
    ) {
      // Determine who flipped
      const flipPlayerId = game.lastFlipPlayerId;
      
      // Track my flips for hiding hint bubble after 5 turns
      if (flipPlayerId === socketId) {
        myFlipCountRef.current += 1;
      }
      
      if (flipPlayerId) {
        // Get source rect (deck if it's me, player row if it's someone else)
        let fromRect: { x: number; y: number } | null = null;
        
        if (flipPlayerId === socketId) {
          // My flip - use deck
          fromRect = getElementCenter(deckRef.current);
        } else {
          // Other player's flip - use their row
          const playerRow = playerRowRefs.current[flipPlayerId];
          fromRect = getElementCenter(playerRow);
        }

        // Get destination rect (pile center)
        const toRect = getElementCenter(pileRef.current);

        if (fromRect && toRect) {
          // Determine card kind and source
          const isMyFlip = flipPlayerId === socketId;
          const backSrc = "/assets/card-back.png"; // Default back image path - adjust if needed
          
          // For now, always use BACK (you can enhance this to show front if needed)
          const flyingCard = {
            id: `flying-${Date.now()}-${Math.random()}`,
            from: fromRect,
            to: toRect,
            kind: "BACK" as const,
            backSrc,
          };

          setFlyingCards((prev) => [...prev, flyingCard]);
        }
      }
    }

    // Update previous state
    prevGameStateRef.current = {
      topCardId: currentTopCardId,
      pileCount: currentPileCount,
    };
  }, [roomState?.game, socketId, triggerImpact, flyingCards.length]);

  // Reset flip count when game starts or pile is empty (new game)
  useEffect(() => {
    if (roomState?.phase === "IN_GAME" && roomState?.game) {
      // Reset count when pile becomes empty (new game or game restarted)
      const prevPileCount = prevGameStateRef.current.pileCount;
      if (roomState.game.pileCount === 0 && prevPileCount > 0) {
        myFlipCountRef.current = 0;
      }
    }
  }, [roomState?.phase, roomState?.game]);

  // Check if current player is host
  const isHost = roomState && socketId && roomState.hostId === socketId;

  // Get current player
  const currentPlayer =
    roomState && socketId
      ? roomState.players.find((p) => p.id === socketId)
      : null;

  // Check if can start game
  const canStartGame =
    isHost &&
    roomState &&
    roomState.phase === "LOBBY" &&
    roomState.players.length >= 2 &&
    roomState.players.every((p) => p.ready);

  // Get validation message for start game
  const getStartGameMessage = () => {
    if (!roomState || !isHost) return null;
    if (roomState.phase !== "LOBBY") return "Game has already started";
    if (roomState.players.length < 2)
      return "Need at least 2 players to start";
    const notReady = roomState.players.filter((p) => !p.ready);
    if (notReady.length > 0)
      return `${notReady.length} player(s) not ready`;
    return null;
  };

  return (
    <main className="min-h-screen p-8 bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-2xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8"
        >
          <h1 className="text-4xl font-bold mb-2 text-gray-900 dark:text-white">
            🎮 Multiplayer Game
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Real-time multiplayer experience
          </p>

          {/* Connection Status */}
          <div className="mb-6">
            <div
              className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                connected
                  ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                  : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full mr-2 ${
                  connected ? "bg-green-500" : "bg-red-500"
                }`}
              />
              {connected ? "Connected" : "Disconnected"}
            </div>
          </div>

          {/* Player Name Input */}
          <div className="mb-4">
            <label
              htmlFor="playerName"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
            >
              Your Name
            </label>
            <input
              id="playerName"
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Enter your name"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              disabled={!!roomState}
            />
          </div>

          {/* Error Message */}
          {error && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg dark:bg-red-900 dark:text-red-200"
            >
              {error}
            </motion.div>
          )}

          {/* Room Code Display */}
          {roomState && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mb-4 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-800"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Room Code:
                  </span>
                  <span className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 font-mono">
                    {roomState.code}
                  </span>
                  <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full font-medium">
                    {roomState.phase}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between mt-3">
                <button
                  onClick={handleLeaveRoom}
                  className="text-sm text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                >
                  Leave Room
                </button>
              </div>
            </motion.div>
          )}

          {/* Create Room */}
          {!roomState && (
            <div className="mb-4">
              <button
                onClick={handleCreateRoom}
                disabled={!connected || !playerName.trim()}
                className="w-full px-4 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                Create Room
              </button>
            </div>
          )}

          {/* Join Room */}
          {!roomState && (
            <div className="mb-6">
              <label
                htmlFor="joinCode"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                Join Room
              </label>
              <div className="flex gap-2">
                <input
                  id="joinCode"
                  type="text"
                  value={joinCode}
                  onChange={(e) =>
                    setJoinCode(e.target.value.toUpperCase().slice(0, 5))
                  }
                  placeholder="Room code"
                  maxLength={5}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white font-mono uppercase"
                />
                <button
                  onClick={handleJoinRoom}
                  disabled={!connected || !playerName.trim() || !joinCode.trim()}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  Join
                </button>
              </div>
            </div>
          )}

          {/* Lobby UI */}
          {roomState && roomState.phase === "LOBBY" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6"
            >
              <h2 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">
                Players ({roomState.players.length})
              </h2>
              <div className="space-y-2 mb-6">
                {roomState.players.map((player) => {
                  const isPlayerHost = player.id === roomState.hostId;
                  const isCurrentPlayer = player.id === socketId;
                  return (
                    <motion.div
                      key={player.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={`flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg ${
                        isCurrentPlayer ? "ring-2 ring-indigo-500" : ""
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-gray-900 dark:text-white font-medium">
                          {player.name}
                        </span>
                        {isPlayerHost && (
                          <span
                            className="text-xs px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 rounded-full font-medium"
                            title="Host"
                          >
                            👑 Host
                          </span>
                        )}
                        {player.ready && (
                          <span
                            className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded-full font-medium"
                            title="Ready"
                          >
                            ✓ Ready
                          </span>
                        )}
                        {!player.ready && (
                          <span
                            className="text-xs px-2 py-0.5 bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 rounded-full font-medium"
                            title="Not Ready"
                          >
                            ○ Not Ready
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(player.joinedAt).toLocaleTimeString()}
                      </span>
                    </motion.div>
                  );
                })}
              </div>

              {/* Ready Toggle Button */}
              {currentPlayer && (
                <div className="mb-4">
                  <button
                    onClick={handleReadyToggle}
                    className={`w-full px-4 py-3 rounded-lg font-medium transition-colors ${
                      currentPlayer.ready
                        ? "bg-green-600 hover:bg-green-700 text-white"
                        : "bg-gray-300 hover:bg-gray-400 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-800 dark:text-white"
                    }`}
                  >
                    {currentPlayer.ready ? "✓ Ready" : "○ Not Ready"}
                  </button>
                </div>
              )}

              {/* Start Game Button (Host only) */}
              {isHost && (
                <div className="mb-4">
                  <button
                    onClick={handleStartGame}
                    disabled={!canStartGame}
                    className="w-full px-4 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                  >
                    Start Game
                  </button>
                  {!canStartGame && getStartGameMessage() && (
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 text-center">
                      {getStartGameMessage()}
                    </p>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {/* In Game Phase */}
          {roomState && roomState.phase === "IN_GAME" && roomState.game && (
            <motion.div
              key={screenShakeKey > 0 ? `shake-${screenShakeKey}` : 'game-area'}
              initial={{ opacity: 0, y: 10 }}
              animate={
                screenShakeKey > 0 && !shouldReduceMotion
                  ? {
                      opacity: 1,
                      x: [0, -2, 2, -1, 1, 0],
                      y: [0, 1, -1, 1, 0],
                    }
                  : {
                      opacity: 1,
                      y: 0,
                    }
              }
              transition={
                screenShakeKey > 0 && !shouldReduceMotion
                  ? {
                      x: {
                        duration: 0.2,
                        ease: "easeOut",
                      },
                      y: {
                        duration: 0.2,
                        ease: "easeOut",
                      },
                      opacity: { duration: 0 },
                    }
                  : {
                      opacity: { duration: 0.3 },
                      y: { duration: 0.3 },
                    }
              }
              className="mt-6"
            >
              <div className="mb-6">
                <h2 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">
                  🎮 Game In Progress
                </h2>

                {/* Current Turn */}
                <div className="mb-4 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-800">
                  <p className="text-lg font-semibold text-indigo-900 dark:text-indigo-100 mb-1">
                    Turno de:{" "}
                    {
                      roomState.players.find(
                        (p) => p.id === roomState.game?.turnPlayerId
                      )?.name
                    }
                  </p>
                  <p className="text-md text-indigo-700 dark:text-indigo-300">
                    Palabra actual:{" "}
                    <span className="font-bold uppercase">
                      {roomState.game.spokenWord || "—"}
                    </span>
                  </p>
                  {roomState.game.pileCount > 0 && (
                    <p className="text-sm text-indigo-600 dark:text-indigo-400">
                      Siguiente:{" "}
                      <span className="font-semibold uppercase">
                        {roomState.game.currentWord}
                      </span>
                    </p>
                  )}
                </div>

                {/* Deck Stack - My Deck */}
                {socketId && roomState.game.handCounts && (() => {
                  const myHandCount = roomState.game.handCounts[socketId] || 0;
                  const isMyTurn = roomState.game.turnPlayerId === socketId;
                  const claimActive = !!roomState.game.claim;
                  const myStatus = roomState.game.playerStatuses?.[socketId] || "ACTIVE";
                  const myStatusAllowsPlay = myStatus === "ACTIVE";
                  
                  // Calculate if flip is allowed
                  const canFlip = isMyTurn && !claimActive && myHandCount > 0 && myStatusAllowsPlay;
                  
                  // Determine disabled reason
                  let disabledReason: string | undefined;
                  if (!canFlip) {
                    if (myHandCount === 0) {
                      disabledReason = "No tienes cartas";
                    } else if (claimActive) {
                      disabledReason = "Hay un claim en curso";
                    } else if (!isMyTurn) {
                      disabledReason = "No es tu turno";
                    } else if (!myStatusAllowsPlay) {
                      disabledReason = "No puedes jugar";
                    }
                  }

                  // Determine help text
                  // Show hint bubble only if less than 5 flips made
                  let helpText: string | null = null;
                  if (myFlipCountRef.current < 5) {
                    if (isMyTurn && canFlip) {
                      helpText = "¡Tócame para jugar tu próxima carta!";
                    } else if (!isMyTurn) {
                      helpText = "Esperando...";
                    }
                    // Don't show if claim active or no cards (handled by disabled state)
                  }
                  
                  return (
                    <div className="mb-6 flex justify-center relative">
                      <DeckStack
                        ref={deckRef}
                        count={myHandCount}
                        backSrc="/assets/card-back.png"
                        isMyTurn={isMyTurn}
                        enabled={canFlip}
                        disabledReason={disabledReason}
                        onFlip={handleFlipCard}
                        onDisabledClick={handleDisabledDeckClick}
                        helpText={helpText}
                      />
                      
                      {/* Disabled toast */}
                      <AnimatePresence>
                        {disabledToast && (
                          <motion.div
                            key={disabledToast.key}
                            className="absolute -top-12 left-1/2 transform -translate-x-1/2 pointer-events-none z-50"
                            initial={{ opacity: 0, y: 4, scale: 0.9 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -8, scale: 0.9 }}
                            transition={{ duration: 0.2 }}
                          >
                            <div className="bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900 px-4 py-2 rounded-lg text-sm font-medium shadow-lg whitespace-nowrap">
                              {disabledToast.message}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })()}

                {/* Pile Display - Clickable */}
                <div className="mb-6 flex flex-col items-center">
                  <PileCenter
                    ref={pileRef}
                    pileCount={roomState.game.pileCount}
                    topCard={roomState.game.topCard}
                    backSrc="/assets/card-back.png"
                    impactKey={impactKey}
                    shakeKey={shakeKey}
                    oopsKey={oopsKey}
                    oopsCardCount={oopsCardCount}
                  >
                    <ClickablePileArea
                      onClick={handlePileClick}
                      isAttemptingClaim={isAttemptingClaim}
                      hasGesture={!!roomState.game.claim?.gestureType}
                    >
                      {roomState.game.topCard ? (
                        <AnimatePresence mode="wait">
                          <CardDisplay key={roomState.game.topCard.id} card={roomState.game.topCard} />
                        </AnimatePresence>
                      ) : (
                        <motion.div
                          layoutId="empty-pile"
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.8, opacity: 0 }}
                          transition={{ duration: 0.3 }}
                          className="bg-white dark:bg-gray-800 rounded-xl shadow-xl border-4 border-gray-300 dark:border-gray-600 w-56 h-72 mx-auto flex items-center justify-center p-4 relative overflow-hidden"
                        >
                          <div className="text-center text-gray-400 dark:text-gray-600">
                            <p className="text-xl">Pila vacía</p>
                            <p className="text-sm mt-2">Haz flip para empezar</p>
                          </div>
                        </motion.div>
                      )}

                      {/* Inline gesture overlay - only shown when attempting claim with gesture */}
                      {roomState.game.claim &&
                        isAttemptingClaim &&
                        roomState.game.claim.gestureType &&
                        (() => {
                          const claim = roomState.game.claim!;
                          const closesAt = claim.closesAt;
                          const myStatus =
                            socketId && roomState.game.playerStatuses
                              ? roomState.game.playerStatuses[socketId] || "ACTIVE"
                              : "ACTIVE";
                          const canParticipate = myStatus !== "OUT";

                          if (!canParticipate) return null;

                          // For CLICK_FRENZY, the pile itself is the clickable area
                          if (claim.gestureType === "CLICK_FRENZY") {
                            return (
                              <div className="absolute inset-0 z-10 pointer-events-auto">
                                <ClickFrenzyGesture
                                  claimId={claim.id}
                                  closesAt={closesAt}
                                  requiredClicks={CLICK_FRENZY_REQUIRED_CLICKS}
                                  minIntervalMs={CLICK_FRENZY_MIN_INTERVAL_MS}
                                  onComplete={handleGestureComplete}
                                />
                              </div>
                            );
                          }

                          // For BUBBLES and CIRCLE, show overlay around the pile
                          return (
                            <div className="absolute -inset-8 z-10 pointer-events-none">
                              <div className="absolute inset-0 pointer-events-auto">
                                {claim.gestureType === "BUBBLES" ? (
                                  <BubblesGesture
                                    claimId={claim.id}
                                    closesAt={closesAt}
                                    bubbleCount={BUBBLES_COUNT}
                                    minDistancePx={BUBBLES_MIN_DISTANCE_PX}
                                    bubbleSizePx={BUBBLES_SIZE_PX}
                                    onComplete={handleGestureComplete}
                                  />
                                ) : claim.gestureType === "CIRCLE" ? (
                                  <CircleGesture
                                    claimId={claim.id}
                                    closesAt={closesAt}
                                    onComplete={handleGestureComplete}
                                    minPathLen={CIRCLE_MIN_PATH_LEN}
                                    closeDist={CIRCLE_CLOSE_DIST}
                                    minRadius={CIRCLE_MIN_RADIUS}
                                    maxRadiusVar={CIRCLE_MAX_RADIUS_VAR}
                                    targetCenterTol={CIRCLE_TARGET_CENTER_TOL}
                                    minPoints={CIRCLE_MIN_POINTS}
                                  />
                                ) : null}
                              </div>
                            </div>
                          );
                        })()}

                      {/* Gesture instruction when attempting */}
                      {isAttemptingClaim && roomState.game.claim?.gestureType && (
                        <div className="absolute -top-12 left-0 right-0 text-center pointer-events-none">
                          <p className="text-sm font-semibold text-red-600 dark:text-red-400">
                            Completa el gesto para reclamar
                          </p>
                        </div>
                      )}
                    </ClickablePileArea>

                    {/* Claim indicator text - outside clickable container */}
                    {roomState.game.claim &&
                      !isAttemptingClaim &&
                      (() => {
                        const claim = roomState.game.claim!;
                        const myStatus =
                          socketId && roomState.game.playerStatuses
                            ? roomState.game.playerStatuses[socketId] || "ACTIVE"
                            : "ACTIVE";
                        const canParticipate = myStatus !== "OUT";
                        const hasGesture = claim.gestureType && claim.gestureType !== null;
                        const alreadyClaimed = socketId && claim.claimers.includes(socketId);

                        if (!canParticipate) return null;
                        // Don't show hint if player already claimed
                        if (alreadyClaimed) return null;

                        return (
                          <div className="mt-2 text-center pointer-events-none">
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {hasGesture
                                ? "Toca el montón para iniciar el gesto"
                                : "Toca el montón para reclamar"}
                            </p>
                          </div>
                        );
                      })()}

                    {/* Claim countdown - subtle display */}
                    {roomState.game.claim && (
                      <div className="mt-2 text-center">
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Tiempo:{" "}
                          {(
                            Math.max(0, roomState.game.claim.closesAt - currentTime) / 1000
                          ).toFixed(1)}
                          s
                        </p>
                        {roomState.game.claim.claimers.length > 0 && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {roomState.game.claim.claimers.length} reclamando
                          </p>
                        )}
                      </div>
                    )}
                  </PileCenter>
                </div>


                {/* Player Status Indicator */}
                {socketId && roomState.game.playerStatuses && (
                  <div className="mb-4">
                    {(() => {
                      const myStatus = roomState.game.playerStatuses[socketId] || "ACTIVE";
                      const myHandCount = roomState.game.handCounts[socketId] || 0;
                      
                      if (myStatus === "PENDING_EXIT") {
                        return (
                          <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                            <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-200 text-center">
                              ⏳ Esperando claim final para salir
                            </p>
                          </div>
                        );
                      }
                      
                      if (myStatus === "OUT") {
                        return (
                          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 text-center">
                              👁️ Espectador
                            </p>
                          </div>
                        );
                      }
                      
                      return null;
                    })()}
                  </div>
                )}


                {/* Players List */}
                <div className="mb-4">
                  <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">
                    Players ({roomState.players.length})
                  </h3>
                  <div className="space-y-2">
                    {roomState.players.map((player, index) => {
                      const isPlayerHost = player.id === roomState.hostId;
                      const isCurrentTurn =
                        player.id === roomState.game?.turnPlayerId;
                      const handCount = roomState.game?.handCounts[player.id] || 0;
                      const playerStatus = roomState.game?.playerStatuses[player.id] || "ACTIVE";
                      
                      return (
                        <motion.div
                          key={player.id}
                          ref={(el) => {
                            if (el) {
                              playerRowRefs.current[player.id] = el;
                            }
                          }}
                          initial={{ opacity: 0, x: -10 }}
                          animate={
                            isCurrentTurn && !shouldReduceMotion
                              ? {
                                  opacity: 1,
                                  x: 0,
                                  scale: [1, 1.02, 1],
                                  boxShadow: [
                                    "0 0 0 0px rgba(34, 197, 94, 0)",
                                    "0 0 20px 4px rgba(34, 197, 94, 0.4)",
                                    "0 0 0 0px rgba(34, 197, 94, 0)",
                                  ],
                                }
                              : { opacity: 1, x: 0 }
                          }
                          transition={
                            isCurrentTurn && !shouldReduceMotion
                              ? {
                                  scale: {
                                    duration: 1.2,
                                    repeat: Infinity,
                                    ease: "easeInOut",
                                  },
                                  boxShadow: {
                                    duration: 1.2,
                                    repeat: Infinity,
                                    ease: "easeInOut",
                                  },
                                }
                              : {}
                          }
                          className={`flex items-center justify-between p-3 rounded-lg ${
                            isCurrentTurn
                              ? "bg-green-100 dark:bg-green-900/30 border-2 border-green-500"
                              : "bg-gray-50 dark:bg-gray-700"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900 dark:text-white">
                              {player.name}
                            </span>
                            {isPlayerHost && (
                              <span
                                className="text-xs px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 rounded-full font-medium"
                                title="Host"
                              >
                                👑 Host
                              </span>
                            )}
                            {isCurrentTurn && (
                              <span
                                className="text-xs px-2 py-0.5 bg-green-500 text-white rounded-full font-medium"
                                title="Current Turn"
                              >
                                ⏱️ Turno
                              </span>
                            )}
                            {playerStatus === "PENDING_EXIT" && (
                              <span
                                className="text-xs px-2 py-0.5 bg-yellow-200 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 rounded-full font-medium"
                                title="Esperando claim final para salir"
                              >
                                ⏳ Esperando claim final para salir
                              </span>
                            )}
                            {playerStatus === "OUT" && (
                              <span
                                className="text-xs px-2 py-0.5 bg-gray-200 text-gray-800 dark:bg-gray-600 dark:text-gray-300 rounded-full font-medium"
                                title="Espectador"
                              >
                                👁️ Espectador
                              </span>
                            )}
                          </div>
                          <span className="text-sm font-semibold text-gray-600 dark:text-gray-400">
                            {handCount} cartas
                          </span>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Ended Phase */}
          {roomState && roomState.phase === "ENDED" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6"
            >
              <div className="p-6 bg-gray-50 dark:bg-gray-800 rounded-lg text-center">
                <p className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                  Game Ended
                </p>
                <p className="text-gray-600 dark:text-gray-400">
                  The game has ended.
                </p>
              </div>
            </motion.div>
          )}
        </motion.div>
      </div>
      
      {/* Flying Card Layer - renders on top of everything */}
      {roomState?.phase === "IN_GAME" && (
        <FlyingCardLayer
          flyingCards={flyingCards}
          onCardComplete={handleFlyingCardComplete}
          onImpact={handlePileImpact}
        />
      )}
    </main>
  );
}


