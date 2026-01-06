"use client";

import { useEffect, useState } from "react";
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
import { motion } from "framer-motion";
import { ClickFrenzyGesture } from "../components/ClickFrenzyGesture";
import { BubblesGesture } from "../components/BubblesGesture";
import { CircleGesture } from "../components/CircleGesture";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";

// Card Display Component - moved outside to prevent recreation on each render
function CardDisplay({ card }: { card: Card }) {
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
        key={card.id}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
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
        key={card.id}
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
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
}

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
    }
  }, [roomState?.game?.claim?.id, currentClaimId]);

  // Handle pile click - this is the main interaction point
  const handlePileClick = (e: React.MouseEvent) => {
    if (!socket || !roomState || !roomState.game) return;

    // Check if player can participate (not OUT)
    const myStatus =
      socketId && roomState.game.playerStatuses
        ? roomState.game.playerStatuses[socketId] || "ACTIVE"
        : "ACTIVE";
    if (myStatus === "OUT") return;

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
  };

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
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
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

                {/* Pile Display - Clickable */}
                <div className="mb-6 flex flex-col items-center">
                  <div className="relative w-full max-w-sm">
                    {/* Pile container - clickable */}
                    <div
                      onClick={handlePileClick}
                      className={`relative select-none ${
                        isAttemptingClaim && roomState.game.claim?.gestureType
                          ? "cursor-default"
                          : "cursor-pointer"
                      }`}
                      style={{ touchAction: "manipulation" }}
                    >
                      {roomState.game.topCard ? (
                        <CardDisplay card={roomState.game.topCard} />
                      ) : (
                        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-8 border-4 border-gray-300 dark:border-gray-600 min-h-[280px] flex items-center justify-center">
                          <div className="text-center text-gray-400 dark:text-gray-600">
                            <p className="text-xl">Pila vacía</p>
                            <p className="text-sm mt-2">Haz flip para empezar</p>
                          </div>
                        </div>
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
                    </div>

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

                    {/* Pile count - with extra margin to avoid overlap */}
                    <div className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
                      <p>Pila: {roomState.game.pileCount} cartas</p>
                    </div>

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
                  </div>
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

                {/* Flip Button */}
                <div className="mb-6">
                  <button
                    onClick={handleFlipCard}
                    disabled={
                      !socketId ||
                      !socket ||
                      !!roomState.game.claim ||
                      (() => {
                        if (!socketId || !roomState.game.playerStatuses || !roomState.game.handCounts) return true;
                        const myStatus = roomState.game.playerStatuses[socketId] || "ACTIVE";
                        const myHandCount = roomState.game.handCounts[socketId] || 0;
                        return myStatus === "OUT" || myStatus === "PENDING_EXIT" || myHandCount === 0 || roomState.game.turnPlayerId !== socketId;
                      })()
                    }
                    className={`w-full px-6 py-4 rounded-lg font-bold text-lg transition-all ${
                      !socketId ||
                      !socket ||
                      !!roomState.game.claim ||
                      (() => {
                        if (!socketId || !roomState.game.playerStatuses || !roomState.game.handCounts) return true;
                        const myStatus = roomState.game.playerStatuses[socketId] || "ACTIVE";
                        const myHandCount = roomState.game.handCounts[socketId] || 0;
                        return myStatus === "OUT" || myStatus === "PENDING_EXIT" || myHandCount === 0 || roomState.game.turnPlayerId !== socketId;
                      })()
                        ? "bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                        : "bg-green-600 hover:bg-green-700 text-white shadow-lg hover:shadow-xl"
                    }`}
                  >
                    {(() => {
                      if (!socketId || !socket) return "Conectando...";
                      if (!!roomState.game.claim) return "Esperando resolución de claim...";
                      
                      if (socketId && roomState.game.playerStatuses && roomState.game.handCounts) {
                        const myStatus = roomState.game.playerStatuses[socketId] || "ACTIVE";
                        const myHandCount = roomState.game.handCounts[socketId] || 0;
                        
                        if (myStatus === "OUT" || myStatus === "PENDING_EXIT" || myHandCount === 0) {
                          return "🎉 ¡Ganaste!";
                        }
                      }
                      
                      if (socketId && roomState.game.turnPlayerId === socketId) {
                        return "🃏 Flip Card";
                      }
                      
                      return "Esperando tu turno...";
                    })()}
                  </button>
                </div>

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
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
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
    </main>
  );
}


