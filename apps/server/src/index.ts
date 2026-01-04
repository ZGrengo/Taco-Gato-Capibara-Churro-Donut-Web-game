import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import {
  EVENTS,
  RoomCreateSchema,
  RoomJoinSchema,
  ReadyToggleSchema,
  StartGameSchema,
  FlipRequestSchema,
  ClaimAttemptSchema,
} from "@acme/shared";
import { RoomManager } from "./room-manager";

const PORT = process.env.PORT || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:3000";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

const roomManager = new RoomManager();

// Set IO instance for room manager
roomManager.setIO(io);

// Health check endpoint
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Helper function to emit room state
  const emitRoomState = (roomCode: string) => {
    const room = roomManager.getRoom(roomCode);
    if (!room) return;

    const gameState = roomManager.getGameState(room);

    io.to(roomCode).emit(EVENTS.ROOM_STATE, {
      code: room.code,
      phase: room.phase,
      hostId: room.hostId,
      players: room.players,
      createdAt: room.createdAt,
      game: gameState,
    });
  };

  // Handle room creation
  socket.on(EVENTS.ROOM_CREATE, (payload) => {
    const result = RoomCreateSchema.safeParse(payload);
    if (!result.success) {
      socket.emit(EVENTS.ERROR, {
        message: "Invalid payload: " + result.error.message,
      } satisfies { message: string });
      return;
    }

    const { name } = result.data;
    const room = roomManager.createRoom(name, socket.id);
    socket.join(room.code);

    emitRoomState(room.code);

    console.log(`Room created: ${room.code} by ${socket.id}`);
  });

  // Handle room join
  socket.on(EVENTS.ROOM_JOIN, (payload) => {
    const result = RoomJoinSchema.safeParse(payload);
    if (!result.success) {
      socket.emit(EVENTS.ERROR, {
        message: "Invalid payload: " + result.error.message,
      } satisfies { message: string });
      return;
    }

    const { code, name } = result.data;
    const room = roomManager.joinRoom(code, name, socket.id);

    if (!room) {
      socket.emit(EVENTS.ERROR, {
        message: `Room ${code} not found or game has already started`,
      } satisfies { message: string });
      return;
    }

    socket.join(room.code);
    emitRoomState(room.code);

    console.log(`Player ${socket.id} joined room ${code}`);
  });

  // Handle ready toggle
  socket.on(EVENTS.READY_TOGGLE, (payload) => {
    // Validate payload (empty object)
    const result = ReadyToggleSchema.safeParse(payload);
    if (!result.success) {
      socket.emit(EVENTS.ERROR, {
        message: "Invalid payload: " + result.error.message,
      } satisfies { message: string });
      return;
    }

    const room = roomManager.toggleReady(socket.id);
    if (!room) {
      socket.emit(EVENTS.ERROR, {
        message: "You are not in a room or the game has already started",
      } satisfies { message: string });
      return;
    }

    emitRoomState(room.code);
    console.log(`Player ${socket.id} toggled ready in room ${room.code}`);
  });

  // Handle start game
  socket.on(EVENTS.START_GAME, (payload) => {
    // Validate payload (empty object)
    const result = StartGameSchema.safeParse(payload);
    if (!result.success) {
      socket.emit(EVENTS.ERROR, {
        message: "Invalid payload: " + result.error.message,
      } satisfies { message: string });
      return;
    }

    const room = roomManager.startGame(socket.id);
    if (!room) {
      const playerRoom = roomManager.getPlayerRoom(socket.id);
      if (!playerRoom) {
        socket.emit(EVENTS.ERROR, {
          message: "You are not in a room",
        } satisfies { message: string });
      } else if (playerRoom.hostId !== socket.id) {
        socket.emit(EVENTS.ERROR, {
          message: "Only the host can start the game",
        } satisfies { message: string });
      } else if (playerRoom.phase !== "LOBBY") {
        socket.emit(EVENTS.ERROR, {
          message: "Game has already started",
        } satisfies { message: string });
      } else if (playerRoom.players.length < 2) {
        socket.emit(EVENTS.ERROR, {
          message: "Need at least 2 players to start",
        } satisfies { message: string });
      } else {
        socket.emit(EVENTS.ERROR, {
          message: "All players must be ready to start",
        } satisfies { message: string });
      }
      return;
    }

    emitRoomState(room.code);
    console.log(`Game started in room ${room.code} by ${socket.id}`);
  });

  // Handle flip request
  socket.on(EVENTS.FLIP_REQUEST, (payload) => {
    const result = FlipRequestSchema.safeParse(payload);
    if (!result.success) {
      socket.emit(EVENTS.ERROR, {
        message: "Invalid payload: " + result.error.message,
      } satisfies { message: string });
      return;
    }

    const room = roomManager.flipCard(socket.id);
    if (!room) {
      const playerRoom = roomManager.getPlayerRoom(socket.id);
      if (!playerRoom) {
        socket.emit(EVENTS.ERROR, {
          message: "You are not in a room",
        } satisfies { message: string });
      } else if (playerRoom.phase !== "IN_GAME") {
        socket.emit(EVENTS.ERROR, {
          message: "Game is not in progress",
        } satisfies { message: string });
      } else {
        socket.emit(EVENTS.ERROR, {
          message: "It's not your turn",
        } satisfies { message: string });
      }
      return;
    }

    emitRoomState(room.code);
    console.log(`Player ${socket.id} flipped a card in room ${room.code}`);
  });

  // Handle claim attempt
  socket.on(EVENTS.CLAIM_ATTEMPT, (payload) => {
    const result = ClaimAttemptSchema.safeParse(payload);
    if (!result.success) {
      socket.emit(EVENTS.ERROR, {
        message: "Invalid payload: " + result.error.message,
      } satisfies { message: string });
      return;
    }

    const { claimId } = result.data;
    const room = roomManager.claimAttempt(socket.id, claimId);
    if (!room) {
      socket.emit(EVENTS.ERROR, {
        message: "You are not in a room or game is not in progress",
      } satisfies { message: string });
      return;
    }

    emitRoomState(room.code);
    console.log(`Player ${socket.id} attempted claim in room ${room.code}`);
  });

  // Handle room leave
  socket.on(EVENTS.ROOM_LEAVE, () => {
    const room = roomManager.leaveRoom(socket.id);
    if (room) {
      socket.leave(room.code);
      emitRoomState(room.code);
    }
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
    const room = roomManager.leaveRoom(socket.id);
    if (room) {
      socket.leave(room.code);
      emitRoomState(room.code);
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 Socket.IO server ready`);
  console.log(`🌐 CORS enabled for ${CORS_ORIGIN}`);
});

