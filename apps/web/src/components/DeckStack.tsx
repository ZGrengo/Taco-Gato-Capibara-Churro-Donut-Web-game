"use client";

import { forwardRef, useState, useCallback, useRef, useEffect, useImperativeHandle } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useAudio } from "../hooks/useAudio";
import { useTranslations } from "../hooks/useTranslations";

interface Tap {
  id: string;
  x: number;
  y: number;
}

interface DeckStackProps {
  count: number;
  backSrc: string;
  isMyTurn?: boolean;
  enabled?: boolean;
  disabledReason?: string;
  onFlip?: () => void;
  onDisabledClick?: (reason: string) => void;
  helpText?: string | null; // Text to show in bubble above deck (null = hide)
  topCardRef?: React.RefObject<HTMLDivElement>; // Optional ref for top card (for future drag)
  playerStatus?: string; // Player status (e.g., "PENDING_EXIT", "OUT", "ACTIVE")
}

// Deterministic rotations table to avoid flicker
const ROTATIONS = [-1.5, 1.2, -0.8, 1.8, -1.2, 0.9];

/**
 * Help bubble component with auto-dismiss logic
 * Used by both mobile and desktop variants
 */
function useHelpBubbleAutoDismiss(helpText: string | null | undefined, count: number) {
  const [isVisible, setIsVisible] = useState(true);
  const shouldReduceMotion = useReducedMotion();
  const dismissTimeoutRef = useRef<number | null>(null);
  const prevCountRef = useRef<number>(count);

  // Reset visibility when helpText appears
  useEffect(() => {
    if (helpText) {
      setIsVisible(true);
      prevCountRef.current = count; // Reset count tracking
      
      // Clear existing timeout
      if (dismissTimeoutRef.current !== null) {
        clearTimeout(dismissTimeoutRef.current);
      }
      
      // Auto-dismiss after 3 seconds
      dismissTimeoutRef.current = window.setTimeout(() => {
        setIsVisible(false);
      }, 3000);

      return () => {
        if (dismissTimeoutRef.current !== null) {
          clearTimeout(dismissTimeoutRef.current);
        }
      };
    } else {
      setIsVisible(false);
    }
  }, [helpText, count]);

  // Dismiss immediately when user flips (count decreases)
  useEffect(() => {
    // If count decreased, user flipped a card
    if (count < prevCountRef.current && isVisible) {
      setIsVisible(false);
      // Clear timeout if still pending
      if (dismissTimeoutRef.current !== null) {
        clearTimeout(dismissTimeoutRef.current);
        dismissTimeoutRef.current = null;
      }
    }
    prevCountRef.current = count;
  }, [count, isVisible]);

  return { isVisible, shouldReduceMotion };
}

/**
 * Mobile help bubble component - Auto-dismisses after 3s or when count decreases (flip detected)
 */
function MobileHelpBubble({ 
  helpText, 
  enabled,
  count
}: { 
  helpText: string | null | undefined; 
  enabled: boolean;
  count: number;
}) {
  const { isVisible, shouldReduceMotion } = useHelpBubbleAutoDismiss(helpText, count);
  const t = useTranslations();

  if (!helpText || !isVisible) return null;

  // Short text for mobile
  const mobileText = helpText === t.deck.touchToPlay
    ? t.deck.touchYourDeckToPlay
    : helpText === t.deck.waiting
    ? t.deck.waiting
    : helpText;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ 
          duration: shouldReduceMotion ? 0.15 : 0.25,
          ease: "easeOut"
        }}
        className="md:hidden absolute -top-12 left-1/2 transform -translate-x-1/2 pointer-events-none z-50 max-w-[160px] w-full px-2"
      >
        <div className="bg-indigo-600 dark:bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium shadow-lg text-center relative mx-auto">
          {mobileText}
          {/* Arrow pointing down to deck */}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-0.5">
            <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-transparent border-t-indigo-600 dark:border-t-indigo-500"></div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Desktop help bubble component - Auto-dismisses after 3s, positioned to the right of deck
 */
function DesktopHelpBubble({ 
  helpText, 
  count
}: { 
  helpText: string | null | undefined; 
  count: number;
}) {
  const { isVisible, shouldReduceMotion } = useHelpBubbleAutoDismiss(helpText, count);

  if (!helpText || !isVisible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, x: -8, scale: 0.9 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: -8, scale: 0.9 }}
        transition={{ 
          duration: shouldReduceMotion ? 0.15 : 0.25,
          ease: "easeOut"
        }}
        className="hidden md:block absolute top-1/2 left-full ml-3 transform -translate-y-1/2 pointer-events-none z-50"
      >
        <div className="bg-indigo-600 dark:bg-indigo-500 text-white px-3 py-2 rounded-lg text-sm font-medium shadow-lg whitespace-nowrap relative">
          {helpText}
          {/* Speech bubble tail pointing left to deck */}
          <div className="absolute top-1/2 left-0 transform -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-indigo-600 dark:bg-indigo-500 rotate-45"></div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export const DeckStack = forwardRef<HTMLDivElement, DeckStackProps>(
  ({ count, backSrc, isMyTurn = false, enabled = false, disabledReason, onFlip, onDisabledClick, helpText, topCardRef, playerStatus }, ref) => {
    const shouldReduceMotion = useReducedMotion();
    const { playSfx } = useAudio();
    const t = useTranslations();
    const [isPressed, setIsPressed] = useState(false);
    const [isHovering, setIsHovering] = useState(false);
    const [isPointerFine, setIsPointerFine] = useState(false);
    const [taps, setTaps] = useState<Tap[]>([]);
    const containerRef = useRef<HTMLDivElement>(null);
    const internalTopCardRef = useRef<HTMLDivElement>(null);
    const lastTapRef = useRef<{ id: string; x: number; y: number; time: number } | null>(null);
    const prevCountRef = useRef<number>(count); // Track previous count to detect win
    
    // Render 4-6 card backs in a stack (not all cards)
    const stackLayers = Math.min(6, Math.max(4, Math.min(count, 6)));
    const baseLayers = Math.max(0, stackLayers - 1); // Layers below the top card

    // Detect if pointer is fine (desktop/mouse)
    useEffect(() => {
      const mediaQuery = window.matchMedia("(pointer: fine)");
      setIsPointerFine(mediaQuery.matches);

      const handleChange = (e: MediaQueryListEvent) => {
        setIsPointerFine(e.matches);
      };

      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }, []);

    // Expose top card ref if provided
    useEffect(() => {
      if (topCardRef && internalTopCardRef.current) {
        (topCardRef as React.MutableRefObject<HTMLDivElement | null>).current = internalTopCardRef.current;
      }
    }, [topCardRef]);

    // Helper to create tap ring
    const addTapRing = useCallback((x: number, y: number) => {
      const now = Date.now();
      
      // Prevent duplicates within 150ms at same position
      if (
        lastTapRef.current &&
        Math.abs(lastTapRef.current.x - x) < 10 &&
        Math.abs(lastTapRef.current.y - y) < 10 &&
        now - lastTapRef.current.time < 150
      ) {
        return;
      }
      
      const tapId = `deck-tap-${now}-${Math.random()}`;
      lastTapRef.current = { id: tapId, x, y, time: now };
      
      setTaps((prev) => [...prev, { id: tapId, x, y }]);

      // Remove tap after animation completes
      setTimeout(() => {
        setTaps((prev) => prev.filter((tap) => tap.id !== tapId));
        if (lastTapRef.current?.id === tapId) {
          lastTapRef.current = null;
        }
      }, 400);
    }, []);

    const handleClick = useCallback(() => {
      if (enabled && onFlip) {
        onFlip();
      } else if (!enabled && disabledReason && onDisabledClick) {
        onDisabledClick(disabledReason);
      }
    }, [enabled, onFlip, disabledReason, onDisabledClick]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
      if (enabled && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        onFlip?.();
      }
    }, [enabled, onFlip]);

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      
      setIsPressed(true);

      // Add tap ring if enabled
      if (enabled) {
        const target = containerRef.current;
        if (target) {
          const rect = target.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          addTapRing(x, y);
        }
      }
    }, [enabled, addTapRing]);

    const handlePointerUp = useCallback(() => {
      setIsPressed(false);
    }, []);

    const handlePointerCancel = useCallback(() => {
      setIsPressed(false);
    }, []);

    const handlePointerLeave = useCallback(() => {
      setIsPressed(false);
      setIsHovering(false);
    }, []);

    const handleMouseEnter = useCallback(() => {
      setIsHovering(true);
    }, []);

    const handleMouseLeave = useCallback(() => {
      setIsHovering(false);
    }, []);

    // Determine if peek hover is allowed
    const canHoverPeek = enabled && count > 0 && isPointerFine && !shouldReduceMotion;

    // Variants for top card hover peek
    const topCardVariants = {
      rest: {
        y: 0,
        x: 0,
        rotate: 0,
        scale: 1,
      },
      hover: {
        y: -12,
        x: 4,
        rotate: -3,
        scale: 1.02,
        transition: {
          duration: 0.2,
          ease: "easeOut",
        },
      },
      pressed: {
        scale: 0.99,
        transition: {
          duration: 0.05,
        },
      },
    };

    // Calculate animation state for top card
    const getTopCardAnimation = () => {
      if (isPressed && enabled) {
        // When pressed, maintain hover position if hovering, otherwise rest
        if (isHovering && canHoverPeek) {
          return {
            y: -12,
            x: 4,
            rotate: -3,
            scale: 0.99, // Press feedback
          };
        }
        return {
          y: 0,
          x: 0,
          rotate: 0,
          scale: 0.99, // Press feedback
        };
      }
      if (isHovering && canHoverPeek) {
        return "hover";
      }
      return "rest";
    };

    // Detect win (count becomes 0)
    useEffect(() => {
      if (count === 0 && prevCountRef.current > 0) {
        // Player won! Play victory sound
        playSfx('game_win');
      }
      prevCountRef.current = count;
    }, [count, playSfx]);
    
    if (count === 0) {
      // If player is waiting for final claim, show "One last claim!" instead of "You won!"
      const isWaitingForFinalClaim = playerStatus === "PENDING_EXIT";
      
      return (
        <div
          ref={ref}
          className="relative w-56 h-72 flex items-center justify-center"
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-green-500 text-white rounded-xl shadow-xl border-4 border-green-600 px-6 py-4 text-center"
          >
            <p className="text-xl font-bold">{isWaitingForFinalClaim ? "⏳" : "🎉"}</p>
            <p className="text-sm font-semibold mt-1">
              {isWaitingForFinalClaim ? t.deck.oneLastClaim : t.deck.youWon}
            </p>
          </motion.div>
        </div>
      );
    }

    // Base opacity: reduced when disabled or not my turn
    const baseOpacity = enabled && isMyTurn ? 1 : enabled ? 0.85 : 0.7;
    const saturation = enabled ? 1 : 0.5; // Reduced saturation when disabled

    return (
      <motion.div
        ref={ref}
        className="relative w-56 h-72 overflow-visible"
        style={{ position: "relative", overflow: "visible" }}
      >
        <div
          ref={containerRef}
          role="button"
          tabIndex={enabled ? 0 : -1}
          aria-disabled={!enabled}
          aria-label={enabled ? t.deck.flipCard : disabledReason || t.deck.cannotFlipCard}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onPointerLeave={handlePointerLeave}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          className={`relative w-full h-full ${
            enabled ? "cursor-pointer" : "cursor-not-allowed"
          }`}
          style={{
            opacity: baseOpacity,
            filter: `saturate(${saturation})`,
          }}
        >
          {/* Base stack layers (bottom cards, no hover animation) */}
          {baseLayers > 0 && Array.from({ length: baseLayers }).map((_, index) => {
            const translateX = index * 2;
            const translateY = index * 2;
            const zIndex = baseLayers - index;
            const layerOpacity = (1 - index * 0.05) * baseOpacity;
            const rotation = ROTATIONS[index % ROTATIONS.length];

            return (
              <div
                key={`base-${index}`}
                className="absolute rounded-xl shadow-lg border-4 border-gray-300 dark:border-gray-600 overflow-hidden"
                style={{
                  width: "100%",
                  height: "100%",
                  transform: `translate(${translateX}px, ${translateY}px) rotate(${rotation}deg)`,
                  zIndex,
                  opacity: layerOpacity,
                }}
              >
                <img
                  src={backSrc}
                  alt="Card back"
                  className="w-full h-full object-cover"
                  draggable={false}
                />
              </div>
            );
          })}

          {/* Top card (separate, with hover peek animation) */}
          {stackLayers > 0 && (
            <motion.div
              ref={internalTopCardRef}
              className="absolute rounded-xl shadow-lg border-4 border-gray-300 dark:border-gray-600 overflow-hidden z-20"
              style={{
                width: "100%",
                height: "100%",
                transform: `translate(${baseLayers * 2}px, ${baseLayers * 2}px)`,
                opacity: baseOpacity,
              }}
              variants={topCardVariants}
              initial="rest"
              animate={getTopCardAnimation()}
              transition={
                typeof getTopCardAnimation() === "string"
                  ? undefined // Use variant transitions
                  : {
                      duration: isPressed ? 0.05 : 0.2,
                      ease: "easeOut",
                    }
              }
            >
              <img
                src={backSrc}
                alt="Card back"
                className="w-full h-full object-cover"
                draggable={false}
              />
            </motion.div>
          )}

          {/* Badge with count */}
          <motion.div
            className="absolute -top-2 -right-2 bg-indigo-600 text-white rounded-full w-12 h-12 flex items-center justify-center font-bold text-lg shadow-lg z-50 border-2 border-white dark:border-gray-800"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200 }}
            style={{ opacity: baseOpacity }}
          >
            {count}
          </motion.div>

          {/* Tap rings */}
          <div 
            className="absolute inset-0 pointer-events-none overflow-visible"
            style={{ 
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 99999,
              overflow: "visible",
            }}
          >
            <AnimatePresence>
              {taps.map((tap) => (
                <motion.div
                  key={tap.id}
                  className="absolute rounded-full pointer-events-none"
                  style={{
                    position: "absolute",
                    left: `${tap.x}px`,
                    top: `${tap.y}px`,
                    transform: "translate(-50%, -50%)",
                    width: "60px",
                    height: "60px",
                    border: "2px solid rgba(147, 197, 253, 0.6)",
                    boxShadow: "0 0 15px 3px rgba(147, 197, 253, 0.4)",
                    backgroundColor: "rgba(147, 197, 253, 0.15)",
                    zIndex: 99999,
                  }}
                  initial={{
                    scale: 0.2,
                    opacity: shouldReduceMotion ? 0.4 : 0.6,
                  }}
                  animate={{
                    scale: shouldReduceMotion ? 0.6 : 1.2,
                    opacity: 0,
                  }}
                  exit={{
                    opacity: 0,
                    scale: 0,
                  }}
                  transition={{
                    duration: shouldReduceMotion ? 0.15 : 0.25,
                    ease: "easeOut",
                  }}
                />
              ))}
            </AnimatePresence>
          </div>

          {/* Help text bubble - Desktop: right side, auto-dismiss */}
          {helpText && (
            <DesktopHelpBubble 
              helpText={helpText} 
              count={count}
            />
          )}

          {/* Help text bubble - Mobile: centered, compact, auto-dismiss */}
          {helpText && (
            <MobileHelpBubble 
              helpText={helpText} 
              enabled={enabled}
              count={count}
            />
          )}
        </div>
      </motion.div>
    );
  }
);

DeckStack.displayName = "DeckStack";

