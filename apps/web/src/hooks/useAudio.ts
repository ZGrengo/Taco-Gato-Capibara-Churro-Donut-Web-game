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
  const [isUnlocked, setIsUnlocked] = useState(() => AudioManager.isUnlocked());
  const [preferences, setPreferences] = useState(() => AudioManager.getPreferences());

  // Listen for audio unlock
  useEffect(() => {
    if (isUnlocked) return;
    
    const unsubscribe = AudioManager.onUnlock(() => {
      setIsUnlocked(true);
    });
    
    return unsubscribe;
  }, [isUnlocked]);

  // Update preferences when they change (useful for UI that displays current values)
  useEffect(() => {
    const currentPrefs = AudioManager.getPreferences();
    setPreferences(currentPrefs);
  }, []);

  const playSfx = useCallback((name: SfxName, options?: SfxOptions) => {
    AudioManager.playSfx(name, options);
  }, []);

  const playMusic = useCallback((name: MusicName) => {
    AudioManager.playMusic(name);
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

  return {
    // Audio functions
    playSfx,
    playMusic,
    stopMusic,
    setSfxVolume,
    setMusicVolume,
    toggleMute,
    setMuted,
    
    // State
    isUnlocked,
    preferences,
  };
}

