"use client";

import { useMemo, useRef, useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { KINDS } from "@acme/shared";

interface WordTimelineProps {
  spokenWord: string | null | undefined; // Current word (what was said in last flip)
  currentWord?: string; // Next word (will be said in next flip)
  anticipationKey?: number; // Key to trigger blink when match occurs
}

export function WordTimeline({ spokenWord, currentWord, anticipationKey = 0 }: WordTimelineProps) {
  const shouldReduceMotion = useReducedMotion();
  
  // Calculate current index based on spokenWord
  // If pile is empty (spokenWord is null/undefined), start at 0 (taco)
  const currentIndex = useMemo(() => {
    if (!spokenWord) return 0;
    const index = KINDS.indexOf(spokenWord as typeof KINDS[number]);
    return index >= 0 ? index : 0;
  }, [spokenWord]);
  
  // Track previous index to detect changes
  const prevIndexRef = useRef<number>(-1);
  
  // Pulse key to trigger animation when word changes
  const [pulseKey, setPulseKey] = useState(0);
  
  // Detect when currentIndex changes and trigger pulse
  useEffect(() => {
    if (prevIndexRef.current !== -1 && prevIndexRef.current !== currentIndex) {
      // Word changed - trigger pulse animation
      setPulseKey((prev) => prev + 1);
    }
    // Update ref for next comparison
    prevIndexRef.current = currentIndex;
  }, [currentIndex]);

  // Calculate next index (the word that will be said next)
  const nextIndex = useMemo(() => {
    if (currentWord) {
      const index = KINDS.indexOf(currentWord as typeof KINDS[number]);
      if (index >= 0) return index;
    }
    return (currentIndex + 1) % KINDS.length;
  }, [currentIndex, currentWord]);

  // Get aria label for accessibility
  const ariaLabel = useMemo(() => {
    const current = KINDS[currentIndex].toUpperCase();
    const next = KINDS[nextIndex].toUpperCase();
    return `Palabra actual: ${current}. Siguiente: ${next}`;
  }, [currentIndex, nextIndex]);

  return (
    <div
      className="flex items-center justify-center gap-2 mb-4 px-4"
      role="status"
      aria-label={ariaLabel}
      aria-live="polite"
    >
      {KINDS.map((word, index) => {
        const isCurrent = index === currentIndex;
        const isNext = index === nextIndex;
        const isPast = index < currentIndex;
        const isFuture = index > nextIndex;

        // Determine styling based on position
        let className = "px-2 py-1 text-sm font-medium transition-all duration-200";
        let textColor: string;

        if (isCurrent) {
          // Current word: bold, uppercase, highlighted with glow
          className += " uppercase font-bold text-yellow-300 dark:text-yellow-400";
          textColor = "text-yellow-300 dark:text-yellow-400";
        } else if (isNext) {
          // Next word: intermediate color with underline
          className += " text-slate-300 dark:text-slate-400 underline decoration-dotted decoration-slate-400 dark:decoration-slate-500";
          textColor = "text-slate-300 dark:text-slate-400";
        } else {
          // Past/Future words: muted
          className += " text-slate-500 dark:text-slate-600 opacity-60";
          textColor = "text-slate-500 dark:text-slate-600";
        }

        return (
          <div key={word} className="flex items-center">
            {index > 0 && (
              <motion.span
                className={`text-slate-400 dark:text-slate-600 mx-1 ${
                  isCurrent || (index === currentIndex + 1) ? "opacity-100" : "opacity-40"
                }`}
                initial={{ opacity: 0.4 }}
                animate={{
                  opacity: isCurrent || (index === currentIndex + 1) ? 1 : 0.4,
                }}
                transition={{ duration: 0.2 }}
              >
                →
              </motion.span>
            )}

            <motion.span
              key={`${word}-${currentIndex}-${anticipationKey}-${isCurrent ? pulseKey : 0}`} // Key includes pulseKey to trigger pulse on word change
              className={className}
              initial={isCurrent && !shouldReduceMotion ? { scale: 1 } : false}
              animate={
                isCurrent
                  ? (() => {
                      // Determine which animation to use based on state
                      const shouldPulse = pulseKey > 0 && index === currentIndex;
                      const shouldBlink = anticipationKey > 0;
                      
                      if (shouldReduceMotion) {
                        return {
                          scale: 1,
                          textShadow: "none",
                        };
                      }
                      
                      // Priority: blink (match) > pulse (word change) > normal
                      if (shouldBlink) {
                        return {
                          scale: [1, 1.06, 1],
                          textShadow: [
                            "0 0 8px rgba(251, 191, 36, 0.6), 0 0 16px rgba(251, 191, 36, 0.4)",
                            "0 0 24px rgba(251, 191, 36, 1), 0 0 40px rgba(251, 191, 36, 0.6)",
                            "0 0 8px rgba(251, 191, 36, 0.6), 0 0 16px rgba(251, 191, 36, 0.4)",
                          ],
                        };
                      }
                      
                      if (shouldPulse) {
                        return {
                          scale: [1, 1.08, 1],
                          textShadow: [
                            "0 0 8px rgba(251, 191, 36, 0.5), 0 0 16px rgba(251, 191, 36, 0.3)",
                            "0 0 12px rgba(251, 191, 36, 0.7), 0 0 24px rgba(251, 191, 36, 0.5)",
                            "0 0 8px rgba(251, 191, 36, 0.5), 0 0 16px rgba(251, 191, 36, 0.3)",
                          ],
                        };
                      }
                      
                      // Normal state
                      return {
                        scale: 1,
                        textShadow: "0 0 8px rgba(251, 191, 36, 0.5), 0 0 16px rgba(251, 191, 36, 0.3)",
                      };
                    })()
                  : {}
              }
              transition={
                isCurrent
                  ? (() => {
                      const shouldPulse = pulseKey > 0 && index === currentIndex;
                      const shouldBlink = anticipationKey > 0;
                      
                      if (shouldReduceMotion) {
                        return {};
                      }
                      
                      if (shouldBlink) {
                        return {
                          scale: {
                            times: [0, 0.5, 1],
                            duration: 0.15,
                            ease: "easeOut",
                          },
                          textShadow: {
                            times: [0, 0.6, 0.9, 1], // 0ms, 150ms (build), 225ms (peak), 250ms (rest) - sync with anticipation
                            duration: 0.25, // Match anticipation animation duration
                            ease: "easeOut",
                          },
                        };
                      }
                      
                      if (shouldPulse) {
                        return {
                          scale: {
                            times: [0, 0.5, 1],
                            duration: 0.13, // Quick pulse: 130ms
                            ease: "easeOut",
                          },
                          textShadow: {
                            times: [0, 0.5, 1], // 0ms, 65ms (peak), 130ms (rest)
                            duration: 0.13, // Quick pulse: 130ms
                            ease: "easeOut",
                          },
                        };
                      }
                      
                      return {
                        textShadow: {
                          duration: 0.15,
                          ease: "easeOut",
                        },
                      };
                    })()
                  : { duration: 0.2 }
              }
            >
              {word.toUpperCase()}
            </motion.span>
          </div>
        );
      })}
    </div>
  );
}

