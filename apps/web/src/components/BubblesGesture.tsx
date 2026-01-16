"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAudio } from "../hooks/useAudio";
import { useTranslations } from "../hooks/useTranslations";
import { isMobileDevice } from "../lib/deviceDetection";

interface Bubble {
  id: string;
  xPx: number; // Position in pixels
  yPx: number; // Position in pixels
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
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const { playSfx } = useAudio();
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    setIsMobile(isMobileDevice());
  }, []);
  
  // Track popped count for progressive pitch (reset when claimId changes)
  const poppedCountRef = useRef<number>(0);
  const prevClaimIdRef = useRef<string>(claimId);
  const prevContainerSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  const bubblesRef = useRef<Bubble[]>([]);
  const containerSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  
  // Keep refs in sync with state
  useEffect(() => {
    bubblesRef.current = bubbles;
  }, [bubbles]);
  
  useEffect(() => {
    containerSizeRef.current = containerSize;
  }, [containerSize]);

  // Update current time every 50ms for countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 50);
    return () => clearInterval(interval);
  }, []);

  // Measure container size with ResizeObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let rafId: number | null = null;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      const newSize = { width: rect.width, height: rect.height };
      
      // Only update if size actually changed (avoid unnecessary re-renders)
      const currentSize = containerSizeRef.current;
      if (newSize.width !== currentSize.width || newSize.height !== currentSize.height) {
        setContainerSize(newSize);
        containerSizeRef.current = newSize;
        prevContainerSizeRef.current = newSize;
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      // Throttle with requestAnimationFrame
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(updateSize);
    });

    resizeObserver.observe(container);
    
    // Initial measurement
    updateSize();

    return () => {
      resizeObserver.disconnect();
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, []); // Empty deps - observer should only be set up once

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
          xPx: pos.x, // Store directly in pixels
          yPx: pos.y,
          popped: false,
        }))
      );
      // Reset popped count when bubbles are initialized (new gesture)
      poppedCountRef.current = 0;
    }
  }, [bubblePositions, claimId, bubbles.length]);

  // Handle container resize: regenerate bubbles only if user hasn't started popping
  useEffect(() => {
    const currentSize = containerSizeRef.current;
    if (currentSize.width === 0 || currentSize.height === 0) return;
    
    const currentBubbles = bubblesRef.current;
    if (currentBubbles.length === 0) return; // No bubbles to regenerate
    
    const prevSize = prevContainerSizeRef.current;
    const sizeChanged = prevSize.width !== currentSize.width || prevSize.height !== currentSize.height;
    
    if (!sizeChanged) {
      prevContainerSizeRef.current = currentSize;
      return;
    }
    
    const currentPoppedCount = currentBubbles.filter(b => b.popped).length;
    const resizeThreshold = 20; // Only regenerate if resize is significant
    const significantResize = 
      Math.abs(currentSize.width - prevSize.width) > resizeThreshold ||
      Math.abs(currentSize.height - prevSize.height) > resizeThreshold;
    
    // If user has started popping, clamp existing bubbles instead of regenerating
    if (currentPoppedCount > 0) {
      setBubbles(prev => prev.map(bubble => {
        if (bubble.popped) return bubble; // Don't move popped bubbles
        
        // Clamp position to stay within bounds
        const margin = bubbleSizePx / 2;
        const clampedX = Math.max(margin, Math.min(currentSize.width - bubbleSizePx - margin, bubble.xPx));
        const clampedY = Math.max(margin, Math.min(currentSize.height - bubbleSizePx - margin, bubble.yPx));
        
        return {
          ...bubble,
          xPx: clampedX,
          yPx: clampedY,
        };
      }));
    } else if (significantResize) {
      // User hasn't started, regenerate bubbles for new size
      const newPositions = generateBubblePositions(
        claimId,
        bubbleCount,
        minDistancePx,
        bubbleSizePx,
        currentSize.width,
        currentSize.height
      );
      
      setBubbles(
        newPositions.map((pos, index) => ({
          id: `${claimId}-${index}`,
          xPx: pos.x,
          yPx: pos.y,
          popped: false,
        }))
      );
      poppedCountRef.current = 0;
    }
    
    prevContainerSizeRef.current = currentSize;
  }, [containerSize.width, containerSize.height, claimId, bubbleCount, minDistancePx, bubbleSizePx]);

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
    <div className="w-full flex flex-col items-center justify-center">
      {/* Window container with solid blue background */}
      <div className="w-full max-w-md bg-blue-600 dark:bg-blue-700 rounded-xl shadow-2xl overflow-hidden">
        {/* Title section */}
        <div className="bg-blue-700 dark:bg-blue-800 px-4 py-3 border-b border-blue-500 dark:border-blue-600">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="text-xl font-bold text-white mb-1">
                {t.gestures.bubbles.bubbles}
              </div>
              <div className="flex items-center gap-4 text-sm text-blue-100">
                <span className="font-semibold">
                  {timeLeftSeconds}s
                </span>
                <span>
                  {poppedCount} / {bubbles.length}
                </span>
                {allPopped && !isExpired && (
                  <span className="font-bold text-green-300">
                    ✓ {t.gestures.bubbles.completed}
                  </span>
                )}
              </div>
            </div>
          </div>
          {/* Progress bar */}
          <div className="mt-3 w-full bg-blue-800 dark:bg-blue-900 rounded-full h-2 overflow-hidden">
            <motion.div
              className="bg-blue-400 h-full"
              initial={{ width: 0 }}
              animate={{ width: `${(poppedCount / bubbles.length) * 100}%` }}
              transition={{ duration: 0.2 }}
            />
          </div>
        </div>

        {/* Gesture area with opacity */}
        <div className="p-4 pb-6 bg-blue-600 dark:bg-blue-700">
          <div
            ref={containerRef}
            className="relative w-full bg-blue-50 dark:bg-blue-900/20 rounded-xl border-2 border-blue-300 dark:border-blue-600 overflow-hidden"
            style={{ 
              height: "clamp(240px, 40vh, 340px)",
              width: "100%"
            }}
          >
        <AnimatePresence>
          {bubbles.map((bubble) => {
            if (bubble.popped) return null;

            // Final clamp for safety (ensure bubble is always within bounds)
            const margin = bubbleSizePx / 2;
            const clampedX = Math.max(margin, Math.min(containerSize.width - bubbleSizePx - margin, bubble.xPx));
            const clampedY = Math.max(margin, Math.min(containerSize.height - bubbleSizePx - margin, bubble.yPx));

            return (
              <motion.div
                key={bubble.id}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 1.5, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute cursor-pointer select-none"
                style={{
                  left: `${clampedX}px`,
                  top: `${clampedY}px`,
                  transform: "translate(-50%, -50%)",
                  width: `${bubbleSizePx}px`,
                  height: `${bubbleSizePx}px`,
                }}
                onClick={() => handleBubblePop(bubble.id)}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
              >
                <div className="w-full h-full rounded-full bg-blue-400 dark:bg-blue-500 border-4 border-blue-600 dark:border-blue-400 shadow-lg flex items-center justify-center">
                  {isMobile ? (
                    <span className="text-2xl">🫧</span>
                  ) : (
                    <span 
                      className="text-3xl leading-none select-none"
                      style={{ 
                        fontFamily: '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Android Emoji", "EmojiSymbols", "EmojiOne Mozilla", "Twemoji Mozilla", "Segoe UI Symbol", sans-serif',
                        display: 'inline-block',
                        lineHeight: '1',
                        WebkitFontSmoothing: 'antialiased',
                        MozOsxFontSmoothing: 'grayscale',
                      }}
                      role="img"
                      aria-label="bubble"
                    >
                      🫧
                    </span>
                  )}
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
      </div>
    </div>
  );
}

