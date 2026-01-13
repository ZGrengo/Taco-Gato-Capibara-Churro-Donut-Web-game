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

# Build específicos (para producción)
pnpm build:shared        # Compila solo el paquete shared
pnpm build:server        # Compila solo el servidor
pnpm build:server:prod   # Compila shared primero, luego server (recomendado para producción)
pnpm start:server       # Inicia el servidor compilado

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

#### Servidor (apps/server/.env)

Crea un archivo `.env` en `apps/server/` con:

```env
# Port where the server will listen
PORT=3001

# Web origin URL for CORS configuration
# For local development: http://localhost:3000
# For production: your production frontend URL
WEB_ORIGIN=http://localhost:3000
```

#### Cliente Web (apps/web/.env.local)

Crea un archivo `.env.local` en `apps/web/` con:

```env
# Socket.IO server URL
# For local development: http://localhost:3001
# For production: your production server URL
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
```

#### Producción

En producción (Render/Vercel), configura estas variables de entorno:

**Servidor:**
- `PORT`: Automáticamente asignado por la plataforma
- `WEB_ORIGIN`: URL de tu frontend en producción (ej: `https://tu-app.vercel.app`)

**Cliente:**
- `NEXT_PUBLIC_SOCKET_URL`: URL de tu servidor en producción (ej: `https://tu-servidor.onrender.com`)

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

