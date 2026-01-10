"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import { computeThrowRate, lerp } from '../lib/throwRateCalculator';

/**
 * Hook to manage progressive throw rate (pitch) for card_throw sound effect
 * 
 * Features:
 * - Smooth interpolation (lerp) to avoid sudden jumps
 * - Tracks turn streak that increases with flips
 * - Resets streak when claim opens or pile empties
 */
export function useThrowRate(pileCount: number, claimId: string | null | undefined) {
  const [currentRate, setCurrentRate] = useState(1.0);
  const turnStreakRef = useRef<number>(0);
  const prevPileCountRef = useRef<number>(pileCount);
  const prevClaimIdRef = useRef<string | null | undefined>(claimId);
  const animationFrameRef = useRef<number | null>(null);
  const targetRateRef = useRef<number>(1.0);

  // Reset turn streak when claim opens (new claimId) or pile empties
  useEffect(() => {
    const claimChanged = claimId !== prevClaimIdRef.current && claimId !== null;
    const pileEmptied = prevPileCountRef.current > 0 && pileCount === 0;

    if (claimChanged || pileEmptied) {
      turnStreakRef.current = 0;
    }

    prevClaimIdRef.current = claimId;
  }, [claimId, pileCount]);

  // Update turn streak and recalculate rate when pile count changes
  useEffect(() => {
    // Cancel any pending animation frame
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Update turn streak
    if (pileCount > prevPileCountRef.current) {
      // Flip occurred - increase turn streak
      turnStreakRef.current += 1;
    } else if (pileCount < prevPileCountRef.current) {
      // Pile decreased (claim resolved) - reset streak
      turnStreakRef.current = 0;
    }

    prevPileCountRef.current = pileCount;

    // Calculate target rate with updated turn streak
    const targetRate = computeThrowRate(pileCount, turnStreakRef.current);
    targetRateRef.current = targetRate;

    // Smooth interpolation using requestAnimationFrame
    const updateRate = () => {
      setCurrentRate((prev) => {
        const currentTarget = targetRateRef.current;
        const newRate = lerp(prev, currentTarget, 0.25); // Alpha 0.25 for smooth transition
        
        // Continue animation if difference is significant (>0.001)
        if (Math.abs(newRate - currentTarget) > 0.001) {
          animationFrameRef.current = requestAnimationFrame(updateRate);
        } else {
          // Close enough, set to exact target and stop animation
          animationFrameRef.current = null;
          return currentTarget;
        }
        
        return newRate;
      });
    };

    // Start animation
    updateRate();

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [pileCount]);

  // Get current rate (used for playing sound)
  const getCurrentRate = useCallback(() => {
    return currentRate;
  }, [currentRate]);

  // Get current turn streak (for debugging)
  const getTurnStreak = useCallback(() => {
    return turnStreakRef.current;
  }, []);

  // Manually update rate (useful for immediate updates)
  const updateRateImmediately = useCallback(() => {
    const targetRate = computeThrowRate(pileCount, turnStreakRef.current);
    targetRateRef.current = targetRate;
    setCurrentRate(targetRate);
  }, [pileCount]);

  return {
    currentRate,
    getCurrentRate,
    getTurnStreak,
    updateRateImmediately,
  };
}

