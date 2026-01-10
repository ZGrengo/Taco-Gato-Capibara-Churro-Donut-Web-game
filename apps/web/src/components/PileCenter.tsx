"use client";

import { forwardRef, ReactNode, useMemo } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import type { Card } from "@acme/shared";

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
  children: ReactNode;
}

export const PileCenter = forwardRef<HTMLDivElement, PileCenterProps>(
  ({ pileCount, topCard, backSrc, impactKey = 0, shakeKey = 0, oopsKey = 0, oopsCardCount = 0, children }, ref) => {
    const shouldReduceMotion = useReducedMotion();
    
    // Calculate visible layers (pileCount - 1 because topCard is separate)
    const visibleLayers = Math.min(Math.max(0, pileCount - 1), MAX_PILE_LAYERS);

    // Combine impact bounce and shake animations
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
      }
      
      // Always return an object, even if empty, to ensure Framer Motion detects changes
      return Object.keys(animations).length > 0 ? animations : { scale: 1, y: 0 };
    }, [impactKey, shakeKey, shouldReduceMotion]);

    const getTransitionProps = () => {
      if (shakeKey > 0) {
        return {
          duration: 0.35,
          ease: "easeOut",
        };
      }
      return {
        duration: 0.25,
        ease: "easeOut",
      };
    };

    return (
      <div ref={ref} className="relative w-full max-w-sm">
        {/* Container for stack of backs with impact/shake animations */}
        <motion.div
          animate={animateProps}
          transition={getTransitionProps()}
          className="relative"
          style={{ pointerEvents: 'none' }}
        >
          {/* Stack of card backs behind topCard */}
          <div className="relative" style={{ width: "224px", height: "288px", margin: "0 auto" }}>
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
                  😵‍💫 Oops! Te llevas {oopsCardCount} {oopsCardCount === 1 ? 'carta' : 'cartas'}
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
