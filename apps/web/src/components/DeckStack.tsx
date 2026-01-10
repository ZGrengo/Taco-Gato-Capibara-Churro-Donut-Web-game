"use client";

import { forwardRef } from "react";
import { motion } from "framer-motion";

interface DeckStackProps {
  count: number;
  backSrc: string;
}

export const DeckStack = forwardRef<HTMLDivElement, DeckStackProps>(
  ({ count, backSrc }, ref) => {
    // Render 4-6 card backs in a stack (not all cards)
    const stackLayers = Math.min(6, Math.max(4, Math.min(count, 6)));

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

    return (
      <div
        ref={ref}
        className="relative w-56 h-72"
        style={{ position: "relative" }}
      >
        {/* Stack of card backs */}
        {Array.from({ length: stackLayers }).map((_, index) => {
          const translateX = index * 2;
          const translateY = index * 2;
          const zIndex = stackLayers - index;
          const opacity = 1 - index * 0.05;

          return (
            <motion.div
              key={index}
              className="absolute rounded-xl shadow-lg border-4 border-gray-300 dark:border-gray-600 overflow-hidden"
              style={{
                width: "100%",
                height: "100%",
                transform: `translate(${translateX}px, ${translateY}px)`,
                zIndex,
                opacity,
              }}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity }}
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
        >
          {count}
        </motion.div>
      </div>
    );
  }
);

DeckStack.displayName = "DeckStack";

