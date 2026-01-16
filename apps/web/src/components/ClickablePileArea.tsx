"use client";

import { useState, useCallback, useRef, ReactNode } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

interface Tap {
  id: string;
  x: number; // Relative to container
  y: number; // Relative to container
}

interface ClickablePileAreaProps {
  onClick: (e: React.MouseEvent) => void;
  isAttemptingClaim?: boolean;
  hasGesture?: boolean;
  children: ReactNode;
}

export function ClickablePileArea({
  onClick,
  isAttemptingClaim = false,
  hasGesture = false,
  children,
}: ClickablePileAreaProps) {
  const [isPressed, setIsPressed] = useState(false);
  const [taps, setTaps] = useState<Tap[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastTapRef = useRef<{ id: string; x: number; y: number; time: number } | null>(null);
  const shouldReduceMotion = useReducedMotion();
  
  // Helper to create tap ring
  const addTapRing = useCallback((x: number, y: number, source: 'pointer' | 'click' = 'pointer') => {
    const now = Date.now();
    
    // Prevent duplicates within 150ms at same position
    if (
      lastTapRef.current &&
      Math.abs(lastTapRef.current.x - x) < 10 &&
      Math.abs(lastTapRef.current.y - y) < 10 &&
      now - lastTapRef.current.time < 150
    ) {
      return;
    }
    
    const tapId = `${source}-${now}-${Math.random()}`;
    lastTapRef.current = { id: tapId, x, y, time: now };
    
    // Store relative coordinates (x, y are already relative to container)
    setTaps((prev) => [...prev, { id: tapId, x, y }]);

    // Remove tap after animation completes
    setTimeout(() => {
      setTaps((prev) => prev.filter((tap) => tap.id !== tapId));
      if (lastTapRef.current?.id === tapId) {
        lastTapRef.current = null;
      }
    }, 400);
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Only handle primary pointer (left mouse button or touch)
      if (e.pointerType === "mouse" && e.button !== 0) return;
      
      setIsPressed(true);

      // Use the container ref for consistent coordinate calculation
      // This ensures we always use the same element for position reference
      const container = containerRef.current;
      if (!container) return;
      
      const rect = container.getBoundingClientRect();
      
      // Calculate position relative to the container's bounding box
      // getBoundingClientRect() accounts for all transforms and positioning
      // Apply offset to compensate for cursor hotspot visual position
      const x = e.clientX - rect.left - 50;
      const y = e.clientY - rect.top - 50;

      // Always show tap feedback immediately with relative coordinates
      addTapRing(x, y, 'pointer');
    },
    [addTapRing]
  );
  
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      // Use the container ref for consistent coordinate calculation
      const container = containerRef.current;
      if (!container) {
        onClick(e);
        return;
      }
      
      const rect = container.getBoundingClientRect();
      
      // Calculate position relative to the container's bounding box
      // getBoundingClientRect() accounts for all transforms and positioning
      // Apply offset to compensate for cursor hotspot visual position
      const x = e.clientX - rect.left - 50;
      const y = e.clientY - rect.top - 50;
      
      addTapRing(x, y, 'click');
      
      // Call original onClick handler
      onClick(e);
    },
    [onClick, addTapRing]
  );

  const handlePointerUp = useCallback(() => {
    setIsPressed(false);
  }, []);

  const handlePointerCancel = useCallback(() => {
    setIsPressed(false);
  }, []);

  const handlePointerLeave = useCallback(() => {
    setIsPressed(false);
  }, []);

  // Determine cursor class
  const cursorClass =
    isAttemptingClaim && hasGesture
      ? "cursor-default"
      : isPressed
      ? "cursor-hand-closed"
      : "cursor-hand-open";

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerLeave={handlePointerLeave}
      className={`relative select-none ${cursorClass}`}
      style={{ 
        touchAction: "manipulation", 
        position: "relative", 
        overflow: "visible",
      }}
    >
      {children}

      {/* Tap rings - positioned absolutely within container using relative coordinates */}
      <div 
        className="absolute inset-0 pointer-events-none overflow-visible"
        style={{ 
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 99999,
          overflow: "visible",
        }}
      >
        <AnimatePresence>
          {taps.map((tap) => (
            <motion.div
              key={tap.id}
              className="absolute rounded-full pointer-events-none"
              style={{
                position: "absolute",
                left: `${tap.x}px`,
                top: `${tap.y}px`,
                transform: "translate(-50%, -50%)",
                width: "100px",
                height: "100px",
                border: "3px solid rgba(147, 197, 253, 0.8)",
                boxShadow: "0 0 20px 5px rgba(147, 197, 253, 0.6), inset 0 0 10px rgba(147, 197, 253, 0.4), 0 0 0 2px rgba(255, 255, 255, 0.4)",
                backgroundColor: "rgba(147, 197, 253, 0.25)",
                zIndex: 99999,
                // Ensure the ring is positioned exactly where the click occurred
                willChange: "transform",
              }}
              initial={{
                scale: 0.2,
                opacity: shouldReduceMotion ? 0.6 : 0.8,
              }}
              animate={{
                scale: shouldReduceMotion ? 0.8 : 1.8,
                opacity: 0,
              }}
              exit={{
                opacity: 0,
                scale: 0,
              }}
              transition={{
                duration: shouldReduceMotion ? 0.2 : 0.35,
                ease: "easeOut",
              }}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
