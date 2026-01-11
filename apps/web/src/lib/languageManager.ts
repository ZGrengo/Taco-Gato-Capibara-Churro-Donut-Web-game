/**
 * Language Manager - Manages language preferences
 * 
 * Handles:
 * - Language selection (Spanish/English)
 * - Persisting language preference to localStorage
 */

import type { Language } from '../i18n/translations';

const STORAGE_KEY = 'taco-game-language';
const DEFAULT_LANGUAGE: Language = 'es';

/**
 * Language Manager Class
 */
class LanguageManagerClass {
  private currentLanguage: Language = DEFAULT_LANGUAGE;
  private languageCallbacks: Set<(lang: Language) => void> = new Set();

  constructor() {
    // Load language preference from localStorage on initialization
    this.loadLanguage();
  }

  /**
   * Load language preference from localStorage
   */
  private loadLanguage(): void {
    if (typeof window === 'undefined') return;
    
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = stored as Language;
        // Validate that the stored language is valid
        if (parsed === 'es' || parsed === 'en') {
          this.currentLanguage = parsed;
        }
      }
    } catch (error) {
      console.warn('[LanguageManager] Failed to load language from localStorage:', error);
      this.currentLanguage = DEFAULT_LANGUAGE;
    }
  }

  /**
   * Save language preference to localStorage
   */
  private saveLanguage(): void {
    if (typeof window === 'undefined') return;
    
    try {
      localStorage.setItem(STORAGE_KEY, this.currentLanguage);
    } catch (error) {
      console.warn('[LanguageManager] Failed to save language to localStorage:', error);
    }
  }

  /**
   * Get current language
   */
  getLanguage(): Language {
    return this.currentLanguage;
  }

  /**
   * Set language
   */
  setLanguage(lang: Language): void {
    if (lang !== 'es' && lang !== 'en') {
      console.warn('[LanguageManager] Invalid language:', lang);
      return;
    }
    
    this.currentLanguage = lang;
    this.saveLanguage();
    
    // Notify all callbacks
    this.languageCallbacks.forEach((callback) => callback(lang));
  }

  /**
   * Toggle between Spanish and English
   */
  toggleLanguage(): Language {
    const newLang: Language = this.currentLanguage === 'es' ? 'en' : 'es';
    this.setLanguage(newLang);
    return newLang;
  }

  /**
   * Register a callback to be called when language changes
   */
  onLanguageChange(callback: (lang: Language) => void): () => void {
    this.languageCallbacks.add(callback);
    return () => {
      this.languageCallbacks.delete(callback);
    };
  }
}

// Export singleton instance
export const LanguageManager = new LanguageManagerClass();

