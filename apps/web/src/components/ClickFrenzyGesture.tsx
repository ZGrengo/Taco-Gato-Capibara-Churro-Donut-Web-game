"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useAudio } from "../hooks/useAudio";

interface ClickFrenzyGestureProps {
  claimId: string;
  closesAt: number;
  requiredClicks: number;
  minIntervalMs: number;
  onComplete: () => void;
}

export function ClickFrenzyGesture({
  claimId,
  closesAt,
  requiredClicks,
  minIntervalMs,
  onComplete,
}: ClickFrenzyGestureProps) {
  const [clicksCount, setClicksCount] = useState(0);
  const [lastClickAt, setLastClickAt] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const { playSfx } = useAudio();
  
  // Throttle for SFX (separate from click throttle)
  const lastSfxAtRef = useRef<number>(0);
  const SFX_MIN_INTERVAL_MS = 50; // Throttle SFX to prevent spam
  
  // Track previous claimId to reset on change
  const prevClaimIdRef = useRef<string>(claimId);

  // Reset when claimId changes
  useEffect(() => {
    if (claimId !== prevClaimIdRef.current) {
      setClicksCount(0);
      setLastClickAt(0);
      setIsComplete(false);
      lastSfxAtRef.current = 0; // Reset SFX throttle
      prevClaimIdRef.current = claimId;
    }
  }, [claimId]);

  // Update current time every 50ms for countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 50);
    return () => clearInterval(interval);
  }, []);

  // Check if expired
  const isExpired = currentTime >= closesAt;

  // Auto-complete if time expires and not already complete
  useEffect(() => {
    if (isExpired && !isComplete) {
      // Time expired, disable interaction
    }
  }, [isExpired, isComplete]);

  // Handle click
  const handleClick = () => {
    if (isComplete || isExpired) return;

    const now = Date.now();

    // Check minimum interval for valid clicks (game rule, not SFX throttle)
    if (now - lastClickAt >= minIntervalMs) {
      const newCount = clicksCount + 1;
      
      // Play sound effect with progressive pitch (only if SFX throttle allows)
      // Use newCount (after increment) for pitch calculation
      if (now - lastSfxAtRef.current >= SFX_MIN_INTERVAL_MS) {
        const step = requiredClicks > 1 ? (newCount - 1) / (requiredClicks - 1) : 0; // 0..1 (0-based: 0, 1/9, 2/9, ..., 9/9)
        const baseRate = 0.95 + step * 0.60; // 0.95..1.55 (doubled: was 0.30, now 0.60)
        const rate = Math.max(0.72, Math.min(1.55, baseRate));
        
        // Debug log
        console.log(`[ClickFrenzy] Click ${newCount}/${requiredClicks}: step=${step.toFixed(2)}, rate=${rate.toFixed(3)}`);
        
        // Only play if this click counts (valid interval passed)
        playSfx('special_click', { rate, volume: 0.55 });
        lastSfxAtRef.current = now;
      }

      // Update state
      setClicksCount(newCount);
      setLastClickAt(now);

      // Check if completed
      if (newCount >= requiredClicks) {
        setIsComplete(true);
        onComplete();
      }
    }
    // Note: If click doesn't pass minIntervalMs check, no sound is played (silence)
  };

  const progress = Math.min(clicksCount / requiredClicks, 1);
  const timeLeft = Math.max(0, closesAt - currentTime);
  const timeLeftSeconds = (timeLeft / 1000).toFixed(1);

  return (
    <div className="w-full h-full flex flex-col">
      {/* Compact header for inline mode */}
      <div className="absolute top-2 left-2 right-2 z-20 flex items-center justify-between bg-white/90 dark:bg-gray-800/90 rounded-lg px-3 py-2 shadow-lg">
        <div className="text-center flex-1">
          <div className="text-lg font-bold text-red-600 dark:text-red-400">
            {timeLeftSeconds}s
          </div>
        </div>
        <div className="flex-1 text-center">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {clicksCount} / {requiredClicks}
          </span>
        </div>
        {isComplete && (
          <div className="flex-1 text-center">
            <span className="text-xs font-bold text-green-600 dark:text-green-400">
              ✓ Completado!
            </span>
          </div>
        )}
      </div>

      {/* Progress bar at bottom */}
      <div className="absolute bottom-2 left-2 right-2 z-20">
        <div className="w-full bg-gray-200/90 dark:bg-gray-700/90 rounded-full h-2 overflow-hidden">
          <motion.div
            className="bg-red-500 h-full"
            initial={{ width: 0 }}
            animate={{ width: `${progress * 100}%` }}
            transition={{ duration: 0.2 }}
          />
        </div>
      </div>

      {/* Clickable area - covers entire pile */}
      <div
        onClick={handleClick}
        className={`
          absolute inset-0 rounded-xl flex items-center justify-center
          transition-all cursor-pointer select-none
          ${
            isComplete
              ? "bg-green-500/20 border-4 border-green-500 dark:border-green-400"
              : isExpired
                ? "bg-gray-500/20 border-4 border-gray-400 dark:border-gray-500 cursor-not-allowed"
                : "bg-red-500/20 border-4 border-red-500 dark:border-red-400 hover:bg-red-500/30 active:scale-95"
          }
        `}
      >
        {isComplete ? (
          <div className="text-center">
            <div className="text-4xl mb-2">🎯</div>
            <div className="text-lg font-bold text-green-700 dark:text-green-300">
              ¡Completado!
            </div>
          </div>
        ) : isExpired ? (
          <div className="text-center">
            <div className="text-4xl mb-2">⏱️</div>
            <div className="text-lg font-bold text-gray-600 dark:text-gray-400">
              Tiempo agotado
            </div>
          </div>
        ) : (
          <div className="text-center">
            <div className="text-5xl mb-2">👆</div>
            <div className="text-lg font-bold text-red-700 dark:text-red-300">
              ¡Haz click aquí!
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {requiredClicks - clicksCount} clicks restantes
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

