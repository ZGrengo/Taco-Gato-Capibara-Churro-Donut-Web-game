"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAudio } from "../hooks/useAudio";
import { useTranslations } from "../hooks/useTranslations";

interface Bubble {
  id: string;
  x: number; // Percentage (0-100)
  y: number; // Percentage (0-100)
  popped: boolean;
}

interface BubblesGestureProps {
  claimId: string;
  closesAt: number;
  bubbleCount: number;
  minDistancePx: number;
  bubbleSizePx: number;
  onComplete: () => void;
}

/**
 * Simple hash function for claimId to generate seed
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Simple pseudo-random generator (Mulberry32)
 */
function createPRNG(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates bubble positions deterministically based on claimId
 */
function generateBubblePositions(
  claimId: string,
  count: number,
  minDistance: number,
  bubbleSize: number,
  containerWidth: number,
  containerHeight: number
): Array<{ x: number; y: number }> {
  const seed = hashString(claimId);
  const random = createPRNG(seed);

  const positions: Array<{ x: number; y: number }> = [];
  const attemptsPerBubble = 50; // Max attempts to place each bubble

  for (let i = 0; i < count; i++) {
    let attempts = 0;
    let position: { x: number; y: number } | null = null;

    while (attempts < attemptsPerBubble && !position) {
      // Generate position (leave margin for bubble size)
      const margin = bubbleSize / 2;
      const x = margin + random() * (containerWidth - bubbleSize - margin * 2);
      const y = margin + random() * (containerHeight - bubbleSize - margin * 2);

      // Check distance from existing bubbles
      let valid = true;
      for (const existing of positions) {
        const dx = x - existing.x;
        const dy = y - existing.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < minDistance) {
          valid = false;
          break;
        }
      }

      if (valid) {
        position = { x, y };
        positions.push(position);
      }

      attempts++;
    }

    // If we couldn't place it after attempts, place it anyway (better than missing bubble)
    if (!position) {
      const fallbackMargin = bubbleSize / 2;
      positions.push({
        x: fallbackMargin + random() * (containerWidth - bubbleSize - fallbackMargin * 2),
        y: fallbackMargin + random() * (containerHeight - bubbleSize - fallbackMargin * 2),
      });
    }
  }

  return positions;
}

export function BubblesGesture({
  claimId,
  closesAt,
  bubbleCount,
  minDistancePx,
  bubbleSizePx,
  onComplete,
}: BubblesGestureProps) {
  const t = useTranslations();
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [containerSize, setContainerSize] = useState({ width: 400, height: 300 });
  const containerRef = useRef<HTMLDivElement>(null);
  const { playSfx } = useAudio();
  
  // Track popped count for progressive pitch (reset when claimId changes)
  const poppedCountRef = useRef<number>(0);
  const prevClaimIdRef = useRef<string>(claimId);

  // Update current time every 50ms for countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 50);
    return () => clearInterval(interval);
  }, []);

  // Get container size
  useEffect(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setContainerSize({ width: rect.width, height: rect.height });
    }
  }, []);

  // Generate bubbles deterministically based on claimId
  const bubblePositions = useMemo(() => {
    if (containerSize.width === 0 || containerSize.height === 0) return [];
    return generateBubblePositions(
      claimId,
      bubbleCount,
      minDistancePx,
      bubbleSizePx,
      containerSize.width,
      containerSize.height
    );
  }, [claimId, bubbleCount, minDistancePx, bubbleSizePx, containerSize.width, containerSize.height]);

  // Initialize bubbles when positions are ready
  useEffect(() => {
    if (bubblePositions.length > 0 && bubbles.length === 0) {
      setBubbles(
        bubblePositions.map((pos, index) => ({
          id: `${claimId}-${index}`,
          x: (pos.x / containerSize.width) * 100, // Convert to percentage
          y: (pos.y / containerSize.height) * 100,
          popped: false,
        }))
      );
      // Reset popped count when bubbles are initialized (new gesture)
      poppedCountRef.current = 0;
    }
  }, [bubblePositions, claimId, containerSize, bubbles.length]);

  // Reset when claimId changes
  useEffect(() => {
    if (claimId !== prevClaimIdRef.current) {
      setBubbles([]);
      poppedCountRef.current = 0; // Reset popped count when claim changes
      prevClaimIdRef.current = claimId;
    }
  }, [claimId]);

  // Check if expired
  const isExpired = currentTime >= closesAt;
  const timeLeft = Math.max(0, closesAt - currentTime);
  const timeLeftSeconds = (timeLeft / 1000).toFixed(1);

  // Check if all bubbles are popped
  const poppedCount = bubbles.filter((b) => b.popped).length;
  const allPopped = bubbles.length > 0 && poppedCount === bubbles.length;

  // Auto-complete when all bubbles are popped
  useEffect(() => {
    if (allPopped && !isExpired) {
      onComplete();
    }
  }, [allPopped, isExpired, onComplete]);

  // Handle bubble pop
  const handleBubblePop = (bubbleId: string) => {
    if (isExpired) return;

    // Find bubble to pop (must exist and not already popped)
    const bubbleToPop = bubbles.find((b) => b.id === bubbleId && !b.popped);
    if (!bubbleToPop) return; // Already popped or doesn't exist

    // Calculate progressive pitch based on current popped count (BEFORE incrementing)
    const totalBubbles = bubbles.length;
    const currentPoppedCount = poppedCountRef.current;
    const step = totalBubbles > 1 ? currentPoppedCount / (totalBubbles - 1) : 0; // 0..1
    const baseRate = 0.95 + step * 0.40; // 0.95..1.35 (doubled: was 0.20, now 0.40)
    const jitter = (Math.random() - 0.5) * 0.02; // -0.01 to +0.01
    const rate = Math.max(0.72, Math.min(1.35, baseRate + jitter));

    // Debug log
    console.log(`[Bubbles] Pop ${currentPoppedCount + 1}/${totalBubbles}: step=${step.toFixed(2)}, rate=${rate.toFixed(3)}`);

    // Play sound effect with progressive pitch (only once per bubble pop)
    playSfx('special_bubble', { rate, volume: 0.7 });

    // Increment popped count AFTER calculating pitch
    poppedCountRef.current += 1;

    // Update bubble state
    setBubbles((prev) =>
      prev.map((bubble) => (bubble.id === bubbleId ? { ...bubble, popped: true } : bubble))
    );
  };

  return (
    <div className="w-full">
      <div className="text-center mb-4">
        <div className="text-3xl font-bold text-blue-600 dark:text-blue-400 mb-2">
          {timeLeftSeconds}s
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Tiempo restante
        </div>
      </div>

      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {t.gestures.bubbles.bubbles}: {poppedCount} / {bubbles.length}
          </span>
          {allPopped && !isExpired && (
            <span className="text-sm font-bold text-green-600 dark:text-green-400">
              ✓ {t.gestures.bubbles.completed}
            </span>
          )}
        </div>
        {/* Progress bar */}
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
          <motion.div
            className="bg-blue-500 h-full"
            initial={{ width: 0 }}
            animate={{ width: `${(poppedCount / bubbles.length) * 100}%` }}
            transition={{ duration: 0.2 }}
          />
        </div>
      </div>

      {/* Bubbles container */}
      <div
        ref={containerRef}
        className="relative w-full h-64 bg-blue-50 dark:bg-blue-900/20 rounded-xl border-2 border-blue-300 dark:border-blue-700 overflow-hidden"
        style={{ minHeight: "256px" }}
      >
        <AnimatePresence>
          {bubbles.map((bubble) => {
            if (bubble.popped) return null;

            return (
              <motion.div
                key={bubble.id}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 1.5, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute cursor-pointer select-none"
                style={{
                  left: `${bubble.x}%`,
                  top: `${bubble.y}%`,
                  transform: "translate(-50%, -50%)",
                  width: `${bubbleSizePx}px`,
                  height: `${bubbleSizePx}px`,
                }}
                onClick={() => handleBubblePop(bubble.id)}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
              >
                <div className="w-full h-full rounded-full bg-blue-400 dark:bg-blue-500 border-4 border-blue-600 dark:border-blue-400 shadow-lg flex items-center justify-center">
                  <span className="text-2xl">🫧</span>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {isExpired && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-xl">
            <div className="text-center">
              <div className="text-4xl mb-2">⏱️</div>
              <div className="text-lg font-bold text-gray-700 dark:text-gray-300">
                {t.gestures.bubbles.timeUp}
              </div>
            </div>
          </div>
        )}

        {allPopped && !isExpired && (
          <div className="absolute inset-0 flex items-center justify-center bg-green-500/20 rounded-xl">
            <div className="text-center">
              <div className="text-4xl mb-2">🎯</div>
              <div className="text-lg font-bold text-green-700 dark:text-green-300">
                {t.gestures.bubbles.completed}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

