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
import { GestureOverlay } from "../components/GestureOverlay";
import { DeckStack } from "../components/DeckStack";
import { PileCenter } from "../components/PileCenter";
import { FlyingCardLayer } from "../components/FlyingCardLayer";
import { ClickablePileArea } from "../components/ClickablePileArea";
import { WordTimeline } from "../components/WordTimeline";
import { useAudio } from "../hooks/useAudio";
import { useThrowRate } from "../hooks/useThrowRate";
import { useTranslations } from "../hooks/useTranslations";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";

// Card Display Component - memoized to prevent unnecessary re-renders
const CardDisplay = memo(function CardDisplay({ card }: { card: Card }) {
  const bgColorMap: Record<string, string> = {
    yellow: "#FFCC99",
    orange: "#8FFFDA",
    green: "#CC99FF",
    blue: "#CCFF99",
    red: "#FF99CC",
  };

  const bgColor = bgColorMap[card.visual.bgColor] || "#9CA3AF";
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
        className="rounded-xl shadow-xl border-4 border-gray-300 dark:border-gray-600 w-56 h-72 mx-auto flex flex-col items-center justify-center p-4 relative overflow-hidden"
        style={{ backgroundColor: bgColor }}
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
      className="rounded-xl shadow-xl border-4 border-gray-300 dark:border-gray-600 w-56 h-72 mx-auto flex flex-col items-center justify-center p-4 relative overflow-hidden"
      style={{ backgroundColor: bgColor }}
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
  const [warmingUp, setWarmingUp] = useState(false);
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

  /**
   * Warm up the server by calling the health endpoint
   * This silently wakes up the Render free-tier server if it's spun down
   */
  const warmUpServer = async (): Promise<void> => {
    try {
      const healthUrl = `${SOCKET_URL}/health`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      await fetch(healthUrl, {
        method: 'GET',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      // Silently ignore errors - we just want to wake the server
    } catch (error) {
      // Silently ignore errors - server might be starting up
      console.debug('Health check failed (expected on cold start):', error);
    }
  };

  useEffect(() => {
    let mounted = true;

    const initializeConnection = async () => {
      // Step 1: Warm up server first
      setWarmingUp(true);
      await warmUpServer();
      
      if (!mounted) return;

      // Step 2: Create socket with improved reconnection config
      const newSocket = io(SOCKET_URL, {
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: Infinity,
        timeout: 20000,
      });

      newSocket.on("connect", () => {
        console.log("Connected to server");
        setConnected(true);
        setWarmingUp(false);
        setSocketId(newSocket.id || null);
        setError(null);
      });

      newSocket.on("disconnect", () => {
        console.log("Disconnected from server");
        setConnected(false);
        setWarmingUp(false);
        setSocketId(null);
      });

      newSocket.on("connect_error", (error) => {
        console.log("Connection error:", error);
        // Keep warmingUp true if we're still trying to connect
        if (!newSocket.connected) {
          setWarmingUp(true);
        }
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
        mounted = false;
        newSocket.close();
      };
    };

    initializeConnection();

    return () => {
      mounted = false;
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
      setError(t.player.pleaseEnterName);
      return;
    }
    socket.emit(EVENTS.ROOM_CREATE, { name: playerName.trim() });
  };

  const handleCreateSoloRoom = () => {
    if (!socket || !playerName.trim()) {
      setError(t.player.pleaseEnterName);
      return;
    }
    socket.emit(EVENTS.ROOM_CREATE_SOLO, { name: playerName.trim() });
  };

  const handleJoinRoom = () => {
    if (!socket || !playerName.trim() || !joinCode.trim()) {
      setError(t.player.pleaseEnterNameAndRoomCode);
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

  const handleCopyRoomCode = async () => {
    if (!roomState?.code) return;
    try {
      await navigator.clipboard.writeText(roomState.code);
      // Show toast notification
      const toastKey = Date.now();
      setCopyToast({ key: toastKey });
      
      // Clear toast after 2 seconds
      setTimeout(() => {
        setCopyToast((prev) => prev?.key === toastKey ? null : prev);
      }, 2000);
    } catch (error) {
      console.error('Failed to copy room code:', error);
    }
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
  
  // Success notification states (for successful claim without receiving cards)
  const [goodKey, setGoodKey] = useState(0);
  const prevClaimActiveRef = useRef<boolean>(false); // Track if claim was active to detect resolution
  const prevClaimClaimersRef = useRef<string[]>([]); // Track previous claim claimers to detect successful claims
  
  // Toast state for disabled deck feedback
  const [disabledToast, setDisabledToast] = useState<{ message: string; key: number } | null>(null);
  const [copyToast, setCopyToast] = useState<{ key: number } | null>(null);
  
  // Track number of flips the local player has made (for hiding hint bubble after 5 turns)
  const myFlipCountRef = useRef<number>(0);

  // Refs for tracking previous counts to detect penalties
  const prevPileCountRef = useRef<number>(0);
  const prevMyHandCountRef = useRef<number>(0);

  // Track previous claim ID to detect when claim opens (for micro-anticipation)
  const prevClaimIdRef = useRef<string | null>(null);
  
  // Track previous phase to detect game end
  const prevPhaseRef = useRef<string | null>(null);
  // Track previous player status to detect final win (PENDING_EXIT -> OUT with 0 cards)
  const prevPlayerStatusRef = useRef<string | null>(null);
  // Track previous phase for music control
  const prevPhaseForMusicRef = useRef<string | null>(null);
  
  // Track selected win/lose messages to ensure they don't change on re-renders
  const selectedWinMessageRef = useRef<string | null>(null);
  const selectedLoseMessageRef = useRef<string | null>(null);
  
  // Track rematch state
  const [isRematching, setIsRematching] = useState(false);

  // Track last local flip's flying card ID to know when to play card_throw sound
  const lastLocalFlipCardIdRef = useRef<string | null>(null);

  // Anticipation key for triggering micro-anticipation animation when claim opens
  const [anticipationKey, setAnticipationKey] = useState(0);

  // Audio manager hook
  const { playSfx, playMusic, stopMusic, toggleMute, toggleSfxMute, preferences, isMounted: isAudioMounted } = useAudio();
  
  // Translations hook
  const t = useTranslations();
  
  // Track if component is mounted to avoid hydration mismatch
  const [isMounted, setIsMounted] = useState(false);
  
  useEffect(() => {
    setIsMounted(true);
  }, []);
  
  // Update page title based on language
  useEffect(() => {
    if (typeof document !== 'undefined' && isMounted) {
      document.title = t.currentLanguage === 'es' ? '¡Piensa Rápido!' : 'Think Fast!';
    }
  }, [t.currentLanguage, isMounted]);
  
  // Progressive throw rate hook (for card_throw pitch)
  const throwRate = useThrowRate(
    roomState?.game?.pileCount ?? 0,
    roomState?.game?.claim?.id ?? null
  );
  
  // Trigger impact animation (bounce + ripple)
  const triggerImpact = useCallback(() => {
    setImpactKey((prev) => prev + 1);
    // NOTE: Slap sound removed - card_throw sound is played in handlePileImpact instead
    // If you want to add slap.wav, uncomment: playSfx('slap');
  }, []);

  // Trigger anticipation animation when claim opens
  const triggerAnticipation = useCallback(() => {
    setAnticipationKey((prev) => prev + 1);
    // NOTE: claim_open.wav does not exist - removed sound effect
    // If you want to add claim_open.wav, uncomment: playSfx('claim_open');
  }, []);

  // Handle impact callback (triggered by FlyingCardLayer when card lands)
  const handlePileImpact = useCallback((cardId?: string) => {
    triggerImpact();
    
    // If this impact is from our last local flip, play card_throw sound
    if (cardId && cardId === lastLocalFlipCardIdRef.current) {
      const currentRate = throwRate.getCurrentRate();
      const pileCount = roomState?.game?.pileCount ?? 0;
      
      // Debug log
      
      // Use 'rate' parameter for explicit playbackRate control
      playSfx('card_throw', { rate: currentRate });
      // Clear the reference after playing
      lastLocalFlipCardIdRef.current = null;
    }
  }, [triggerImpact, playSfx, throwRate]);

  // Handle flying card completion
  const handleFlyingCardComplete = useCallback((id: string) => {
    setFlyingCards((prev) => prev.filter((card) => card.id !== id));
    // Impact is triggered by onImpact callback in FlyingCardLayer before this is called
    // Clear reference if this was our tracked card and it completed without impact (shouldn't happen)
    if (id === lastLocalFlipCardIdRef.current) {
      lastLocalFlipCardIdRef.current = null;
    }
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

  // Detect false slap (penalty) and successful claim - combined logic to ensure mutual exclusivity
  useEffect(() => {
    if (!roomState?.game || !socketId) {
      // Update refs even if game is not available
      if (roomState?.game && socketId) {
        const game = roomState.game;
        prevMyHandCountRef.current = game.handCounts[socketId] ?? 0;
        prevPileCountRef.current = game.pileCount;
        prevClaimActiveRef.current = !!game.claim;
      }
      return;
    }

    const game = roomState.game;
    const myHandCount = game.handCounts[socketId] ?? 0;
    const pileCount = game.pileCount;
    const claimActive = !!game.claim;
    const wasClaimActive = prevClaimActiveRef.current;

    // Check for penalty condition FIRST: hand count increased AND pile count decreased
    const handCountIncreased = myHandCount > prevMyHandCountRef.current;
    const pileCountDecreased = pileCount < prevPileCountRef.current;
    
    let shouldShowOops = false;
    let shouldShowGood = false;

    // PRIORITY 1: Check for penalty (Oops!)
    // Only show Oops if handCount INCREASED (player received cards)
    if (handCountIncreased && pileCountDecreased) {
      // Calculate actual cards received by player (handCount increase)
      // This is accurate even when cards are distributed round-robin among multiple non-claimers
      const actualCardsReceived = myHandCount - prevMyHandCountRef.current;
      
      // Penalty detected! Check if it's from a slap intent or a failed gesture attempt
      let cardCount = actualCardsReceived;

      // Case 1: Direct slap intent (click on pile without gesture, or false slap)
      if (slapIntentAt !== null) {
        const timeSinceSlap = Date.now() - slapIntentAt;
        // Check within the 1500ms window for direct slaps
        if (timeSinceSlap < CLAIM_WINDOW_MS) {
          shouldShowOops = true;
          // For false slaps, use actual cards received (more accurate than snapshot)
          cardCount = actualCardsReceived;
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
          // Use actual cards received (more accurate than snapshot)
          cardCount = actualCardsReceived;
        }
      }

      // Case 3: Claim expired without player attempting to claim
      // Player received cards because they didn't claim in time (claim expired)
      if (!shouldShowOops) {
        const claimExpired = wasClaimActive && !claimActive; // Claim was active, now it's gone
        const noClaimIntent = slapIntentAt === null && gestureAttemptStartedAtRef.current === null; // Player didn't attempt to claim
        
        // If claim expired and player received cards without attempting, show "Oops!"
        if (claimExpired && noClaimIntent) {
          shouldShowOops = true;
          // Use actual cards received (accurate for round-robin distribution)
          cardCount = actualCardsReceived;
        }
      }
    }
    
    // PRIORITY 2: Only check for success (¡Bien!) if NO penalty was detected AND handCount did NOT increase
    // Detect successful claim: claim was resolved (disappeared) and player didn't receive cards
    if (!shouldShowOops && !handCountIncreased) {
      const claimResolved = wasClaimActive && !claimActive; // Claim was active, now it's gone
      const handCountDidNotIncrease = myHandCount <= prevMyHandCountRef.current; // Player didn't receive cards
      const hadClaimIntent = slapIntentAt !== null || gestureAttemptStartedAtRef.current !== null; // Player was attempting claim

      // Check if it's a successful claim
      if (claimResolved && handCountDidNotIncrease) {
        // Check if player was in the claimers list (successful claim)
        // We need to check the previous claim state since current claim is now null
        // Store previous claimers in a ref or check if we had intent
        const wasInClaimers = prevClaimClaimersRef.current?.includes(socketId) ?? false;
        
        // Show "¡Bien!" if:
        // 1. Player had claim intent (normal case), OR
        // 2. Player was in claimers list (covers cases where intent wasn't tracked but claim succeeded)
        if (hadClaimIntent || wasInClaimers) {
          // Check if claim intent was recent (within 5000ms to account for claim resolution time and gestures)
          const timeSinceSlap = slapIntentAt !== null ? Date.now() - slapIntentAt : null;
          const timeSinceGesture = gestureAttemptStartedAtRef.current !== null ? Date.now() - gestureAttemptStartedAtRef.current : null;
          
          const recentIntent = 
            (timeSinceSlap !== null && timeSinceSlap < 5000) ||
            (timeSinceGesture !== null && timeSinceGesture < 5000) ||
            wasInClaimers; // If in claimers, always show (covers gesture completion cases)

          if (recentIntent || wasInClaimers) {
            shouldShowGood = true;
          }
        }
      }
    }

    // Now trigger notifications and consume intents
    if (shouldShowOops) {
      // Calculate actual cards received (handCount increase)
      // This is the most accurate way to show how many cards the player actually received
      const actualCardsReceived = myHandCount - prevMyHandCountRef.current;
      setOopsCardCount(actualCardsReceived);
      setOopsKey((prev) => prev + 1);
      setShakeKey((prev) => prev + 1);
      setScreenShakeKey((prev) => prev + 1);
      
      // Play sound effect
      playSfx('oops');
      
      // Hide "Oops!" toast after ~900ms (display time + exit animation)
      setTimeout(() => {
        setOopsKey(0);
        setOopsCardCount(0);
        // Reset screen shake after animation completes
        setScreenShakeKey(0);
      }, 900);
      
      // Consume intent - IMPORTANT: consume after showing Oops to prevent showing Good
      if (slapIntentAt !== null) {
        setSlapIntentAt(null);
        slapPileSnapshotRef.current = null;
      }
      if (gestureAttemptStartedAtRef.current !== null) {
        gestureAttemptStartedAtRef.current = null;
        gestureClaimIdRef.current = null;
        setIsAttemptingClaim(false);
      }
    } else if (shouldShowGood) {
      // Success! Player claimed successfully without receiving cards
      setGoodKey((prev) => prev + 1);
      
      // Play sound effect with slight pitch variation for variety
      const pitch = 0.97 + Math.random() * 0.06; // Random between 0.97-1.03
      playSfx('turn_win', { pitch });
      
      // Hide "¡Bien!" toast after ~900ms (display time + exit animation)
      setTimeout(() => {
        setGoodKey(0);
      }, 900);
      
      // Consume intent
      if (slapIntentAt !== null) {
        setSlapIntentAt(null);
        slapPileSnapshotRef.current = null;
      }
      if (gestureAttemptStartedAtRef.current !== null) {
        gestureAttemptStartedAtRef.current = null;
        gestureClaimIdRef.current = null;
        setIsAttemptingClaim(false);
      }
      
      // Clear claimers ref after using it
      prevClaimClaimersRef.current = [];
    }

    // Update refs for next comparison
    // Always update claim active state
    prevClaimActiveRef.current = claimActive;
    
    // Update claimers list when claim is active (before it resolves)
    if (claimActive && game.claim?.claimers) {
      prevClaimClaimersRef.current = [...game.claim.claimers];
    } else if (!claimActive && wasClaimActive) {
      // Claim just resolved - keep claimers for this cycle (will be used in detection above)
      // Will be cleared after detection or on next cycle if no detection
    } else if (!claimActive && !wasClaimActive) {
      // No claim was active, clear claimers ref
      prevClaimClaimersRef.current = [];
    }
    
    // Update hand/pile counts for next comparison cycle
    prevMyHandCountRef.current = myHandCount;
    prevPileCountRef.current = pileCount;
  }, [roomState?.game, socketId, slapIntentAt, isAttemptingClaim, playSfx]);

  // Clear slap intent after 2000ms if not consumed (increased to account for claim resolution time)
  useEffect(() => {
    if (slapIntentAt === null) return;

    const timer = setTimeout(() => {
      setSlapIntentAt(null);
      slapPileSnapshotRef.current = null; // Reset snapshot if intent expires
    }, 2000);

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
          const flyingCardId = `flying-${Date.now()}-${Math.random()}`;
          const flyingCard = {
            id: flyingCardId,
            from: fromRect,
            to: toRect,
            kind: "BACK" as const,
            backSrc,
          };

          setFlyingCards((prev) => [...prev, flyingCard]);
          
          // Track this card if it's our flip (we'll play card_throw when it lands)
          if (isMyFlip) {
            lastLocalFlipCardIdRef.current = flyingCardId;
          }
        }
      }
    }

    // Update previous state
    prevGameStateRef.current = {
      topCardId: currentTopCardId,
      pileCount: currentPileCount,
    };
  }, [roomState?.game, socketId, triggerImpact, flyingCards.length, playSfx]);

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

  // Detect claim opened for micro-anticipation animation
  useEffect(() => {
    if (!roomState?.game) {
      prevClaimIdRef.current = null;
      return;
    }

    const claimId = roomState.game.claim?.id ?? null;
    
    // If claim appears (new claim opened)
    if (claimId && claimId !== prevClaimIdRef.current) {
      triggerAnticipation();
    }
    
    // Update ref for next comparison
    prevClaimIdRef.current = claimId;
  }, [roomState?.game, triggerAnticipation]);

  // Play background music when game starts (only if music is already enabled)
  // Note: Music can now be played manually via button regardless of game state
  // We don't stop music when game ends - let user control it manually
  useEffect(() => {
    const currentPhase = roomState?.phase || null;
    const prevPhase = prevPhaseForMusicRef.current;
    
    if (currentPhase === "IN_GAME" && prevPhase !== "IN_GAME") {
      // Game just started - play music if not muted and not already playing
      if (!preferences.musicMuted) {
        playMusic('thinkfast', true);
      }
    }
    // Note: We don't stop music when game ends - user controls it via button
    // This allows music to continue playing even between games if user wants
    
    // Update ref for next comparison
    prevPhaseForMusicRef.current = currentPhase;
  }, [roomState?.phase, preferences.musicMuted, playMusic]);

  // Detect game end and play appropriate sound
  // Detect final win: transition from PENDING_EXIT to OUT with 0 cards
  useEffect(() => {
    if (!roomState?.game || !socketId) {
      if (roomState?.game && socketId) {
        const myStatus = roomState.game.playerStatuses?.[socketId] || "ACTIVE";
        prevPlayerStatusRef.current = myStatus;
      }
      return;
    }

    const myHandCount = roomState.game.handCounts[socketId] ?? 0;
    const myStatus = roomState.game.playerStatuses?.[socketId] || "ACTIVE";
    const prevStatus = prevPlayerStatusRef.current;

    // Detect transition from PENDING_EXIT to OUT with 0 cards (final win!)
    if (prevStatus === "PENDING_EXIT" && myStatus === "OUT" && myHandCount === 0) {
      // Player completed the final claim and won!
      playSfx('game_win');
    }

    prevPlayerStatusRef.current = myStatus;
  }, [roomState?.game, socketId, playSfx]);

  useEffect(() => {
    if (roomState?.phase === "ENDED" && prevPhaseRef.current === "IN_GAME") {
      // Game just ended
      if (socketId && roomState.game) {
        const myHandCount = roomState.game.handCounts[socketId] ?? 0;
        const myStatus = roomState.game.playerStatuses?.[socketId] || "ACTIVE";
        
        // Player won if they have 0 cards (regardless of status)
        if (myHandCount === 0) {
          // Player won! Play victory sound
          // (This covers both cases: direct win and final claim completion)
          playSfx('game_win');
        } else {
          // Player lost if they have cards (didn't win)
          // This covers all cases: OUT with cards, ACTIVE with cards, etc.
          playSfx('game_lose');
        }
      }
    }
    prevPhaseRef.current = roomState?.phase || null;
  }, [roomState?.phase, socketId, roomState?.game, playSfx]);

  // Check if current player is host
  const isHost = roomState && socketId && roomState.hostId === socketId;
  
  // Reset rematch state when phase changes
  useEffect(() => {
    if (roomState?.phase !== "ENDED") {
      setIsRematching(false);
    }
  }, [roomState?.phase]);

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
    if (roomState.phase !== "LOBBY") return t.game.gameHasAlreadyStarted;
    if (roomState.players.length < 2)
      return t.game.needAtLeast2Players;
    const notReady = roomState.players.filter((p) => !p.ready);
    if (notReady.length > 0)
      return `${notReady.length} ${t.game.playersNotReady}`;
    return null;
  };

  return (
    <main className="min-h-screen p-8 dark:from-gray-900 dark:to-gray-800" style={{ background: '#93C5F9' }}>
      <div className="max-w-2xl mx-auto overflow-visible">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 overflow-visible md:overflow-visible"
        >
          <h1 className="text-4xl font-bold mb-2 text-gray-900 dark:text-white text-center md:text-left">
            {isMounted ? t.common.gameTitle : '¡Piensa Rápido!'}
          </h1>
          <p className="text-base font-semibold mb-6 tracking-wide text-center md:text-left" style={{ color: '#64748b' }}>
            {isMounted ? t.common.wordSequence : 'TACO - GATO - CAPIBARA - CHURRO - DONUT'}
          </p>

          {/* Connection Status, Language Toggle, and Music Toggle */}
          <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-1">
              <div
                className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                  connected
                    ? "dark:bg-green-900 dark:text-green-200"
                    : warmingUp
                    ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                    : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                }`}
                style={connected ? { backgroundColor: '#CCFF99', color: '#1a1a1a' } : {}}
              >
                <span
                  className={`w-2 h-2 rounded-full mr-2 ${
                    connected 
                      ? "" 
                      : warmingUp 
                      ? "bg-yellow-500 animate-pulse" 
                      : "bg-red-500"
                  }`}
                  style={connected ? { backgroundColor: '#16a34a' } : {}}
                />
                {warmingUp 
                  ? t.common.preparingServer 
                  : connected 
                  ? t.common.connected 
                  : t.common.disconnected}
              </div>
              {warmingUp && (
                <p className="text-xs text-gray-600 dark:text-gray-400 px-3">
                  {t.common.serverColdStartNote}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Language Toggle Button */}
              <button
                onClick={() => {
                  t.toggleLanguage();
                }}
                className="inline-flex items-center justify-center h-9 px-3 rounded-lg text-sm font-medium transition-colors bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                title={t.currentLanguage === 'es' ? t.common.changeToEnglish : t.common.changeToSpanish}
              >
                <span className="text-xs font-semibold">
                  {t.currentLanguage === 'es' ? 'ES' : 'EN'}
                </span>
              </button>

              {/* Sound Toggle Button - Only render after hydration to avoid SSR mismatch */}
              {isAudioMounted ? (
                <button
                  onClick={() => {
                    toggleSfxMute();
                  }}
                  className={`inline-flex items-center justify-center h-9 px-3 rounded-lg text-sm font-medium transition-colors ${
                    preferences.sfxMuted
                      ? "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
                      : "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200 hover:bg-indigo-200 dark:hover:bg-indigo-800"
                  }`}
                  title={preferences.sfxMuted ? t.common.activateSound : t.common.deactivateSound}
                >
                  {preferences.sfxMuted ? (
                    <>
                      <span className="mr-1.5">🔇</span>
                      <span>{t.common.sound}</span>
                    </>
                  ) : (
                    <>
                      <span className="mr-1.5">🔊</span>
                      <span>{t.common.sound}</span>
                    </>
                  )}
                </button>
              ) : (
                // Placeholder during SSR to maintain layout
                <div className="inline-flex items-center justify-center h-9 px-3 rounded-lg text-sm font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200">
                  <span className="mr-1.5">🔊</span>
                  <span>Sonido</span>
                </div>
              )}

              {/* Music Toggle Button - Only render after hydration to avoid SSR mismatch */}
              {isAudioMounted ? (
                <button
                  onClick={() => {
                    const wasMuted = preferences.musicMuted;
                    const newMutedState = toggleMute();
                    
                    // If user just unmuted, play music regardless of game state
                    if (wasMuted && !newMutedState) {
                      // User unmuted - play music immediately
                      // Use setTimeout to ensure AudioManager state is updated after toggleMute
                      setTimeout(() => {
                        playMusic('thinkfast', true); // Force play even if muted check fails
                      }, 50);
                    } else if (!wasMuted && newMutedState) {
                      // User muted - stop music
                      stopMusic();
                    }
                  }}
                  className={`inline-flex items-center justify-center h-9 px-3 rounded-lg text-sm font-medium transition-colors ${
                    preferences.musicMuted
                      ? "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
                      : "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200 hover:bg-indigo-200 dark:hover:bg-indigo-800"
                  }`}
                  title={preferences.musicMuted ? t.common.activateMusic : t.common.deactivateMusic}
                >
                  {preferences.musicMuted ? (
                    <>
                      <span className="mr-1.5">🔇</span>
                      <span>{t.common.music}</span>
                    </>
                  ) : (
                    <>
                      <span className="mr-1.5">🔊</span>
                      <span>{t.common.music}</span>
                    </>
                  )}
                </button>
              ) : (
                // Placeholder during SSR to maintain layout
                <div className="inline-flex items-center justify-center h-9 px-3 rounded-lg text-sm font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                  <span className="mr-1.5">🔇</span>
                  <span>Música</span>
                </div>
              )}
            </div>
          </div>

          {/* Player Name Input */}
          <div className="mb-4">
            <label
              htmlFor="playerName"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
            >
              {t.player.yourName}
            </label>
            <input
              id="playerName"
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder={t.player.enterYourName}
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
              className="mb-4 p-4 bg-gray-100 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600"
            >
              <div className="flex items-center justify-between mb-2 relative">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t.room.roomCode}:
                  </span>
                  <button
                    onClick={handleCopyRoomCode}
                    className="text-2xl font-bold font-mono flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors cursor-pointer group px-2 py-1 -mx-2 -my-1 rounded"
                    title="Click para copiar"
                  >
                    <span className="transition-transform group-hover:scale-110">📋</span>
                    <span>{roomState.code}</span>
                  </button>
                  <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full font-medium">
                    {roomState.phase === 'LOBBY' ? t.game.phase.lobby : roomState.phase === 'IN_GAME' ? t.game.phase.inGame : t.game.phase.ended}
                  </span>
                </div>
                
                {/* Copy toast notification */}
                <AnimatePresence>
                  {copyToast && (
                    <motion.div
                      key={copyToast.key}
                      className="absolute -top-12 left-0 pointer-events-none z-50"
                      initial={{ opacity: 0, y: 4, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.9 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className="px-4 py-2 rounded-lg text-sm font-medium shadow-lg whitespace-nowrap" style={{ backgroundColor: '#CCFF99', color: '#1a1a1a' }}>
                        {t.room.codeCopied}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="flex items-center justify-between mt-3">
                <button
                  onClick={handleLeaveRoom}
                  className="text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 flex items-center gap-1.5 transition-colors"
                >
                  <span>🚪</span>
                  {t.room.leaveRoom}
                </button>
              </div>
            </motion.div>
          )}

          {/* Create Room */}
          {!roomState && (
            <div className="mb-4 space-y-3">
              <button
                onClick={handleCreateRoom}
                disabled={!connected || !playerName.trim()}
                className="w-full px-4 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {t.room.createRoom}
              </button>
              <button
                onClick={handleCreateSoloRoom}
                disabled={!connected || !playerName.trim()}
                className="w-full px-4 py-3 text-white rounded-lg font-medium disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                style={{
                  backgroundColor: !connected || !playerName.trim() ? undefined : '#CC99FF',
                }}
                onMouseEnter={(e) => {
                  if (!e.currentTarget.disabled) {
                    e.currentTarget.style.backgroundColor = '#B886E6';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!e.currentTarget.disabled) {
                    e.currentTarget.style.backgroundColor = '#CC99FF';
                  }
                }}
              >
                {t.room.playSolo}
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
                {t.room.joinRoom}
              </label>
              <div className="flex flex-col md:flex-row gap-2">
                <input
                  id="joinCode"
                  type="text"
                  value={joinCode}
                  onChange={(e) =>
                    setJoinCode(e.target.value.toUpperCase().slice(0, 5))
                  }
                  placeholder={t.room.roomCodePlaceholder}
                  maxLength={5}
                  className="w-full md:flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white font-mono uppercase"
                />
                <button
                  onClick={handleJoinRoom}
                  disabled={!connected || !playerName.trim() || !joinCode.trim()}
                  className="w-full md:w-auto px-4 py-3 md:py-2 md:px-6 text-white rounded-lg font-medium disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                  style={{ backgroundColor: '#CCFF99', color: '#1a1a1a' }}
                  onMouseEnter={(e) => {
                    if (!e.currentTarget.disabled) {
                      e.currentTarget.style.backgroundColor = '#B8E68A';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!e.currentTarget.disabled) {
                      e.currentTarget.style.backgroundColor = '#CCFF99';
                    }
                  }}
                >
                  {t.room.join}
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
                {t.players.players} ({roomState.players.length})
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
                        {player.isBot && (
                          <span
                            className="text-xs px-2 py-0.5 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 rounded-full font-medium"
                            title={t.players.bot}
                          >
                            🤖 {t.players.bot}
                          </span>
                        )}
                        {isPlayerHost && (
                          <span
                            className="text-xs px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 rounded-full font-medium"
                            title={t.players.host}
                          >
                            👑 {t.players.host}
                          </span>
                        )}
                        {player.ready && (
                          <span
                            className="text-xs px-2 py-0.5 dark:bg-green-900 dark:text-green-200 rounded-full font-medium"
                            style={{ backgroundColor: '#CCFF99', color: '#1a1a1a' }}
                            title={t.players.ready}
                          >
                            {t.players.ready}
                          </span>
                        )}
                        {!player.ready && !player.isBot && (
                          <span
                            className="text-xs px-2 py-0.5 bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 rounded-full font-medium"
                            title={t.players.notReady}
                          >
                            {t.players.notReady}
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
              {currentPlayer && !currentPlayer.isBot && (
                <div className="mb-4">
                  <button
                    onClick={handleReadyToggle}
                    className={`w-full px-4 py-3 rounded-lg font-medium transition-colors ${
                      currentPlayer.ready
                        ? ""
                        : "bg-gray-300 hover:bg-gray-400 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-800 dark:text-white"
                    }`}
                    style={currentPlayer.ready ? { backgroundColor: '#CCFF99', color: '#1a1a1a' } : {}}
                    onMouseEnter={(e) => {
                      if (currentPlayer.ready) {
                        e.currentTarget.style.backgroundColor = '#B8E68A';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (currentPlayer.ready) {
                        e.currentTarget.style.backgroundColor = '#CCFF99';
                      }
                    }}
                  >
                    {currentPlayer.ready ? t.players.ready : t.players.notReady}
                  </button>
                </div>
              )}

              {/* Start Game Button (Host only) */}
              {isHost && (
                <div className="mb-4">
                  <button
                    onClick={handleStartGame}
                    disabled={!canStartGame}
                    className="w-full px-4 py-3 text-white rounded-lg font-medium disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                    style={{
                      backgroundColor: canStartGame ? '#1E3A8A' : undefined,
                    }}
                    onMouseEnter={(e) => {
                      if (canStartGame) {
                        e.currentTarget.style.backgroundColor = '#1E40AF';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (canStartGame) {
                        e.currentTarget.style.backgroundColor = '#1E3A8A';
                      }
                    }}
                  >
                    {t.game.startGame}
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

          {/* How to Play Section - Only show when not in game */}
          {(!roomState || roomState.phase !== "IN_GAME") && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="mt-8 p-6 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-700/50 dark:to-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700"
            >
              <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-white">
                {t.game.howToPlay}
              </h2>
              
              <div className="space-y-5">
                {/* Step 1: Turn-based - Yellow card color */}
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center text-2xl" style={{ backgroundColor: '#FFCC99' }}>
                    🃏
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold mb-1 text-gray-900 dark:text-white">
                      {t.game.howToPlaySteps.turnBased.title}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                      {t.game.howToPlaySteps.turnBased.description}
                    </p>
                  </div>
                </div>

                {/* Step 2: Sequence - Orange card color */}
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center text-2xl" style={{ backgroundColor: '#8FFFDA' }}>
                    🔁
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold mb-1 text-gray-900 dark:text-white">
                      {t.game.howToPlaySteps.sequence.title}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                      {t.game.howToPlaySteps.sequence.description}
                    </p>
                  </div>
                </div>

                {/* Step 3: Claim - Green card color */}
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center text-2xl" style={{ backgroundColor: '#CC99FF' }}>
                    ✋
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold mb-1 text-gray-900 dark:text-white">
                      {t.game.howToPlaySteps.claim.title}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                      {t.game.howToPlaySteps.claim.description}
                    </p>
                  </div>
                </div>

                {/* Step 4: Oops - Red from Oops message (bg-red-500 = #ef4444) */}
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center text-2xl" style={{ backgroundColor: '#ef4444' }}>
                    😵‍💫
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold mb-1 text-gray-900 dark:text-white">
                      {t.game.howToPlaySteps.oops.title}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                      {t.game.howToPlaySteps.oops.description}
                    </p>
                  </div>
                </div>

                {/* Step 5: Special - Blue card color */}
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center text-2xl" style={{ backgroundColor: '#CCFF99' }}>
                    ⭐
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold mb-1 text-gray-900 dark:text-white">
                      {t.game.howToPlaySteps.special.title}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                      {t.game.howToPlaySteps.special.description}
                    </p>
                  </div>
                </div>
              </div>
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
              className="mt-6 relative overflow-visible"
            >
              {/* Dim overlay for claim anticipation (optional) */}
              <AnimatePresence>
                {anticipationKey > 0 && !shouldReduceMotion && (
                  <motion.div
                    key={`anticipation-dim-${anticipationKey}`}
                    className="absolute inset-0 bg-black pointer-events-none z-40"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 0.12, 0.12, 0] }}
                    exit={{ opacity: 0 }}
                    transition={{ 
                      times: [0, 0.3, 0.7, 1], // 0ms, 75ms (fade in), 175ms (hold), 250ms (fade out)
                      duration: 0.25, 
                      ease: "easeOut" 
                    }}
                  />
                )}
              </AnimatePresence>
              <div className="mb-6">
                <h2 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">
                  {t.game.gameInProgress}
                </h2>

                {/* Word Timeline - Sequence visualization */}
                <WordTimeline
                  spokenWord={roomState.game.spokenWord}
                  currentWord={roomState.game.currentWord}
                  anticipationKey={anticipationKey}
                />

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
                      helpText = t.deck.touchToPlay;
                    } else if (!isMyTurn) {
                      helpText = t.deck.waiting;
                    }
                    // Don't show if claim active or no cards (handled by disabled state)
                  }
                  
                  // Check if there are other active players (players with cards who are not OUT)
                  const hasOtherActivePlayers = roomState.players.some((player) => {
                    if (player.id === socketId) return false; // Exclude self
                    const playerHandCount = roomState.game.handCounts[player.id] ?? 0;
                    const playerStatus = roomState.game.playerStatuses?.[player.id] || "ACTIVE";
                    return playerHandCount > 0 && playerStatus !== "OUT";
                  });
                  
                  return (
                    <div className="mb-6 flex justify-center relative overflow-visible">
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
                        playerStatus={socketId && roomState.game.playerStatuses ? roomState.game.playerStatuses[socketId] : undefined}
                        hasOtherActivePlayers={hasOtherActivePlayers}
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
                    goodKey={goodKey}
                    anticipationKey={anticipationKey}
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

                          // For BUBBLES and CIRCLE, show overlay (handled by GestureOverlay outside ClickablePileArea)
                          return null;
                        })()}

                    </ClickablePileArea>

                  </PileCenter>
                          </div>

                {/* Gesture Overlay for BUBBLES and CIRCLE */}
                {roomState.game.claim &&
                  isAttemptingClaim &&
                  roomState.game.claim.gestureType &&
                  (roomState.game.claim.gestureType === "BUBBLES" ||
                    roomState.game.claim.gestureType === "CIRCLE") &&
                  (() => {
                    const claim = roomState.game.claim!;
                    const closesAt = claim.closesAt;
                    const myStatus =
                      socketId && roomState.game.playerStatuses
                        ? roomState.game.playerStatuses[socketId] || "ACTIVE"
                        : "ACTIVE";
                    const canParticipate = myStatus !== "OUT";

                    if (!canParticipate) return null;

                    return (
                      <GestureOverlay>
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
                      </GestureOverlay>
                    );
                  })()}

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
                              {t.players.waitingForFinalClaim}
                            </p>
                          </div>
                        );
                      }
                      
                      if (myStatus === "OUT") {
                        return (
                          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 text-center">
                              {t.players.spectator}
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
                  <div className="space-y-2 overflow-visible px-1">
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
                                    "0 0 0 0px rgba(204, 255, 153, 0)",
                                    "0 0 20px 4px rgba(204, 255, 153, 0.4)",
                                    "0 0 0 0px rgba(204, 255, 153, 0)",
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
                              ? "bg-green-100 dark:bg-green-900/30 border-2"
                              : "bg-gray-50 dark:bg-gray-700"
                          }`}
                          style={isCurrentTurn ? { borderColor: '#CCFF99' } : {}}
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900 dark:text-white">
                              {player.name}
                            </span>
                            {isPlayerHost && (
                              <span
                                className="text-xs px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 rounded-full font-medium flex items-center justify-center min-w-[2rem] md:min-w-0"
                                title="Host"
                              >
                                👑<span className="hidden md:inline ml-1">Host</span>
                              </span>
                            )}
                            {isCurrentTurn && (
                              <span
                                className="text-xs px-2 py-0.5 bg-green-500 text-white rounded-full font-medium flex items-center justify-center min-w-[2rem] md:min-w-0"
                                title={t.players.currentTurn}
                              >
                                ⏱️<span className="hidden md:inline ml-1">{t.players.turn}</span>
                              </span>
                            )}
                            {playerStatus === "PENDING_EXIT" && (
                              <span
                                className="text-xs px-2 py-0.5 bg-yellow-200 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 rounded-full font-medium"
                                title={t.players.waitingForFinalClaim}
                              >
                                {t.players.waitingForFinalClaim}
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
                {/* Rematch button - only visible to host */}
                {isHost && roomState.players.length >= 2 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, duration: 0.4 }}
                    className="mb-6"
                  >
                    <button
                      onClick={() => {
                        if (socket && !isRematching) {
                          setIsRematching(true);
                          socket.emit(EVENTS.REMATCH_REQUEST, {});
                        }
                      }}
                      disabled={isRematching || roomState.players.length < 2}
                      className="px-6 py-3 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold rounded-lg shadow-lg transition-colors duration-200"
                    >
                      {isRematching ? t.game.rematching : t.game.playAgain}
                    </button>
                  </motion.div>
                )}
                {(() => {
                  // Always show at least the basic message
                  if (!socketId || !roomState.game) {
                    return (
                      <>
                        <p className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                          {t.game.phase.ended}
                        </p>
                        <p className="text-gray-600 dark:text-gray-400 mb-4">
                          {t.game.gameEnded}
                        </p>
                      </>
                    );
                  }

                  const myHandCount = roomState.game.handCounts[socketId] ?? 0;
                  const myStatus = roomState.game.playerStatuses?.[socketId] || "ACTIVE";
                  
                  // Player won if they have 0 cards
                  const isWinner = myHandCount === 0;
                  // Player lost if they are OUT and have cards (last one to exit)
                  // Also consider losing if they have cards and are not the winner
                  const isLoser = (myStatus === "OUT" && myHandCount > 0) || (!isWinner && myHandCount > 0);
                  
                  // Select random message once when result is determined
                  // Reset refs when phase changes back to IN_GAME or LOBBY
                  if (roomState.phase !== "ENDED") {
                    selectedWinMessageRef.current = null;
                    selectedLoseMessageRef.current = null;
                  }
                  
                  if (isWinner && !selectedWinMessageRef.current && t.game.winMessages?.length) {
                    selectedWinMessageRef.current = t.game.winMessages[Math.floor(Math.random() * t.game.winMessages.length)];
                  }
                  if (isLoser && !selectedLoseMessageRef.current && t.game.loseMessages?.length) {
                    selectedLoseMessageRef.current = t.game.loseMessages[Math.floor(Math.random() * t.game.loseMessages.length)];
                  }
                  
                  const selectedWinMessage = selectedWinMessageRef.current;
                  const selectedLoseMessage = selectedLoseMessageRef.current;

                  if (isWinner) {
                    return (
                      <>
                        <motion.p
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.4, ease: "easeOut" }}
                          className="text-xl font-semibold text-gray-900 dark:text-white mb-2"
                        >
                          {t.game.thanksForPlaying}
                        </motion.p>
                        <motion.p
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.2, duration: 0.4 }}
                          className="text-gray-600 dark:text-gray-400 mb-4"
                        >
                          {t.game.gameEnded}
                        </motion.p>
                        <motion.div
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ 
                            opacity: 1, 
                            scale: [0.9, 1.05, 1],
                          }}
                          transition={{ 
                            duration: 0.6,
                            ease: "easeOut",
                            times: [0, 0.6, 1],
                          }}
                          className="mt-4"
                        >
                          <motion.div 
                            className="text-white rounded-xl shadow-xl border-4 px-6 py-4 inline-block relative"
                            style={{
                              backgroundColor: '#22c55e', // green-500
                              borderColor: '#16a34a', // green-600
                            }}
                            animate={{
                              boxShadow: [
                                '0 0 28px 10px rgba(204, 255, 153, 0.8), 0 0 48px 16px rgba(204, 255, 153, 0.5), 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                                '0 0 36px 13px rgba(204, 255, 153, 1), 0 0 56px 20px rgba(204, 255, 153, 0.7), 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                                '0 0 28px 10px rgba(204, 255, 153, 0.8), 0 0 48px 16px rgba(204, 255, 153, 0.5), 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                                '0 0 36px 13px rgba(204, 255, 153, 1), 0 0 56px 20px rgba(204, 255, 153, 0.7), 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                                '0 0 28px 10px rgba(204, 255, 153, 0.8), 0 0 48px 16px rgba(204, 255, 153, 0.5), 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                              ],
                            }}
                            transition={{
                              duration: 2,
                              repeat: 2,
                              ease: "easeInOut",
                              delay: 0.6,
                            }}
                          >
                            <p className="text-xl font-bold mb-1">🎉</p>
                            <p className="text-lg font-semibold">{t.deck.youWon}</p>
                            {selectedWinMessage && (
                              <motion.p
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.8, duration: 0.4, ease: "easeOut" }}
                                className="mt-2 text-sm text-white/90 italic"
                              >
                                {selectedWinMessage}
                              </motion.p>
                            )}
                          </motion.div>
                        </motion.div>
                      </>
                    );
                  }
                  
                  if (isLoser) {
                    return (
                      <>
                        <motion.p
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.4, ease: "easeOut" }}
                          className="text-xl font-semibold text-gray-900 dark:text-white mb-2"
                        >
                          {t.game.thanksForPlaying}
                        </motion.p>
                        <motion.p
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.2, duration: 0.4 }}
                          className="text-gray-600 dark:text-gray-400 mb-4"
                        >
                          {t.game.gameEnded}
                        </motion.p>
                        <motion.div
                          initial={{ opacity: 0, scale: 1, x: 0 }}
                          animate={{ 
                            opacity: 1, 
                            scale: [1, 0.95, 1],
                            x: [0, -6, 6, -4, 4, 0],
                          }}
                          transition={{ 
                            opacity: { duration: 0.3 },
                            scale: { duration: 0.3, ease: "easeOut" },
                            x: { 
                              duration: 0.3,
                              ease: "easeInOut",
                            },
                          }}
                          className="mt-4"
                        >
                          <motion.div 
                            className="text-white rounded-xl shadow-xl border-4 px-6 py-4 inline-block relative"
                            style={{
                              backgroundColor: '#ef4444', // red-500
                              borderColor: '#dc2626', // red-600
                              boxShadow: '0 0 28px 10px rgba(239, 68, 68, 0.6), 0 0 48px 16px rgba(239, 68, 68, 0.4), 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                            }}
                            initial={{ 
                              boxShadow: '0 0 0px 0px rgba(239, 68, 68, 0), 0 0 0px 0px rgba(239, 68, 68, 0), 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                            }}
                            animate={{
                              boxShadow: '0 0 28px 10px rgba(239, 68, 68, 0.6), 0 0 48px 16px rgba(239, 68, 68, 0.4), 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                            }}
                            transition={{
                              delay: 0.2,
                              duration: 0.4,
                              ease: "easeOut",
                            }}
                          >
                            <p className="text-xl font-bold mb-1">😢</p>
                            <p className="text-lg font-semibold">{t.deck.youLost}</p>
                            {selectedLoseMessage && (
                              <motion.p
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.5, duration: 0.4, ease: "easeOut" }}
                                className="mt-2 text-sm text-white/90 italic"
                              >
                                {selectedLoseMessage}
                              </motion.p>
                            )}
                          </motion.div>
                        </motion.div>
                      </>
                    );
                  }
                  
                  // Fallback if neither winner nor loser (shouldn't happen, but just in case)
                  return (
                    <>
                      <p className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                        {t.game.phase.ended}
                      </p>
                      <p className="text-gray-600 dark:text-gray-400 mb-4">
                        {t.game.gameEnded}
                      </p>
                    </>
                  );
                })()}
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


