"use client";

import { useState, useEffect, useMemo } from 'react';
import { getTranslations, type Language, type Translations } from '../i18n/translations';
import { LanguageManager } from '../lib/languageManager';

/**
 * Hook to access translations
 * 
 * Returns translations for the current language and provides language switching functionality.
 */
export function useTranslations(): Translations & { 
  currentLanguage: Language; 
  setLanguage: (lang: Language) => void; 
  toggleLanguage: () => Language;
} {
  const [currentLanguage, setCurrentLanguage] = useState<Language>(() => {
    if (typeof window === 'undefined') return 'es';
    return LanguageManager.getLanguage();
  });

  // Listen for language changes
  useEffect(() => {
    const unsubscribe = LanguageManager.onLanguageChange((lang) => {
      setCurrentLanguage(lang);
    });

    return unsubscribe;
  }, []);

  const translations = useMemo(() => getTranslations(currentLanguage), [currentLanguage]);

  const setLanguage = (lang: Language) => {
    LanguageManager.setLanguage(lang);
    setCurrentLanguage(lang);
  };

  const toggleLanguage = () => {
    const newLang = LanguageManager.toggleLanguage();
    setCurrentLanguage(newLang);
    return newLang;
  };

  return {
    ...translations,
    currentLanguage,
    setLanguage,
    toggleLanguage,
  };
}

