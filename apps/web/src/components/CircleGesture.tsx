"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useAudio } from "../hooks/useAudio";

interface Point {
  x: number;
  y: number;
  t: number;
}

interface CircleGestureProps {
  claimId: string;
  closesAt: number;
  onComplete: () => void;
  minPathLen: number;
  closeDist: number;
  minRadius: number;
  maxRadiusVar: number;
  targetCenterTol: number;
  minPoints: number;
}

/**
 * Validates if the drawn path forms a valid circle
 */
function validateCircle(
  points: Point[],
  targetCenter: { x: number; y: number },
  minPathLen: number,
  closeDist: number,
  minRadius: number,
  maxRadiusVar: number,
  targetCenterTol: number,
  minPoints: number
): boolean {
  if (points.length < minPoints) {
    return false;
  }

  // Calculate path length
  let pathLength = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    pathLength += Math.sqrt(dx * dx + dy * dy);
  }

  if (pathLength < minPathLen) {
    return false;
  }

  // Check if path is closed (start and end are close)
  const start = points[0];
  const end = points[points.length - 1];
  const startEndDist = Math.sqrt(
    (end.x - start.x) ** 2 + (end.y - start.y) ** 2
  );

  if (startEndDist > closeDist) {
    return false;
  }

  // Calculate center of the drawn path (average of all points)
  const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;

  // Check if center is close to target center
  const centerDist = Math.sqrt(
    (cx - targetCenter.x) ** 2 + (cy - targetCenter.y) ** 2
  );

  if (centerDist > targetCenterTol) {
    return false;
  }

  // Calculate radii from center to each point
  const radii = points.map((p) =>
    Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2)
  );

  const meanR = radii.reduce((sum, r) => sum + r, 0) / radii.length;

  if (meanR < minRadius) {
    return false;
  }

  // Calculate standard deviation of radii
  const variance =
    radii.reduce((sum, r) => sum + (r - meanR) ** 2, 0) / radii.length;
  const stdDevR = Math.sqrt(variance);

  // Check circularity (coefficient of variation)
  const radiusVar = stdDevR / meanR;

  if (radiusVar > maxRadiusVar) {
    return false;
  }

  return true;
}

export function CircleGesture({
  claimId,
  closesAt,
  onComplete,
  minPathLen,
  closeDist,
  minRadius,
  maxRadiusVar,
  targetCenterTol,
  minPoints,
}: CircleGestureProps) {
  const t = useTranslations();
  const [points, setPoints] = useState<Point[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const containerRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLDivElement>(null);
  const { playSfx } = useAudio();
  
  // Track previous claimId to reset on change
  const prevClaimIdRef = useRef<string>(claimId);
  const hasPlayedCompletionSoundRef = useRef<boolean>(false);
  
  // Track active pointer ID for capture/release
  const activePointerIdRef = useRef<number | null>(null);

  // Reset when claimId changes
  useEffect(() => {
    if (claimId !== prevClaimIdRef.current) {
      setPoints([]);
      setIsDrawing(false);
      setIsComplete(false);
      setHasError(false);
      hasPlayedCompletionSoundRef.current = false; // Reset completion sound flag
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

  // Prevent page scroll on iOS Safari while drawing (fallback for browsers that ignore touchAction)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleTouchMove = (e: TouchEvent) => {
      // Only prevent default if actively drawing
      if (isDrawing) {
        e.preventDefault();
      }
    };

    // Use passive: false to allow preventDefault
    container.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      container.removeEventListener('touchmove', handleTouchMove);
    };
  }, [isDrawing]);

  // Check if expired
  const isExpired = currentTime >= closesAt;
  const timeLeft = Math.max(0, closesAt - currentTime);
  const timeLeftSeconds = (timeLeft / 1000).toFixed(1);

  // Get target center coordinates relative to container
  const getTargetCenter = (): { x: number; y: number } | null => {
    if (!containerRef.current || !targetRef.current) return null;

    const containerRect = containerRef.current.getBoundingClientRect();
    const targetRect = targetRef.current.getBoundingClientRect();

    return {
      x: targetRect.left + targetRect.width / 2 - containerRect.left,
      y: targetRect.top + targetRect.height / 2 - containerRect.top,
    };
  };

  // Get point coordinates relative to container using getBoundingClientRect
  const getPointFromEvent = (e: React.PointerEvent | PointerEvent): Point | null => {
    if (!containerRef.current) return null;

    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      t: Date.now(),
    };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (isComplete || isExpired) return;

    e.preventDefault();
    
    // Capture pointer to receive all pointer events, even if outside container
    const target = e.currentTarget as HTMLElement;
    try {
      target.setPointerCapture(e.pointerId);
      activePointerIdRef.current = e.pointerId;
    } catch (error) {
      // setPointerCapture may fail in some browsers, continue anyway
      console.debug('[CircleGesture] setPointerCapture failed:', error);
    }
    
    setIsDrawing(true);
    setHasError(false);
    const point = getPointFromEvent(e);
    if (point) {
      setPoints([point]);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDrawing || isComplete || isExpired) return;
    
    // Only process events from the captured pointer
    if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) {
      return;
    }

    e.preventDefault();
    const point = getPointFromEvent(e);
    if (point) {
      setPoints((prev) => [...prev, point]);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDrawing || isComplete || isExpired) return;
    
    // Only process events from the captured pointer
    if (activePointerIdRef.current !== null && e.pointerId !== activePointerIdRef.current) {
      return;
    }

    e.preventDefault();
    
    // Release pointer capture
    const target = e.currentTarget as HTMLElement;
    if (activePointerIdRef.current !== null) {
      try {
        target.releasePointerCapture(activePointerIdRef.current);
      } catch (error) {
        // releasePointerCapture may fail if pointer was already released
        console.debug('[CircleGesture] releasePointerCapture failed:', error);
      }
      activePointerIdRef.current = null;
    }
    
    setIsDrawing(false);

    const targetCenter = getTargetCenter();
    if (!targetCenter || points.length < minPoints) {
      setHasError(true);
      setPoints([]);
      return;
    }

    const isValid = validateCircle(
      points,
      targetCenter,
      minPathLen,
      closeDist,
      minRadius,
      maxRadiusVar,
      targetCenterTol,
      minPoints
    );

    if (isValid) {
      setIsComplete(true);
      
      // Play completion sound only once (when gesture completes successfully)
      if (!hasPlayedCompletionSoundRef.current) {
        // Use special_circle (file name) or special_draw (will be mapped to special_circle)
        playSfx('special_draw', { rate: 1.0, volume: 0.75 });
        hasPlayedCompletionSoundRef.current = true;
      }
      
      onComplete();
    } else {
      // On failure, do NOT play any sound (silence)
      setHasError(true);
      setPoints([]);
    }
  };

  const handlePointerCancel = (e: React.PointerEvent) => {
    // Release pointer capture on cancel (e.g., scroll interrupted)
    const target = e.currentTarget as HTMLElement;
    if (activePointerIdRef.current !== null) {
      try {
        target.releasePointerCapture(activePointerIdRef.current);
      } catch (error) {
        console.debug('[CircleGesture] releasePointerCapture on cancel failed:', error);
      }
      activePointerIdRef.current = null;
    }
    
    setIsDrawing(false);
    setHasError(true);
    setPoints([]);
  };

  // Build SVG path string from points
  const pathString =
    points.length > 1
      ? points
          .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
          .join(" ")
      : "";

  return (
    <div className="w-full">
      <div className="text-center mb-4">
        <div className="text-3xl font-bold text-purple-600 dark:text-purple-400 mb-2">
          {timeLeftSeconds}s
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Tiempo restante
        </div>
      </div>

      <div className="mb-4">
        <p className="text-center text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
          {isComplete
            ? `✓ ${t.gestures.circle.completed}`
            : hasError
              ? `${t.gestures.circle.tryAgain} - ${t.gestures.circle.drawCircleAroundCard}`
              : t.gestures.circle.drawCircleAroundCard}
        </p>
      </div>

      {/* Drawing area */}
      <div
        ref={containerRef}
        className="relative w-full h-64 bg-purple-50 dark:bg-purple-900/20 rounded-xl border-2 border-purple-300 dark:border-purple-700 overflow-hidden touch-none select-none"
        style={{ 
          minHeight: "256px",
          touchAction: "none", // Prevent default touch behaviors (scroll, zoom, etc.)
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        {/* Target area (card center) - invisible reference point */}
        <div
          ref={targetRef}
          className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-32 h-40 pointer-events-none"
          aria-hidden="true"
        />

        {/* SVG overlay for drawing */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ zIndex: 10 }}
        >
          {pathString && (
            <path
              d={pathString}
              fill="none"
              stroke={
                isComplete
                  ? "#10b981"
                  : hasError
                    ? "#ef4444"
                    : "#9333ea"
              }
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </svg>

        {isExpired && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-xl">
            <div className="text-center">
              <div className="text-4xl mb-2">⏱️</div>
              <div className="text-lg font-bold text-gray-700 dark:text-gray-300">
                {t.gestures.circle.timeUp}
              </div>
            </div>
          </div>
        )}

        {isComplete && !isExpired && (
          <div className="absolute inset-0 flex items-center justify-center bg-green-500/20 rounded-xl">
            <div className="text-center">
              <div className="text-4xl mb-2">🎯</div>
              <div className="text-lg font-bold text-green-700 dark:text-green-300">
                {t.gestures.circle.completed}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

