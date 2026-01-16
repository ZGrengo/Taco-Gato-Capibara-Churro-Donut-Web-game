"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { isMobileDevice } from "../lib/deviceDetection";

interface FlyingCard {
  id: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  kind: "BACK" | "FRONT";
  frontSrc?: string;
  backSrc: string;
}

interface FlyingCardLayerProps {
  flyingCards: FlyingCard[];
  onCardComplete: (id: string) => void;
  onImpact?: (cardId: string) => void; // Pass cardId to identify which card landed
}

export function FlyingCardLayer({
  flyingCards,
  onCardComplete,
  onImpact,
}: FlyingCardLayerProps) {
  // Check for reduced motion preference
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Check if device is mobile for performance optimization
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    setIsMobile(isMobileDevice());
  }, []);

  // Limit to max 3 flying cards (reduce to 2 on mobile for better performance)
  const maxCards = isMobile ? 2 : 3;
  const limitedCards = flyingCards.slice(0, maxCards);

  return (
    <div
      className="fixed inset-0 pointer-events-none z-50"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        pointerEvents: "none",
      }}
    >
      <AnimatePresence>
        {limitedCards.map((card) => {
          const distance = Math.sqrt(
            Math.pow(card.to.x - card.from.x, 2) +
              Math.pow(card.to.y - card.from.y, 2)
          );
          // Shorter duration on mobile for snappier feel
          const baseDuration = isMobile ? 0.3 : 0.4;
          const maxDuration = isMobile ? 0.6 : 0.8;
          const duration = Math.min(maxDuration, Math.max(baseDuration, distance / (isMobile ? 1000 : 800)));
          const randomRotate = (Math.random() - 0.5) * 15; // Random rotation between -7.5 and 7.5 degrees

          // On mobile: simplify animations (no scale, no rotate, simpler opacity)
          // On desktop: full animation with scale and rotate
          const useSimpleAnimation = prefersReducedMotion || isMobile;

          return (
            <motion.div
              key={card.id}
              className="absolute"
              style={{
                width: "224px", // w-56
                height: "288px", // h-72
                x: card.from.x - 112, // Center the card
                y: card.from.y - 144,
                willChange: useSimpleAnimation ? 'transform, opacity' : 'transform',
                transform: 'translateZ(0)', // Force GPU acceleration
              }}
              initial={
                useSimpleAnimation
                  ? { opacity: 0 }
                  : {
                      x: card.from.x - 112,
                      y: card.from.y - 144,
                      scale: 0.8,
                      rotate: randomRotate,
                      opacity: 1,
                    }
              }
              animate={
                useSimpleAnimation
                  ? {
                      x: card.to.x - 112,
                      y: card.to.y - 144,
                      opacity: 1,
                    }
                  : {
                      x: card.to.x - 112,
                      y: card.to.y - 144,
                      scale: 1,
                      rotate: randomRotate * 0.5, // Reduce rotation as it flies
                      opacity: [1, 1, 0.9],
                    }
              }
              exit={{ opacity: 0 }}
              transition={{
                duration: prefersReducedMotion ? 0.2 : duration,
                // Use simpler easing on mobile (linear or easeOut) for better performance
                ease: useSimpleAnimation ? "easeOut" : "easeInOut",
              }}
              onAnimationComplete={() => {
                // Trigger impact callback first (when card lands)
                if (onImpact) {
                  onImpact(card.id);
                }
                // Then mark card as complete
                onCardComplete(card.id);
              }}
            >
              <div className="w-full h-full rounded-xl shadow-2xl border-4 border-gray-300 dark:border-gray-600 overflow-hidden relative">
                {card.kind === "BACK" ? (
                  <Image
                    src={card.backSrc}
                    alt="Flying card back"
                    fill
                    className="object-cover"
                    draggable={false}
                    unoptimized
                  />
                ) : (
                  card.frontSrc && (
                    <Image
                      src={card.frontSrc}
                      alt="Flying card"
                      fill
                      className="object-cover"
                      draggable={false}
                      unoptimized
                    />
                  )
                )}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

