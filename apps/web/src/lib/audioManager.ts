/**
 * Audio Manager - Centralized audio system for the game
 * 
 * Handles:
 * - Sound effects (SFX) with pitch and volume control
 * - Background music
 * - User preferences (localStorage)
 * - Browser autoplay restrictions (requires user interaction)
 */

export type SfxName =
  | 'card_throw'      // Card flipping sound (card_throw.wav)
  | 'oops'            // False slap penalty (oops.wav)
  | 'turn_win'        // Success notification (turn_win.wav)
  | 'game_win'        // Win game (game_win.wav)
  | 'game_lose'       // Lose game (game_lose.wav)
  | 'special_bubble'  // Bubbles gesture - bubble pop (special_bubble.wav)
  | 'special_click'   // Click frenzy gesture - click tick (special_click.wav)
  | 'special_circle'  // Circle/draw gesture - completion (special_circle.wav)
  | 'special_draw';   // Alias for special_circle (backwards compatibility)

export type MusicName =
  | 'background'      // Main background music
  | 'menu'           // Menu music
  | 'thinkfast';     // In-game music (thinkfast.mp3)

interface SfxOptions {
  pitch?: number;      // Pitch variation (0.5 - 2.0, default 1.0) - also accepts "rate" for backwards compatibility
  rate?: number;       // Alternative to pitch (same as pitch, playbackRate value) - takes precedence over pitch
  volume?: number;     // Volume override (0.0 - 1.0, overrides global sfx volume)
}

interface AudioPreferences {
  sfxVolume: number;   // 0.0 - 1.0
  musicVolume: number; // 0.0 - 1.0
  muted: boolean;
}

const DEFAULT_PREFERENCES: AudioPreferences = {
  sfxVolume: 0.7,
  musicVolume: 0.3,
  muted: true, // Music muted by default
};

const STORAGE_KEY = 'taco-game-audio-prefs';

/**
 * Audio Manager Singleton
 * 
 * Manages all audio playback, preferences, and browser interaction unlocking.
 */
class AudioManagerClass {
  private audioUnlocked = false;
  private preferences: AudioPreferences = DEFAULT_PREFERENCES;
  private sfxCache: Map<SfxName, HTMLAudioElement> = new Map();
  private musicCache: Map<MusicName, HTMLAudioElement> = new Map();
  private currentMusic: HTMLAudioElement | null = null;
  private unlockCallbacks: Set<() => void> = new Set();

  constructor() {
    // Load preferences from localStorage on initialization
    this.loadPreferences();
    
    // Set up unlock listener on first user interaction
    if (typeof window !== 'undefined') {
      // Try multiple event types to ensure we catch the interaction
      const unlockEvents = ['click', 'pointerdown', 'touchstart', 'keydown'];
      const unlockHandler = () => {
        this.unlockAudio();
        // Remove listeners after first unlock
        unlockEvents.forEach((event) => {
          window.removeEventListener(event, unlockHandler, { capture: true });
        });
      };
      
      unlockEvents.forEach((event) => {
        window.addEventListener(event, unlockHandler, { capture: true, once: true });
      });
    }
  }

  /**
   * Unlock audio after user interaction (required by browsers)
   */
  private unlockAudio(): void {
    if (this.audioUnlocked) return;
    
    this.audioUnlocked = true;
    
    // Notify all callbacks that audio is unlocked
    this.unlockCallbacks.forEach((callback) => callback());
    this.unlockCallbacks.clear();
    
    // Pre-load audio files (optional, can be done lazily instead)
    // this.preloadAudio();
  }

  /**
   * Register a callback to be called when audio is unlocked
   */
  onUnlock(callback: () => void): () => void {
    if (this.audioUnlocked) {
      callback();
      return () => {}; // No-op unsubscribe
    }
    
    this.unlockCallbacks.add(callback);
    return () => {
      this.unlockCallbacks.delete(callback);
    };
  }

  /**
   * Load preferences from localStorage
   */
  private loadPreferences(): void {
    if (typeof window === 'undefined') return;
    
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<AudioPreferences>;
        this.preferences = {
          ...DEFAULT_PREFERENCES,
          ...parsed,
        };
      }
    } catch (error) {
      console.warn('[AudioManager] Failed to load preferences from localStorage:', error);
      this.preferences = DEFAULT_PREFERENCES;
    }
  }

  /**
   * Save preferences to localStorage
   */
  private savePreferences(): void {
    if (typeof window === 'undefined') return;
    
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.preferences));
    } catch (error) {
      console.warn('[AudioManager] Failed to save preferences to localStorage:', error);
    }
  }

  /**
   * Get or create an audio element for an SFX
   * Tries WAV first, falls back to MP3 if not found
   */
  private getSfxAudio(name: SfxName): HTMLAudioElement | null {
    // Map special_draw to special_circle (file naming)
    const audioFileName = name === 'special_draw' ? 'special_circle' : name;
    
    if (!this.sfxCache.has(name)) {
      // Try WAV first (preferred format)
      const wavAudio = new Audio(`/audio/sfx/${audioFileName}.wav`);
      wavAudio.preload = 'auto';
      
      let audioLoaded = false;
      
      // Listen for successful load of WAV
      wavAudio.addEventListener('canplaythrough', () => {
        if (!audioLoaded) {
          audioLoaded = true;
          this.sfxCache.set(name, wavAudio);
        }
      }, { once: true });
      
      // Handle WAV load error - fallback to MP3
      wavAudio.addEventListener('error', () => {
        if (!audioLoaded) {
          console.debug(`[AudioManager] WAV not found for ${audioFileName}, trying MP3 fallback...`);
          // Try MP3 as fallback (use audioFileName for consistency)
          const mp3Audio = new Audio(`/audio/sfx/${audioFileName}.mp3`);
          mp3Audio.preload = 'auto';
          
          mp3Audio.addEventListener('canplaythrough', () => {
            if (!audioLoaded) {
              audioLoaded = true;
              this.sfxCache.set(name, mp3Audio);
            }
          }, { once: true });
          
          mp3Audio.addEventListener('error', () => {
            if (!audioLoaded) {
              console.debug(`[AudioManager] SFX file not found: ${name}.wav or ${name}.mp3 (this is expected until audio files are added)`);
              // Cache a dummy audio element to prevent repeated attempts
              this.sfxCache.set(name, mp3Audio);
            }
          }, { once: true });
          
          // Cache MP3 immediately (will be updated if it loads successfully)
          this.sfxCache.set(name, mp3Audio);
        }
      }, { once: true });
      
      // Cache WAV immediately (optimistic caching - will be replaced by MP3 if WAV fails)
      this.sfxCache.set(name, wavAudio);
    }
    
    return this.sfxCache.get(name) || null;
  }

  /**
   * Get or create an audio element for background music
   * For thinkfast: tries MP3 directly (known format)
   * For others: tries WAV first, falls back to MP3 if not found
   */
  private getMusicAudio(name: MusicName): HTMLAudioElement | null {
    if (!this.musicCache.has(name)) {
      // Special handling for thinkfast: it's in /audio/ directly, not /audio/music/, and it's MP3
      const basePath = name === 'thinkfast' ? '/audio' : '/audio/music';
      const isThinkfast = name === 'thinkfast';
      
      // For thinkfast, try MP3 directly (we know it's MP3)
      // For others, try WAV first
      const primaryFormat = isThinkfast ? 'mp3' : 'wav';
      const fallbackFormat = isThinkfast ? 'wav' : 'mp3';
      
      const primaryAudio = new Audio(`${basePath}/${name}.${primaryFormat}`);
      primaryAudio.preload = 'auto';
      primaryAudio.loop = true; // Music typically loops
      
      let audioLoaded = false;
      
      // Listen for successful load of primary format
      primaryAudio.addEventListener('canplaythrough', () => {
        if (!audioLoaded) {
          audioLoaded = true;
          this.musicCache.set(name, primaryAudio);
        }
      }, { once: true });
      
      // Handle primary format load error - fallback to alternative format
      primaryAudio.addEventListener('error', () => {
        if (!audioLoaded) {
          console.debug(`[AudioManager] ${primaryFormat.toUpperCase()} not found for music ${name}, trying ${fallbackFormat.toUpperCase()} fallback...`);
          // Try fallback format
          const fallbackAudio = new Audio(`${basePath}/${name}.${fallbackFormat}`);
          fallbackAudio.preload = 'auto';
          fallbackAudio.loop = true;
          
          fallbackAudio.addEventListener('canplaythrough', () => {
            if (!audioLoaded) {
              audioLoaded = true;
              // Primary failed but fallback loaded successfully
              this.musicCache.set(name, fallbackAudio);
            }
          }, { once: true });
          
          fallbackAudio.addEventListener('error', () => {
            if (!audioLoaded) {
              console.debug(`[AudioManager] Music file not found: ${basePath}/${name}.${primaryFormat} or ${basePath}/${name}.${fallbackFormat} (this is expected until audio files are added)`);
              // Cache a dummy audio element to prevent repeated attempts
              this.musicCache.set(name, fallbackAudio);
            }
          }, { once: true });
          
          // Cache fallback immediately (will be updated if it loads successfully)
          this.musicCache.set(name, fallbackAudio);
        }
      }, { once: true });
      
      // Cache primary immediately (will be replaced by fallback if primary fails)
      this.musicCache.set(name, primaryAudio);
    }
    
    return this.musicCache.get(name) || null;
  }

  /**
   * Play a sound effect
   */
  playSfx(name: SfxName, options: SfxOptions = {}): void {
    // Don't play audio until user has interacted (browser restriction)
    if (!this.audioUnlocked) {
      // Try to unlock on demand (in case event listeners haven't fired yet)
      this.unlockAudio();
      // If still not unlocked, silently ignore (audio will play on next interaction)
      if (!this.audioUnlocked) {
        return;
      }
    }
    
    if (this.preferences.muted) {
      return;
    }

    const audio = this.getSfxAudio(name);
    if (!audio) return;

    try {
      // Calculate rate first
      const rate = options.rate !== undefined ? options.rate : (options.pitch !== undefined ? options.pitch : 1.0);
      const clampedRate = Math.max(0.25, Math.min(4.0, rate));
      
      // Debug log for pitch changes (can be removed later)
      if (rate !== 1.0) {
        console.log(`[AudioManager] Playing "${name}" with rate: ${clampedRate.toFixed(3)} (requested: ${rate.toFixed(3)})`);
      }
      
      // Clone the audio element to allow overlapping sounds
      // IMPORTANT: Create a new Audio instance with the same src for better playbackRate support
      // Using currentSrc (the actual source being used) for more reliable cloning
      const audioSrc = audio.currentSrc || audio.src;
      
      if (!audioSrc || audioSrc === '') {
        console.warn(`[AudioManager] Audio source is empty for "${name}", cannot play`);
        return;
      }
      
      // Create a new Audio instance (better than cloneNode for playbackRate control)
      const clone = new Audio(audioSrc);
      
      // Apply settings BEFORE load/play
      clone.volume = options.volume !== undefined 
        ? Math.max(0, Math.min(1, options.volume))
        : this.preferences.sfxVolume;
      
      // CRITICAL: Set playbackRate BEFORE load() and play()
      // Some browsers ignore playbackRate if set after load/play
      clone.playbackRate = clampedRate;
      
      // Play the cloned audio
      const playPromise = clone.play();
      
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            // Verify playbackRate was applied correctly after play
            // Some browsers reset it during play, so we check and reapply if needed
            if (Math.abs(clone.playbackRate - clampedRate) > 0.001) {
              console.warn(`[AudioManager] PlaybackRate was reset for "${name}": expected ${clampedRate.toFixed(3)}, got ${clone.playbackRate.toFixed(3)}. Re-applying...`);
              clone.playbackRate = clampedRate;
              
              // Some browsers need a second attempt after a small delay
              setTimeout(() => {
                if (Math.abs(clone.playbackRate - clampedRate) > 0.001 && !clone.paused) {
                  clone.playbackRate = clampedRate;
                }
              }, 10);
            }
          })
          .catch((error) => {
            console.debug(`[AudioManager] Failed to play SFX "${name}":`, error);
          });
      }
      
      // Clean up the clone after it finishes playing
      clone.addEventListener('ended', () => {
        clone.remove();
      }, { once: true });
      
    } catch (error) {
      console.error(`[AudioManager] Error playing SFX "${name}":`, error);
    }
  }

  /**
   * Play background music (stops current music if playing)
   * Note: This method respects the muted state, so ensure muted is false before calling
   */
  playMusic(name: MusicName, force: boolean = false): void {
    if (!this.audioUnlocked) {
      // Try to unlock on demand
      this.unlockAudio();
      // If still not unlocked, silently ignore (audio will play on next interaction)
      if (!this.audioUnlocked) {
        return;
      }
    }
    
    // Stop current music if playing
    this.stopMusic();
    
    // Check muted state (unless force is true)
    if (!force && this.preferences.muted) {
      return;
    }

    const audio = this.getMusicAudio(name);
    if (!audio) {
      return;
    }

    try {
      audio.volume = this.preferences.musicVolume;
      this.currentMusic = audio;
      
      // Ensure audio is ready before playing
      const attemptPlay = () => {
        if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
          // Audio is ready, play it
          const playPromise = audio.play();
          
          if (playPromise !== undefined) {
            playPromise
              .then(() => {
                // Music started playing successfully
              })
              .catch((error) => {
                // Autoplay was prevented or other error
                console.debug(`[AudioManager] Failed to play music "${name}":`, error);
              });
          }
        } else {
          // Audio not ready yet, wait for it
          const onCanPlay = () => {
            const playPromise = audio.play();
            if (playPromise !== undefined) {
              playPromise
                .then(() => {
                  // Music started playing successfully
                })
                .catch((error) => {
                  console.debug(`[AudioManager] Failed to play music "${name}":`, error);
                });
            }
            audio.removeEventListener('canplaythrough', onCanPlay);
          };
          audio.addEventListener('canplaythrough', onCanPlay, { once: true });
          // Also try to load it explicitly
          audio.load();
        }
      };
      
      attemptPlay();
      
    } catch (error) {
      console.debug(`[AudioManager] Error playing music "${name}":`, error);
    }
  }

  /**
   * Stop currently playing background music
   */
  stopMusic(): void {
    if (this.currentMusic) {
      try {
        this.currentMusic.pause();
        this.currentMusic.currentTime = 0;
      } catch (error) {
        console.debug('[AudioManager] Error stopping music:', error);
      }
      this.currentMusic = null;
    }
  }

  /**
   * Set SFX volume (0.0 - 1.0)
   */
  setSfxVolume(volume: number): void {
    this.preferences.sfxVolume = Math.max(0, Math.min(1, volume));
    this.savePreferences();
  }

  /**
   * Set music volume (0.0 - 1.0)
   */
  setMusicVolume(volume: number): void {
    this.preferences.musicVolume = Math.max(0, Math.min(1, volume));
    
    // Update current music volume if playing
    if (this.currentMusic) {
      this.currentMusic.volume = this.preferences.musicVolume;
    }
    
    this.savePreferences();
  }

  /**
   * Toggle mute state
   */
  toggleMute(): boolean {
    this.preferences.muted = !this.preferences.muted;
    this.savePreferences();
    
    // Stop music if muting
    if (this.preferences.muted) {
      this.stopMusic();
    }
    
    return this.preferences.muted;
  }

  /**
   * Set mute state directly
   */
  setMuted(muted: boolean): void {
    this.preferences.muted = muted;
    this.savePreferences();
    
    if (muted) {
      this.stopMusic();
    }
  }

  /**
   * Get current preferences
   */
  getPreferences(): Readonly<AudioPreferences> {
    return { ...this.preferences };
  }

  /**
   * Check if audio is unlocked (ready to play)
   */
  isUnlocked(): boolean {
    return this.audioUnlocked;
  }
}

// Export singleton instance
export const AudioManager = new AudioManagerClass();

