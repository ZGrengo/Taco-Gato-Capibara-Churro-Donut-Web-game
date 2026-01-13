"use client";

import { ReactNode } from "react";

interface GestureOverlayProps {
  children: ReactNode;
}

/**
 * GestureOverlay - Container for gesture components (Bubbles, Circle)
 * Renders as an absolute overlay within the game area frame
 * Must be used inside a container with position: relative and overflow: hidden
 */
export function GestureOverlay({ children }: GestureOverlayProps) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-3 pointer-events-none">
      <div className="w-full max-w-md pointer-events-auto">
        {children}
      </div>
    </div>
  );
}

