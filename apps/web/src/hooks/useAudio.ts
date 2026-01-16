"use client";

import { useEffect, useCallback, useState } from 'react';
import { AudioManager, type SfxName, type MusicName, type SfxOptions } from '../lib/audioManager';

/**
 * Hook to use the AudioManager in React components
 * 
 * Provides convenient access to audio functions and unlocks audio on mount
 * if user has already interacted with the page.
 */
export function useAudio() {
  // Use default preferences for SSR to avoid hydration mismatch
  // Will be updated on client mount
  const [isUnlocked, setIsUnlocked] = useState(() => {
    if (typeof window === 'undefined') return false;
    return AudioManager.isUnlocked();
  });
  
  // Initialize with default preferences for SSR compatibility
  const [preferences, setPreferences] = useState(() => {
    if (typeof window === 'undefined') {
      return { sfxVolume: 0.56, musicVolume: 0.24, muted: true, sfxMuted: false, musicMuted: true };
    }
    return AudioManager.getPreferences();
  });
  
  // Track if component is mounted to avoid hydration mismatch
  const [isMounted, setIsMounted] = useState(false);

  // Update preferences on client mount (after hydration)
  useEffect(() => {
    setIsMounted(true);
    const currentPrefs = AudioManager.getPreferences();
    setPreferences(currentPrefs);
    setIsUnlocked(AudioManager.isUnlocked());
  }, []);

  // Listen for audio unlock
  useEffect(() => {
    if (isUnlocked || !isMounted) return;
    
    const unsubscribe = AudioManager.onUnlock(() => {
      setIsUnlocked(true);
    });
    
    return unsubscribe;
  }, [isUnlocked, isMounted]);

  const playSfx = useCallback((name: SfxName, options?: SfxOptions) => {
    AudioManager.playSfx(name, options);
  }, []);

  const playMusic = useCallback((name: MusicName, force: boolean = false) => {
    AudioManager.playMusic(name, force);
  }, []);

  const stopMusic = useCallback(() => {
    AudioManager.stopMusic();
  }, []);

  const setSfxVolume = useCallback((volume: number) => {
    AudioManager.setSfxVolume(volume);
    setPreferences(AudioManager.getPreferences());
  }, []);

  const setMusicVolume = useCallback((volume: number) => {
    AudioManager.setMusicVolume(volume);
    setPreferences(AudioManager.getPreferences());
  }, []);

  const toggleMute = useCallback(() => {
    const muted = AudioManager.toggleMute();
    setPreferences(AudioManager.getPreferences());
    return muted;
  }, []);

  const setMuted = useCallback((muted: boolean) => {
    AudioManager.setMuted(muted);
    setPreferences(AudioManager.getPreferences());
  }, []);

  const toggleSfxMute = useCallback(() => {
    const muted = AudioManager.toggleSfxMute();
    setPreferences(AudioManager.getPreferences());
    return muted;
  }, []);

  const setSfxMuted = useCallback((muted: boolean) => {
    AudioManager.setSfxMuted(muted);
    setPreferences(AudioManager.getPreferences());
  }, []);

  const toggleMusicMute = useCallback(() => {
    const muted = AudioManager.toggleMusicMute();
    setPreferences(AudioManager.getPreferences());
    return muted;
  }, []);

  const setMusicMuted = useCallback((muted: boolean) => {
    AudioManager.setMusicMuted(muted);
    setPreferences(AudioManager.getPreferences());
  }, []);

  return {
    // Audio functions
    playSfx,
    playMusic,
    stopMusic,
    setSfxVolume,
    setMusicVolume,
    toggleMute,
    setMuted,
    toggleSfxMute,
    setSfxMuted,
    toggleMusicMute,
    setMusicMuted,
    
    // State
    isUnlocked,
    preferences,
    isMounted, // Expose mounted state to avoid hydration issues
  };
}

