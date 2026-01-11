"use client";

import { forwardRef, ReactNode, useMemo } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import type { Card } from "@acme/shared";
import { useTranslations } from "../hooks/useTranslations";

const MAX_PILE_LAYERS = 10;

// Deterministic rotation table to avoid flicker
const ROTATIONS = [-2, 1.5, -1, 2, -1.8, 1, -2.2, 1.2, -1.2, 2.1];

interface PileCenterProps {
  pileCount: number;
  topCard?: Card;
  backSrc: string;
  impactKey?: number;
  shakeKey?: number;
  oopsKey?: number;
  oopsCardCount?: number;
  goodKey?: number; // Key for successful claim notification
  anticipationKey?: number; // Key for micro-anticipation when claim opens
  children: ReactNode;
}

export const PileCenter = forwardRef<HTMLDivElement, PileCenterProps>(
  ({ pileCount, topCard, backSrc, impactKey = 0, shakeKey = 0, oopsKey = 0, oopsCardCount = 0, goodKey = 0, anticipationKey = 0, children }, ref) => {
    const shouldReduceMotion = useReducedMotion();
    const t = useTranslations();
    
    // Calculate visible layers (pileCount - 1 because topCard is separate)
    const visibleLayers = Math.min(Math.max(0, pileCount - 1), MAX_PILE_LAYERS);

    // Combine impact bounce, shake, and anticipation animations
    // Use useMemo to ensure animations object changes when keys change
    const animateProps = useMemo(() => {
      const animations: any = {};
      
      if (!shouldReduceMotion) {
        if (impactKey > 0) {
          animations.scale = [1, 1.05, 0.99, 1];
          animations.y = [0, -6, 0];
        }
        
        if (shakeKey > 0) {
          animations.x = [0, -10, 10, -8, 8, -4, 4, 0];
          animations.rotate = [0, -2, 2, -1.5, 1.5, 0];
        }
        
        // Anticipation animation: thump when claim opens (glow is handled separately as overlay)
        // The scale animation creates the micro-freeze + thump effect
        if (anticipationKey > 0) {
          animations.scale = [1, 1, 1.05, 1]; // Micro-freeze (hold at 1 for ~120ms) then stronger thump
        }
      }
      // Note: Glow effect for anticipation is handled by a separate overlay element, not via boxShadow in animations
      
      // Always return an object, even if empty, to ensure Framer Motion detects changes
      return Object.keys(animations).length > 0 ? animations : { scale: 1, y: 0 };
    }, [impactKey, shakeKey, anticipationKey, shouldReduceMotion]);

    const getTransitionProps = () => {
      if (shakeKey > 0) {
        return { duration: 0.35, ease: "easeOut" };
      }
      if (anticipationKey > 0) {
        // Anticipation: 150ms freeze (hold at scale 1) + 100ms thump = 250ms total (more impactful)
        // Glow is handled separately by overlay element, not via boxShadow
        return {
          scale: {
            times: [0, 0.6, 0.9, 1], // 0ms, 150ms (freeze), 225ms (thump peak), 250ms (rest)
            duration: 0.25,
            ease: "easeOut",
          },
        };
      }
      return { duration: 0.25, ease: "easeOut" };
    };

    return (
      <div ref={ref} className="relative w-full max-w-sm">
        {/* Container for stack of backs with impact/shake/anticipation animations */}
        <motion.div
          animate={animateProps}
          transition={getTransitionProps()}
          className="relative"
          style={{ 
            pointerEvents: 'none',
          }}
        >
          {/* Stack of card backs behind topCard */}
          <div className="relative" style={{ width: "224px", height: "288px", margin: "0 auto" }}>
            {/* Anticipation glow ring - positioned over the stack */}
            <AnimatePresence>
              {anticipationKey > 0 && (
                <motion.div
                  key={`anticipation-glow-${anticipationKey}`}
                  className="absolute rounded-xl pointer-events-none"
                  style={{
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    border: shouldReduceMotion ? "2px solid rgba(99, 102, 241, 0.4)" : "4px solid rgba(99, 102, 241, 0.8)",
                    boxShadow: shouldReduceMotion 
                      ? "0 0 15px 4px rgba(99, 102, 241, 0.4)" 
                      : "0 0 35px 12px rgba(99, 102, 241, 0.8), 0 0 60px 20px rgba(99, 102, 241, 0.5), inset 0 0 20px rgba(99, 102, 241, 0.4)",
                    zIndex: MAX_PILE_LAYERS + 3,
                  }}
                  initial={{ 
                    opacity: 0,
                    scale: 1,
                  }}
                  animate={shouldReduceMotion ? {
                    opacity: [0, 0.4, 0.4, 0],
                  } : {
                    opacity: [0, 0, 0.95, 0.95, 0],
                  }}
                  exit={{ opacity: 0 }}
                  transition={shouldReduceMotion ? {
                    duration: 0.15,
                    ease: "easeOut",
                  } : {
                    opacity: {
                      times: [0, 0.6, 0.8, 0.9, 1], // 0ms, 150ms (hold), 200ms (peak), 225ms (hold), 250ms (fade)
                      duration: 0.25,
                      ease: "easeOut",
                    },
                  }}
                />
              )}
            </AnimatePresence>
            {Array.from({ length: visibleLayers }).map((_, index) => {
              const layerIndex = visibleLayers - 1 - index; // Reverse order (bottom to top)
              const translateX = layerIndex * 2;
              const translateY = layerIndex * 2;
              const rotation = ROTATIONS[layerIndex % ROTATIONS.length];
              const zIndex = index + 1; // Lower z-index for layers behind

              return (
                <div
                  key={`back-${layerIndex}`}
                  className="absolute rounded-xl shadow-lg border-4 border-gray-300 dark:border-gray-600 overflow-hidden"
                  style={{
                    width: "100%",
                    height: "100%",
                    transform: `translate(${translateX}px, ${translateY}px) rotate(${rotation}deg)`,
                    zIndex,
                    opacity: 0.85 - layerIndex * 0.03, // Slight fade for depth
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
          </div>
        </motion.div>

        {/* Top card and clickable content - separate container that doesn't re-render on impact/shake */}
        <div className="relative" style={{ zIndex: MAX_PILE_LAYERS + 1, marginTop: '-288px' }}>
          {children}
        </div>

        {/* Ripple effect - positioned absolutely relative to container */}
        <AnimatePresence>
          {!shouldReduceMotion && impactKey > 0 && (
            <motion.div
              key={impactKey}
              className="absolute rounded-full pointer-events-none"
              style={{
                top: "50%",
                left: "50%",
                width: "224px",
                height: "224px",
                transform: "translate(-50%, -50%)",
                border: "3px solid rgba(99, 102, 241, 0.25)",
                zIndex: MAX_PILE_LAYERS + 2,
                marginTop: '-144px', // Center vertically (half of 288px)
              }}
              initial={{
                scale: 0.2,
                opacity: 0.25,
              }}
              animate={{
                scale: 1.4,
                opacity: 0,
              }}
              exit={{
                opacity: 0,
              }}
              transition={{
                duration: 0.35,
                ease: "easeOut",
              }}
            />
          )}
        </AnimatePresence>

        {/* Pile count badge */}
        {pileCount > 0 && (
          <motion.div
            className="absolute -top-2 -right-2 bg-indigo-600 text-white rounded-full w-10 h-10 flex items-center justify-center font-bold text-sm shadow-lg z-50 border-2 border-white dark:border-gray-800"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200 }}
          >
            {pileCount}
          </motion.div>
        )}

        {/* Oops! toast notification */}
        <AnimatePresence mode="wait">
          {oopsKey > 0 && oopsCardCount > 0 && (
            <motion.div
              key={`oops-${oopsKey}`}
              className="absolute -top-16 left-1/2 transform -translate-x-1/2 pointer-events-none z-[60]"
              initial={{
                opacity: 0,
                y: 8,
                scale: 0.9,
              }}
              animate={{
                opacity: 1,
                y: -8,
                scale: 1.05,
              }}
              exit={{
                opacity: 0,
                y: -18,
                scale: 0.95,
              }}
              transition={{
                duration: 0.7,
                ease: "easeOut",
              }}
            >
              <div className="bg-red-500 text-white px-6 py-3 rounded-lg font-bold text-lg shadow-2xl border-4 border-red-600 dark:border-red-700 whitespace-nowrap">
                <span className="drop-shadow-[0_0_8px_rgba(0,0,0,0.8)]">
                  😵‍💫 {t.pile.oops} {t.pile.youGotCards} {oopsCardCount} {oopsCardCount === 1 ? t.pile.card : t.pile.cards}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ¡Bien! success notification */}
        <AnimatePresence mode="wait">
          {goodKey > 0 && (
            <motion.div
              key={`good-${goodKey}`}
              className="absolute -top-16 left-1/2 transform -translate-x-1/2 pointer-events-none z-[60]"
              initial={{
                opacity: 0,
                y: 8,
                scale: 0.9,
              }}
              animate={{
                opacity: 1,
                y: -8,
                scale: [1, 1.08, 1.05], // Bounce effect
              }}
              exit={{
                opacity: 0,
                y: -18,
                scale: 0.95,
              }}
              transition={{
                duration: 0.7,
                ease: "easeOut",
                scale: {
                  times: [0, 0.6, 1],
                  duration: 0.7,
                },
              }}
            >
              <div className="bg-green-500 text-white px-6 py-3 rounded-lg font-bold text-lg shadow-2xl border-4 border-green-600 dark:border-green-700 whitespace-nowrap">
                <span className="drop-shadow-[0_0_8px_rgba(0,0,0,0.8)] flex items-center gap-2">
                  <span>😊</span>
                  <span>¡Bien!</span>
                  <span>✓</span>
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }
);

PileCenter.displayName = "PileCenter";
