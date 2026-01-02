import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import {
  EVENTS,
  RoomCreateSchema,
  RoomJoinSchema,
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

// Health check endpoint
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

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

    socket.emit(EVENTS.ROOM_STATE, {
      code: room.code,
      players: room.players,
      createdAt: room.createdAt,
    });

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
        message: `Room ${code} not found`,
      } satisfies { message: string });
      return;
    }

    socket.join(room.code);
    // Notify all players in the room
    io.to(room.code).emit(EVENTS.ROOM_STATE, {
      code: room.code,
      players: room.players,
      createdAt: room.createdAt,
    });

    console.log(`Player ${socket.id} joined room ${code}`);
  });

  // Handle room leave
  socket.on(EVENTS.ROOM_LEAVE, () => {
    const room = roomManager.leaveRoom(socket.id);
    if (room) {
      socket.leave(room.code);
      // Notify remaining players
      io.to(room.code).emit(EVENTS.ROOM_STATE, {
        code: room.code,
        players: room.players,
        createdAt: room.createdAt,
      });
    }
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
    const room = roomManager.leaveRoom(socket.id);
    if (room) {
      socket.leave(room.code);
      // Notify remaining players
      io.to(room.code).emit(EVENTS.ROOM_STATE, {
        code: room.code,
        players: room.players,
        createdAt: room.createdAt,
      });
    }
  });
});

httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 Socket.IO server ready`);
  console.log(`🌐 CORS enabled for ${CORS_ORIGIN}`);
});

