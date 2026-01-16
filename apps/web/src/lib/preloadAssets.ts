/**
 * Asset preloading utility for critical card images
 * Preloads essential images to improve first-time load experience
 */

// Track preloaded images to avoid duplicates
const preloadedImages = new Set<string>();

/**
 * Normalize asset source path
 * Ensures consistent path format for preloading
 */
export function normalizeAssetSrc(src: string): string {
  // Remove leading slash if present, then add it back for consistency
  const normalized = src.startsWith('/') ? src : `/${src}`;
  return normalized;
}

/**
 * Preload a single image
 * Returns a promise that resolves when the image is loaded or fails
 */
export function preloadImage(src: string): Promise<void> {
  // Only run in browser
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }

  const normalizedSrc = normalizeAssetSrc(src);

  // Skip if already preloaded
  if (preloadedImages.has(normalizedSrc)) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const img = new window.Image();
    
    img.onload = () => {
      preloadedImages.add(normalizedSrc);
      resolve();
    };
    
    img.onerror = () => {
      // Still mark as attempted to avoid retries
      preloadedImages.add(normalizedSrc);
      resolve(); // Resolve anyway - best effort
    };
    
    img.src = normalizedSrc;
  });
}

/**
 * Preload critical card assets
 * Preloads:
 * - Card back image
 * - One representative image per KIND (taco, gato, capibara, churro, donut)
 * - One image for each special type (SPECIAL_1, SPECIAL_2, SPECIAL_3)
 */
export async function preloadCriticalCardAssets(): Promise<void> {
  // Only run in browser
  if (typeof window === 'undefined') {
    return;
  }

  const preloadPromises: Promise<void>[] = [];

  // Preload card back
  preloadPromises.push(preloadImage('/assets/card-back.webp'));

  // Preload one representative image per KIND
  // Using style1 as default/fallback for each kind
  const kinds = ['taco', 'gato', 'capibara', 'churro', 'donut'];
  kinds.forEach((kind) => {
    preloadPromises.push(preloadImage(`/assets/${kind}/style1.webp`));
  });

  // Preload special card images
  const specialTypes = ['special_1', 'special_2', 'special_3'];
  specialTypes.forEach((specialType) => {
    preloadPromises.push(preloadImage(`/assets/specials/${specialType}.webp`));
  });

  // Wait for all preloads (best effort - continue even if some fail)
  await Promise.allSettled(preloadPromises);
}

