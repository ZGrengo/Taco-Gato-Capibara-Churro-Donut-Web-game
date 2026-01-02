# Game Monorepo - Real-time Multiplayer

Monorepo para un juego web en tiempo real usando Next.js, Socket.IO, TypeScript y Turborepo.

## 🏗️ Estructura

```
├── apps/
│   ├── web/          # Next.js (App Router) + TailwindCSS + Socket.IO Client
│   └── server/       # Node.js + Express + Socket.IO Server
├── packages/
│   └── shared/       # Tipos y schemas compartidos (Zod)
└── turbo.json        # Configuración de Turborepo
```

## 🚀 Inicio Rápido

### Prerrequisitos

- Node.js >= 18.0.0
- pnpm >= 8.0.0

### Instalación

```bash
pnpm install
```

### Desarrollo

Ejecuta todas las aplicaciones en modo desarrollo:

```bash
pnpm dev
```

Esto levantará:
- **Web**: http://localhost:3000
- **Server**: http://localhost:3001

### Scripts Disponibles

```bash
# Desarrollo (ejecuta web + server)
pnpm dev

# Build de todos los paquetes
pnpm build

# Linting
pnpm lint

# Type checking
pnpm typecheck
```

## 📦 Paquetes

### `@acme/shared`

Paquete compartido con:
- Eventos Socket.IO (`EVENTS`)
- Schemas Zod para validación
- Tipos TypeScript inferidos

### `@acme/server`

Servidor Socket.IO con:
- RoomManager en memoria
- Eventos: `ROOM_CREATE`, `ROOM_JOIN`, `ROOM_LEAVE`
- Validación de payloads con Zod
- CORS configurado para desarrollo

### `@acme/web`

Aplicación Next.js con:
- App Router
- TailwindCSS
- Framer Motion
- Cliente Socket.IO

## 🎮 Características

- **Sistema de Salas**: Crear y unirse a salas con códigos de 5 caracteres
- **Tiempo Real**: Actualización instantánea del estado de las salas
- **Validación**: Validación de payloads en el servidor con Zod
- **Type Safety**: Tipos compartidos entre cliente y servidor

## 🔧 Configuración

### Variables de Entorno

**apps/web/.env.local**:
```env
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
```

**apps/server** (opcional):
```env
PORT=3001
CORS_ORIGIN=http://localhost:3000
```

## 📝 Notas

- El RoomManager es en memoria (se reinicia al reiniciar el servidor)
- Los códigos de sala excluyen caracteres confusos (0, O, 1, I)
- Las salas se eliminan automáticamente cuando quedan vacías

## 🛠️ Tecnologías

- **Monorepo**: pnpm workspaces + Turborepo
- **Frontend**: Next.js 14, React 18, TailwindCSS, Framer Motion
- **Backend**: Node.js, Express, Socket.IO
- **Type Safety**: TypeScript (strict mode), Zod
- **Code Quality**: ESLint, Prettier

