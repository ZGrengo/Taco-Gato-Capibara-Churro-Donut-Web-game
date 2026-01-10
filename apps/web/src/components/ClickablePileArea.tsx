"use client";

import { useState, useCallback, ReactNode } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

interface Tap {
  id: string;
  x: number;
  y: number;
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
  const shouldReduceMotion = useReducedMotion();

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      setIsPressed(true);

      // Calculate tap position relative to the container
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Add tap ring
      const tapId = `tap-${Date.now()}-${Math.random()}`;
      setTaps((prev) => [...prev, { id: tapId, x, y }]);

      // Remove tap after animation completes
      setTimeout(() => {
        setTaps((prev) => prev.filter((tap) => tap.id !== tapId));
      }, 300);
    },
    []
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
      onClick={onClick}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerLeave={handlePointerLeave}
      className={`relative select-none ${cursorClass}`}
      style={{ touchAction: "manipulation" }}
    >
      {children}

      {/* Tap rings */}
      <AnimatePresence>
        {taps.map((tap) => (
          <motion.div
            key={tap.id}
            className="absolute pointer-events-none rounded-full"
            style={{
              left: tap.x,
              top: tap.y,
              transform: "translate(-50%, -50%)",
              width: "80px",
              height: "80px",
              zIndex: 1000,
              border: "2px solid rgba(147, 197, 253, 0.4)", // light blue with low opacity
              boxShadow: "0 0 0 1px rgba(147, 197, 253, 0.2)",
            }}
            initial={{
              scale: 0.2,
              opacity: shouldReduceMotion ? 0.2 : 0.4,
            }}
            animate={{
              scale: shouldReduceMotion ? 0.5 : 1.4,
              opacity: 0,
            }}
            exit={{
              opacity: 0,
            }}
            transition={{
              duration: shouldReduceMotion ? 0.15 : 0.3,
              ease: "easeOut",
            }}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

