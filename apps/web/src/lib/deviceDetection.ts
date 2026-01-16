/**
 * Device detection utilities for performance optimization
 */

/**
 * Check if the device is mobile (touch device with small screen)
 * This is used to optimize animations for better mobile performance
 */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  // Check for touch capability
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  
  // Check screen width (mobile typically < 768px)
  const isSmallScreen = window.innerWidth < 768;
  
  // Check user agent for mobile devices
  const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
  const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
  
  // Consider it mobile if it has touch AND (small screen OR mobile UA)
  return hasTouch && (isSmallScreen || isMobileUA);
}

/**
 * Check if device has low performance (older devices)
 * This can be used to further reduce animations
 */
export function isLowPerformanceDevice(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  // Check for hardware concurrency (CPU cores)
  const cores = navigator.hardwareConcurrency || 2;
  
  // Check for device memory (if available)
  const memory = (navigator as any).deviceMemory || 4;
  
  // Consider low performance if: < 4 cores OR < 4GB RAM
  return cores < 4 || memory < 4;
}

