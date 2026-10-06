/* ==========================================================================
   sound.js — thin wrapper around the <audio> elements declared in index.html.
   All sound files are loaded from public, direct URLs (Google's actions
   sound library) — no local assets are used, per project requirements.
   ========================================================================== */

class SoundManager {
  constructor() {
    this.muted = false;
    this.map = {
      coin: document.getElementById("snd-coin"),
      click: document.getElementById("snd-click"),
      dispense: document.getElementById("snd-dispense"),
      start: document.getElementById("snd-start"),
      reset: document.getElementById("snd-reset"),
      error: document.getElementById("snd-error"),
      success: document.getElementById("snd-success"),
      change: document.getElementById("snd-change"),
    };
    Object.values(this.map).forEach((a) => { if (a) a.volume = 0.55; });
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  play(name) {
    if (this.muted) return;
    const audio = this.map[name];
    if (!audio) return;
    try {
      audio.currentTime = 0;
      const p = audio.play();
      if (p && p.catch) p.catch(() => {}); // autoplay-policy guard, fails silently
    } catch (e) { /* no-op: sound is a nice-to-have, never block the UI */ }
  }
}

window.SoundManager = SoundManager;
