"use client";

import { forwardRef, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

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
}

export const DeckStack = forwardRef<HTMLDivElement, DeckStackProps>(
  ({ count, backSrc, isMyTurn = false, enabled = false, disabledReason, onFlip, onDisabledClick, helpText }, ref) => {
    const shouldReduceMotion = useReducedMotion();
    const [isPressed, setIsPressed] = useState(false);
    const [taps, setTaps] = useState<Tap[]>([]);
    const containerRef = useRef<HTMLDivElement>(null);
    const lastTapRef = useRef<{ id: string; x: number; y: number; time: number } | null>(null);
    
    // Render 4-6 card backs in a stack (not all cards)
    const stackLayers = Math.min(6, Math.max(4, Math.min(count, 6)));

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
    }, []);

    if (count === 0) {
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
            <p className="text-xl font-bold">🎉</p>
            <p className="text-sm font-semibold mt-1">¡Ganaste!</p>
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
        className="relative w-56 h-72"
        style={{ position: "relative" }}
      >
        <motion.div
          ref={containerRef}
          role="button"
          tabIndex={enabled ? 0 : -1}
          aria-disabled={!enabled}
          aria-label={enabled ? "Voltear carta" : disabledReason || "No se puede voltear carta"}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onPointerLeave={handlePointerLeave}
          className={`relative w-full h-full ${
            enabled ? "cursor-pointer" : "cursor-not-allowed"
          }`}
          style={{
            opacity: baseOpacity,
            filter: `saturate(${saturation})`,
          }}
          whileHover={enabled && isMyTurn && !shouldReduceMotion ? { y: -4, transition: { duration: 0.2 } } : {}}
          animate={isPressed && enabled ? { scale: 0.99 } : { scale: 1 }}
          transition={{ duration: 0.1 }}
        >
        {/* Stack of card backs */}
        {Array.from({ length: stackLayers }).map((_, index) => {
          const translateX = index * 2;
          const translateY = index * 2;
          const zIndex = stackLayers - index;
          const layerOpacity = (1 - index * 0.05) * baseOpacity;

          return (
            <motion.div
              key={index}
              className="absolute rounded-xl shadow-lg border-4 border-gray-300 dark:border-gray-600 overflow-hidden"
              style={{
                width: "100%",
                height: "100%",
                transform: `translate(${translateX}px, ${translateY}px)`,
                zIndex,
                opacity: layerOpacity,
              }}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: layerOpacity }}
              transition={{ delay: index * 0.05 }}
            >
              <img
                src={backSrc}
                alt="Card back"
                className="w-full h-full object-cover"
                draggable={false}
              />
            </motion.div>
          );
        })}

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

          {/* Help text bubble */}
          <AnimatePresence>
            {helpText && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.9 }}
                transition={{ duration: 0.2 }}
                className="absolute -top-14 left-[40%] transform -translate-x-1/2 pointer-events-none z-50"
              >
                <div className="bg-indigo-600 dark:bg-indigo-500 text-white px-3 py-2 rounded-lg text-sm font-medium shadow-lg whitespace-nowrap relative">
                  {helpText}
                  {/* Speech bubble tail */}
                  <div className="absolute -bottom-1 left-[60%] transform -translate-x-1/2 w-2 h-2 bg-indigo-600 dark:bg-indigo-500 rotate-45"></div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    );
  }
);

DeckStack.displayName = "DeckStack";

