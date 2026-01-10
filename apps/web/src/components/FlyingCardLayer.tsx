"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

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

  // Limit to max 3 flying cards
  const limitedCards = flyingCards.slice(0, 3);

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
          const duration = Math.min(0.8, Math.max(0.4, distance / 800)); // Adjust based on distance
          const randomRotate = (Math.random() - 0.5) * 15; // Random rotation between -7.5 and 7.5 degrees

          return (
            <motion.div
              key={card.id}
              className="absolute"
              style={{
                width: "224px", // w-56
                height: "288px", // h-72
                x: card.from.x - 112, // Center the card
                y: card.from.y - 144,
              }}
              initial={
                prefersReducedMotion
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
                prefersReducedMotion
                  ? { opacity: 0 }
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
                ease: "easeInOut",
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
              <div className="w-full h-full rounded-xl shadow-2xl border-4 border-gray-300 dark:border-gray-600 overflow-hidden">
                {card.kind === "BACK" ? (
                  <img
                    src={card.backSrc}
                    alt="Flying card back"
                    className="w-full h-full object-cover"
                    draggable={false}
                  />
                ) : (
                  card.frontSrc && (
                    <img
                      src={card.frontSrc}
                      alt="Flying card"
                      className="w-full h-full object-cover"
                      draggable={false}
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

