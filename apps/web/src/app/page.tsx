"use client";

import { useEffect, useState } from "react";
import { io, Socket } from "socket.io-client";
import { EVENTS, type RoomState, type ErrorPayload } from "@acme/shared";
import { motion } from "framer-motion";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";

export default function Home() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [playerName, setPlayerName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [socketId, setSocketId] = useState<string | null>(null);

  useEffect(() => {
    const newSocket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
    });

    newSocket.on("connect", () => {
      console.log("Connected to server");
      setConnected(true);
      setSocketId(newSocket.id);
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

          {/* In Game / Ended Phase */}
          {roomState && roomState.phase !== "LOBBY" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6"
            >
              <h2 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">
                Players ({roomState.players.length})
              </h2>
              <div className="space-y-2">
                {roomState.players.map((player) => {
                  const isPlayerHost = player.id === roomState.hostId;
                  return (
                    <motion.div
                      key={player.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-gray-900 dark:text-white">
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
                      </div>
                    </motion.div>
                  );
                })}
              </div>
              <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <p className="text-center text-gray-700 dark:text-gray-300">
                  Game is {roomState.phase === "IN_GAME" ? "in progress" : "ended"}
                </p>
              </div>
            </motion.div>
          )}
        </motion.div>
      </div>
    </main>
  );
}

