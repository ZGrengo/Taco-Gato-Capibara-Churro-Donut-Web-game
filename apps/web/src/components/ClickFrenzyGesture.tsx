"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";

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

  // Reset when claimId changes
  useEffect(() => {
    setClicksCount(0);
    setLastClickAt(0);
    setIsComplete(false);
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

    // Check minimum interval
    if (now - lastClickAt >= minIntervalMs) {
      const newCount = clicksCount + 1;
      setClicksCount(newCount);
      setLastClickAt(now);

      // Check if completed
      if (newCount >= requiredClicks) {
        setIsComplete(true);
        onComplete();
      }
    }
  };

  const progress = Math.min(clicksCount / requiredClicks, 1);
  const timeLeft = Math.max(0, closesAt - currentTime);
  const timeLeftSeconds = (timeLeft / 1000).toFixed(1);

  return (
    <div className="w-full">
      <div className="text-center mb-4">
        <div className="text-3xl font-bold text-red-600 dark:text-red-400 mb-2">
          {timeLeftSeconds}s
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Tiempo restante
        </div>
      </div>

      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Clicks: {clicksCount} / {requiredClicks}
          </span>
          {isComplete && (
            <span className="text-sm font-bold text-green-600 dark:text-green-400">
              ✓ Completado!
            </span>
          )}
        </div>
        {/* Progress bar */}
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
          <motion.div
            className="bg-red-500 h-full"
            initial={{ width: 0 }}
            animate={{ width: `${progress * 100}%` }}
            transition={{ duration: 0.2 }}
          />
        </div>
      </div>

      <div
        onClick={handleClick}
        className={`
          w-full h-48 rounded-xl border-4 border-dashed flex items-center justify-center
          transition-all cursor-pointer select-none
          ${
            isComplete
              ? "bg-green-100 dark:bg-green-900/30 border-green-500 dark:border-green-400"
              : isExpired
                ? "bg-gray-100 dark:bg-gray-700 border-gray-400 dark:border-gray-500 cursor-not-allowed"
                : "bg-red-50 dark:bg-red-900/20 border-red-500 dark:border-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 active:scale-95"
          }
        `}
      >
        {isComplete ? (
          <div className="text-center">
            <div className="text-4xl mb-2">🎯</div>
            <div className="text-lg font-bold text-green-700 dark:text-green-300">
              ¡Claim enviado!
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

