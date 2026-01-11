/**
 * Translation keys and values for the game
 * 
 * Structure prepared for multi-language support.
 * Currently: Spanish (es) as default
 * Future: English (en) and other languages can be added
 */

export type Language = 'es' | 'en';

export interface Translations {
  // Common
  common: {
    connected: string;
    disconnected: string;
    music: string;
    musicOn: string;
    musicOff: string;
    activateMusic: string;
    deactivateMusic: string;
    multiplayerGame: string;
    realtimeMultiplayerExperience: string;
    changeToEnglish: string;
    changeToSpanish: string;
    gameTitle: string;
    wordSequence: string;
  };

  // Player
  player: {
    yourName: string;
    enterYourName: string;
    pleaseEnterName: string;
    pleaseEnterNameAndRoomCode: string;
  };

  // Room
  room: {
    roomCode: string;
    createRoom: string;
    joinRoom: string;
    join: string;
    roomCodePlaceholder: string;
    leaveRoom: string;
  };

  // Game
  game: {
    gameInProgress: string;
    startGame: string;
    gameHasAlreadyStarted: string;
    needAtLeast2Players: string;
    playersNotReady: string;
    playerNotReady: string;
    howToPlay: string;
    howToPlaySteps: {
      turnBased: {
        title: string;
        description: string;
      };
      sequence: {
        title: string;
        description: string;
      };
      claim: {
        title: string;
        description: string;
      };
      oops: {
        title: string;
        description: string;
      };
      special: {
        title: string;
        description: string;
      };
    };
    phase: {
      lobby: string;
      inGame: string;
      ended: string;
    };
  };

  // Players
  players: {
    players: string;
    host: string;
    turn: string;
    currentTurn: string;
    ready: string;
    notReady: string;
    waitingForFinalClaim: string;
  };

  // Deck
  deck: {
    touchToPlay: string;
    touchYourDeckToPlay: string;
    waiting: string;
    youWon: string;
    flipCard: string;
    cannotFlipCard: string;
  };

  // Pile
  pile: {
    oops: string;
    youGotCards: string;
    youGotCard: string;
    cards: string;
    card: string;
  };

  // Gestures
  gestures: {
    clickFrenzy: {
      completed: string;
      timeUp: string;
      clickHere: string;
      clicksRemaining: string;
    };
      bubbles: {
        completed: string;
        timeUp: string;
        popBubbles: string;
        bubblesRemaining: string;
        bubbles: string;
      };
    circle: {
      completed: string;
      timeUp: string;
      drawCircle: string;
    };
  };
}

const translations: Record<Language, Translations> = {
  es: {
    common: {
      connected: 'Conectado',
      disconnected: 'Desconectado',
      music: 'Música',
      musicOn: 'Música ON',
      musicOff: 'Música OFF',
      activateMusic: 'Activar música',
      deactivateMusic: 'Desactivar música',
      multiplayerGame: '🎮 Juego Multijugador',
      realtimeMultiplayerExperience: 'Experiencia multijugador en tiempo real',
      changeToEnglish: 'Cambiar a inglés',
      changeToSpanish: 'Cambiar a español',
      gameTitle: '¡Piensa Rápido!',
      wordSequence: 'TACO - GATO - CAPIBARA - CHURRO - DONUT',
    },
    player: {
      yourName: 'Tu Nombre',
      enterYourName: 'Ingresa tu nombre',
      pleaseEnterName: 'Por favor ingresa tu nombre',
      pleaseEnterNameAndRoomCode: 'Por favor ingresa tu nombre y código de sala',
    },
    room: {
      roomCode: 'Código de Sala',
      createRoom: 'Crear Sala',
      joinRoom: 'Unirse a Sala',
      join: 'Unirse',
      roomCodePlaceholder: 'Código de sala',
      leaveRoom: 'Salir de Sala',
    },
    game: {
      gameInProgress: '🎮 Partida en Curso',
      startGame: 'Iniciar Partida',
      gameHasAlreadyStarted: 'La partida ya ha comenzado',
      needAtLeast2Players: 'Se necesitan al menos 2 jugadores para empezar',
      playersNotReady: 'jugadores no están listos',
      playerNotReady: 'jugador no está listo',
      howToPlay: '🎮 Cómo jugar',
      howToPlaySteps: {
        turnBased: {
          title: '🃏 Juega por turnos',
          description: 'Toca tu mazo cuando sea tu turno para lanzar una carta.',
        },
        sequence: {
          title: '🔁 Sigue la secuencia',
          description: 'Las palabras siguen este orden: taco → gato → capibara → churro → donut',
        },
        claim: {
          title: '✋ Reclama rápido',
          description: 'Si la carta coincide con la palabra, toca la pila antes que los demás.',
        },
        oops: {
          title: '😵‍💫 Evita el Oops',
          description: 'Si reclamas cuando no toca, te llevas toda la pila.',
        },
        special: {
          title: '⭐ Cartas especiales',
          description: 'Algunas cartas activan gestos especiales que debes completar.',
        },
      },
      phase: {
        lobby: 'LOBBY',
        inGame: 'EN JUEGO',
        ended: 'TERMINADA',
      },
    },
    players: {
      players: 'Jugadores',
      host: 'Host',
      turn: 'Turno',
      currentTurn: 'Turno Actual',
      ready: '✓ Listo',
      notReady: '○ No Listo',
      waitingForFinalClaim: '⏳ Esperando claim final para salir',
      spectator: '👁️ Espectador',
    },
    deck: {
      touchToPlay: '¡Tócame para jugar tu próxima carta!',
      touchYourDeckToPlay: 'Toca tu mazo para jugar',
      waiting: 'Esperando...',
      youWon: '¡Ganaste!',
      flipCard: 'Voltear carta',
      cannotFlipCard: 'No se puede voltear carta',
    },
    pile: {
      oops: 'Oops!',
      youGotCards: 'Te llevas',
      youGotCard: 'Te llevas',
      cards: 'cartas',
      card: 'carta',
    },
    gestures: {
      clickFrenzy: {
        completed: '¡Completado!',
        timeUp: 'Tiempo agotado',
        clickHere: '¡Haz click aquí!',
        clicksRemaining: 'clicks restantes',
      },
      bubbles: {
        completed: '¡Completado!',
        timeUp: 'Tiempo agotado',
        popBubbles: '¡Reventa burbujas!',
        bubblesRemaining: 'burbujas restantes',
        bubbles: 'Burbujas',
      },
      circle: {
        completed: '¡Completado!',
        timeUp: 'Tiempo agotado',
        drawCircle: '¡Dibuja un círculo!',
        drawCircleAroundCard: 'Dibuja un círculo alrededor de la carta',
        tryAgain: 'Intenta de nuevo',
      },
    },
  },
  en: {
    common: {
      connected: 'Connected',
      disconnected: 'Disconnected',
      music: 'Music',
      musicOn: 'Music ON',
      musicOff: 'Music OFF',
      activateMusic: 'Activate music',
      deactivateMusic: 'Deactivate music',
      multiplayerGame: '🎮 Multiplayer Game',
      realtimeMultiplayerExperience: 'Real-time multiplayer experience',
      changeToEnglish: 'Change to English',
      changeToSpanish: 'Change to Spanish',
      gameTitle: 'Think Fast!',
      wordSequence: 'TACO - CAT - CAPYBARA - CHURRO - DONUT',
    },
    player: {
      yourName: 'Your Name',
      enterYourName: 'Enter your name',
      pleaseEnterName: 'Please enter your name',
      pleaseEnterNameAndRoomCode: 'Please enter your name and room code',
    },
    room: {
      roomCode: 'Room Code',
      createRoom: 'Create Room',
      joinRoom: 'Join Room',
      join: 'Join',
      roomCodePlaceholder: 'Room code',
      leaveRoom: 'Leave Room',
    },
    game: {
      gameInProgress: '🎮 Game In Progress',
      startGame: 'Start Game',
      gameHasAlreadyStarted: 'Game has already started',
      needAtLeast2Players: 'Need at least 2 players to start',
      playersNotReady: 'player(s) not ready',
      playerNotReady: 'player not ready',
      howToPlay: '🎮 How to Play',
      howToPlaySteps: {
        turnBased: {
          title: '🃏 Play in turns',
          description: 'Touch your deck when it\'s your turn to throw a card.',
        },
        sequence: {
          title: '🔁 Follow the sequence',
          description: 'Words follow this order: taco → gato → capibara → churro → donut',
        },
        claim: {
          title: '✋ Claim quickly',
          description: 'If the card matches the word, touch the pile before others.',
        },
        oops: {
          title: '😵‍💫 Avoid the Oops',
          description: 'If you claim when it\'s not correct, you take the whole pile.',
        },
        special: {
          title: '⭐ Special cards',
          description: 'Some cards activate special gestures you must complete.',
        },
      },
      phase: {
        lobby: 'LOBBY',
        inGame: 'IN GAME',
        ended: 'ENDED',
      },
    },
    players: {
      players: 'Players',
      host: 'Host',
      turn: 'Turn',
      currentTurn: 'Current Turn',
      ready: '✓ Ready',
      notReady: '○ Not Ready',
      waitingForFinalClaim: '⏳ Waiting for final claim to exit',
      spectator: '👁️ Spectator',
    },
    deck: {
      touchToPlay: 'Touch me to play your next card!',
      touchYourDeckToPlay: 'Touch your deck to play',
      waiting: 'Waiting...',
      youWon: 'You Won!',
      flipCard: 'Flip card',
      cannotFlipCard: 'Cannot flip card',
    },
    pile: {
      oops: 'Oops!',
      youGotCards: 'You got',
      youGotCard: 'You got',
      cards: 'cards',
      card: 'card',
    },
    gestures: {
      clickFrenzy: {
        completed: 'Completed!',
        timeUp: 'Time Up',
        clickHere: 'Click here!',
        clicksRemaining: 'clicks remaining',
      },
      bubbles: {
        completed: 'Completed!',
        timeUp: 'Time Up',
        popBubbles: 'Pop bubbles!',
        bubblesRemaining: 'bubbles remaining',
        bubbles: 'Bubbles',
      },
      circle: {
        completed: 'Completed!',
        timeUp: 'Time Up',
        drawCircle: 'Draw a circle!',
        drawCircleAroundCard: 'Draw a circle around the card',
        tryAgain: 'Try again',
      },
    },
  },
};

/**
 * Get translations for a specific language
 */
export function getTranslations(lang: Language = 'es'): Translations {
  return translations[lang] || translations.es;
}

/**
 * Current language (can be made dynamic later with context/state)
 */
export const DEFAULT_LANGUAGE: Language = 'es';

