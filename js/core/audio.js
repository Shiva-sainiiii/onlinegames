/* ==========================================================================
   AUDIO.JS — sound effects manager
   ==========================================================================
   Two sound sources are supported per event:
     1. A real audio file in /assets/sfx/ (preferred, if present)
     2. A synthesized fallback tone via WebAudio (works with zero assets)

   To add a new sound:
     - Drop a file in assets/sfx/ (e.g. "capture.mp3")
     - Add an entry to SFX_FILES below: capture: 'assets/sfx/capture.mp3'
     - Call Audio.play('capture') from anywhere

   If a file fails to load or isn't listed, the synthesized tone in
   SFX_FALLBACK_TONES is used instead, so sound always works even before
   you've recorded/found real audio files.
   ========================================================================== */

export const Audio = (() => {
  "use strict";

  const STORAGE_KEY = 'arcade-sound-muted';

  // ---- Map event name -> real audio file (optional) ----
  // Once you've dropped the matching file into assets/sfx/, uncomment its
  // line here and it takes over automatically from the synthesized fallback.
  const SFX_FILES = {
    move: 'assets/sfx/move.mp3',
    win: 'assets/sfx/win.mp3',
    lose: 'assets/sfx/lose.mp3',
    draw: 'assets/sfx/draw.mp3',
    connect: 'assets/sfx/connect.mp3',
    message: 'assets/sfx/message.mp3',
    click: 'assets/sfx/click.mp3',
    error: 'assets/sfx/error.mp3',
    capture: 'assets/sfx/capture.mp3',  // chess-only, add when you move to chess polish
  };

  // ---- Map event name -> synthesized fallback tone spec ----
  // freq: pitch in Hz, dur: seconds, type: oscillator waveform
  const SFX_FALLBACK_TONES = {
    move:    { freq: 440, dur: 0.08, type: 'sine' },
    capture: { freq: 320, dur: 0.12, type: 'square' },
    check:   { freq: 600, dur: 0.15, type: 'triangle' },
    win:     { freq: [523, 659, 784], dur: 0.14, type: 'sine' }, // chord-ish sequence
    lose:    { freq: [400, 300], dur: 0.18, type: 'sawtooth' },
    draw:    { freq: [440, 440], dur: 0.14, type: 'sine' },
    click:   { freq: 700, dur: 0.05, type: 'sine' },
    connect: { freq: [500, 700, 900], dur: 0.09, type: 'sine' },
    message: { freq: 880, dur: 0.06, type: 'sine' },
    error:   { freq: 180, dur: 0.2, type: 'sawtooth' },
  };

  let ctx = null;
  let muted = localStorage.getItem(STORAGE_KEY) === '1';
  const fileCache = {};

  // ---- Background music ----
  const BG_MUSIC_FILE = 'assets/sfx/bgmusic.mp3';
  let bgEl = null;

  function getBgEl() {
    if (!bgEl) {
      bgEl = new window.Audio(BG_MUSIC_FILE);
      bgEl.loop = true;
      bgEl.volume = 0.35;
    }
    return bgEl;
  }

  function playBgMusic() {
    if (muted) return;
    const el = getBgEl();
    el.play().catch(() => {
      // Blocked until a user gesture — retried from primeOnFirstGesture below.
    });
  }

  function stopBgMusic() {
    if (bgEl) bgEl.pause();
  }

  function pauseBgMusic() {
    if (bgEl) bgEl.pause();
  }

  function resumeBgMusic() {
    if (!muted) playBgMusic();
  }

  function getCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctx = new AC();
    }
    // Browsers suspend AudioContext until a user gesture; resume opportunistically.
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function playTone(spec) {
    const audioCtx = getCtx();
    if (!audioCtx) return;
    const freqs = Array.isArray(spec.freq) ? spec.freq : [spec.freq];
    freqs.forEach((f, i) => {
      const startAt = audioCtx.currentTime + i * (spec.dur * 0.9);
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = spec.type || 'sine';
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.15, startAt + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + spec.dur);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(startAt);
      osc.stop(startAt + spec.dur + 0.02);
    });
  }

  function playFile(url) {
    let el = fileCache[url];
    if (!el) {
      el = new window.Audio(url);
      el.volume = 0.6;
      fileCache[url] = el;
    }
    // Allow rapid re-triggering (e.g. quick successive moves)
    el.currentTime = 0;
    el.play().catch(() => {
      // Autoplay/user-gesture restrictions or missing file — silently ignore,
      // the synthesized tone path is the resilient fallback and is tried
      // separately by play() when a file isn't configured at all.
    });
  }

  function play(eventName) {
    if (muted) return;
    const file = SFX_FILES[eventName];
    if (file) {
      playFile(file);
      return;
    }
    const tone = SFX_FALLBACK_TONES[eventName];
    if (tone) playTone(tone);
  }

  function setMuted(val) {
    muted = !!val;
    localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
    if (muted) stopBgMusic(); else resumeBgMusic();
  }

  function toggleMuted() {
    setMuted(!muted);
    return muted;
  }

  function isMuted() { return muted; }

  // Unlock the AudioContext on first user interaction (mobile browsers
  // require a gesture before audio can play).
  function primeOnFirstGesture() {
    const unlock = () => {
      getCtx();
      resumeBgMusic();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }
  primeOnFirstGesture();

  return {
    play, setMuted, toggleMuted, isMuted,
    playBgMusic, stopBgMusic, pauseBgMusic, resumeBgMusic,
  };
})();
