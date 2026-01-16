/**
 * Device detection utilities for performance optimization
 */

export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const isSmallScreen = window.innerWidth < 768;
  const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
  const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
  
  return hasTouch && (isSmallScreen || isMobileUA);
}

