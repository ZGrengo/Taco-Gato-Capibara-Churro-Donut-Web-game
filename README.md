# Taco · Gato · Capibara · Churro · Donut

🎮 Real-time Multiplayer Web Game

Juego de cartas multijugador en tiempo real inspirado en _Taco Gato Cabra Queso Pizza_, adaptado a web con **gestos**, **animaciones**, **sonido** y un **servidor autoritativo** para evitar desincronizaciones.

Construido como **monorepo** con Next.js, Socket.IO, TypeScript y Turborepo.

---

## ✨ Demo

- **Web (Vercel):** [Think-Fast!](https://thinkfast-web.vercel.app/)

> ℹ️ El servidor usa el free tier de Render. Tras un tiempo de inactividad puede "dormirse" (spin-down). El primer jugador puede notar un pequeño delay al conectar.

---

## 🧠 Idea del juego

Los jugadores se turnan para lanzar cartas a una **pila central** mientras se recita una secuencia fija de palabras:

**taco → gato → capibara → churro → donut → taco…**

Si la carta lanzada **coincide con la palabra actual** o es una **carta especial**, se abre una oportunidad de **claim**.

El objetivo es **quedarse sin cartas**.

---

## 🎮 Cómo se juega

### 1. Turnos

- Cada jugador tiene su propio mazo.
- En su turno, el jugador **hace click en su mazo** para lanzar una carta a la pila.
- El turno pasa automáticamente al siguiente jugador con cartas.

### 2. Coincidencias (MATCH)

- Si la carta coincide con la palabra actual → se puede **claimar** la pila.
- El claim se hace **tocando la pila**, sin botones (como el juego físico).

### 3. Cartas especiales

Las cartas especiales siempre abren un claim, pero requieren un **gesto**:

| Carta especial | Gesto                        |
| -------------- | ---------------------------- |
| SPECIAL_1      | Click Frenzy (clics rápidos) |
| SPECIAL_2      | Reventar burbujas            |
| SPECIAL_3      | Dibujar un círculo           |

### 4. Resolución del claim

- **Si no todos claimean:** pierden los jugadores que **no** claimearon.
- **Si todos claimean:** pierde el **último** en claimear (el más lento).
- **Falso claim:** si alguien toca la pila fuera de tiempo → se lleva toda la pila.

### 5. Final de partida

- Un jugador debe **hacer su último claim** para salir del juego.
- Gana el último jugador que queda con cartas.

---

## ✨ Experiencia y feedback visual

- Animaciones de cartas volando al centro
- Crecimiento visual de la pila
- Shake + feedback "Oops" en errores
- Gestos animados
- Sonidos dinámicos con pitch progresivo
- Música de fondo opcional
- Micro-interacciones (hover, anticipación, pulses)

---

## 🏗️ Arquitectura

### Principios clave

- **Servidor autoritativo**: el servidor decide siempre el estado.
- **Estado sincronizado**: el cliente solo renderiza `ROOM_STATE`.
- **Type safety end-to-end**: tipos compartidos entre cliente y servidor.

### Flujo general

1. Cliente envía una acción (`FLIP`, `CLAIM`, etc.)
2. Servidor valida, actualiza el estado
3. Servidor emite `ROOM_STATE`
4. Todos los clientes re-renderizan

---

## 🧠 Modelo de estado

### Estado interno (solo servidor)

- Cartas en mano por jugador
- Pila central
- Índice de turno
- Índice de palabra
- Ventana de claim (tiempos y orden)

### Estado público (cliente)

- Jugador en turno
- Palabra actual
- Cartas en pila
- Cartas restantes por jugador
- Estado del claim

> 🔒 El cliente **nunca** recibe las cartas de otros jugadores, solo contadores.

---

## 🔌 Eventos Socket.IO

### Cliente → Servidor

- `ROOM_CREATE`
- `ROOM_JOIN`
- `ROOM_LEAVE`
- `READY_TOGGLE`
- `START_GAME`
- `FLIP_REQUEST`
- `CLAIM_ATTEMPT`

### Servidor → Cliente

- `ROOM_STATE`
- `ERROR`

---

## 🏗️ Estructura del monorepo

```
├── apps/
│   ├── web/          # Next.js (App Router) + Tailwind + Framer Motion
│   └── server/       # Node.js + Express + Socket.IO
├── packages/
│   └── shared/       # Tipos, eventos y schemas Zod compartidos
└── turbo.json        # Configuración de Turborepo
```

---

## 📦 Paquetes

### `@acme/shared`

- Tipos TypeScript
- Eventos Socket.IO
- Constantes del juego
- Schemas Zod para validación

### `@acme/server`

- RoomManager en memoria
- Validación de payloads con Zod
- Control completo del estado del juego
- Endpoint de health para warm-up

### `@acme/web`

- Next.js 14 (App Router)
- TailwindCSS
- Framer Motion
- Socket.IO Client
- Gestos, animaciones y sonido
- Optimización de imágenes con `next/image`

---

## 🚀 Inicio rápido

### Requisitos

- Node.js **>= 18** (recomendado 20)
- pnpm **>= 8**

### Instalación

```bash
pnpm install
```

### Desarrollo

```bash
pnpm dev
```

- **Web**: http://localhost:3000
- **Server**: http://localhost:3001

---

## 📜 Scripts útiles

```bash
pnpm dev                 # web + server
pnpm build               # build completo
pnpm build:shared        # compila shared
pnpm build:server        # compila servidor
pnpm build:server:prod   # shared -> server
pnpm start:server        # arranca servidor compilado
pnpm lint
pnpm typecheck
```

---

## 🔧 Variables de entorno

### Servidor (apps/server/.env)

```env
PORT=3001
WEB_ORIGIN=http://localhost:3000
```

### Cliente (apps/web/.env.local)

```env
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
```

### Producción

**Server (Render)**

- `PORT` (automático)
- `WEB_ORIGIN=https://tu-app.vercel.app`

**Web (Vercel)**

- `NEXT_PUBLIC_SOCKET_URL=https://tu-server.onrender.com`

---

## ☁️ Deploy

- **Frontend**: Vercel
- **Backend**: Render (Node service)

> En free tier el servidor puede entrar en spin-down. El cliente muestra estado "conectando" y hace warm-up automático.

---

## ⚡ Optimizaciones de rendimiento

### Móvil

El juego detecta automáticamente dispositivos móviles y aplica optimizaciones:

- **Pilas estáticas**: Sin apilado visual (1 carta vs 4-6 en desktop)
- **Animaciones simplificadas**: Menos propiedades animadas, easing más simple
- **Efectos desactivados**: Tap rings, glow effects, hover animations
- **GPU acceleration**: `will-change` y `translateZ(0)` para animaciones críticas
- **Límite de cartas voladoras**: Máximo 2 simultáneas (vs 3 en desktop)

### Desktop

- Animaciones completas con scale, rotate y efectos visuales
- Apilado visual de cartas con offset y rotación
- Efectos de hover y micro-interacciones

### Otras optimizaciones

- Preloading de assets críticos (cartas, sonidos)
- Imágenes optimizadas con `next/image` y formato WebP
- Lazy loading de componentes no críticos
- Reducción de motion respeta `prefers-reduced-motion`

---

## 🔧 Troubleshooting

### El servidor no conecta

- Verifica que `NEXT_PUBLIC_SOCKET_URL` apunte al servidor correcto
- En Render free tier, el servidor puede tardar 30-50s en "despertar"
- El cliente muestra "Preparando servidor..." durante el warm-up

### Las animaciones se ven lentas en móvil

- El juego detecta móvil automáticamente y reduce animaciones
- Si persiste, verifica que no haya otros procesos pesados en el dispositivo

### Error de tipos TypeScript

```bash
pnpm build:shared  # Compila primero el paquete shared
pnpm typecheck     # Verifica tipos
```

### Problemas de build en producción

- Asegúrate de que `@acme/shared` esté compilado antes del build del servidor
- Usa `pnpm build:server:prod` para build completo en orden correcto

---

## 🎨 Características técnicas

### Sistema de audio

- Sonidos dinámicos con pitch progresivo según la pila
- Música de fondo opcional con control de volumen
- Preferencias guardadas en localStorage
- Unlock automático tras interacción del usuario

### Gestos

- **Click Frenzy**: Detección de clics rápidos con threshold configurable
- **Burbujas**: Sistema de colisiones y animaciones de partículas
- **Círculo**: Detección de path cerrado con tolerancia de forma

### Preloading

- Assets críticos (cartas, sonidos) se precargan al entrar al juego
- Indicador visual durante la carga inicial
- Fallback graceful si falla la precarga

---

## 🛠️ Tecnologías

- **Monorepo**: pnpm workspaces + Turborepo
- **Frontend**: Next.js 14, React 18, TailwindCSS, Framer Motion
- **Backend**: Node.js, Express, Socket.IO
- **Validación**: Zod
- **Lenguaje**: TypeScript (strict)
- **Calidad**: ESLint, Prettier
