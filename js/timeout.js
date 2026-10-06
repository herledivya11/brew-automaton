/* ==========================================================================
   timeout.js — 30s inactivity watchdog. If the user starts a transaction
   (inserts a coin) and then goes idle, we count down and auto-cancel,
   returning any inserted coins, exactly like a real vending machine.
   ========================================================================== */

class InactivityTimer {
  constructor({ limit = 30, onTick, onTimeout } = {}) {
    this.limit = limit;
    this.remaining = limit;
    this.onTick = onTick || (() => {});
    this.onTimeout = onTimeout || (() => {});
    this.intervalId = null;
    this.active = false;
  }

  start() {
    this.stop();
    this.remaining = this.limit;
    this.active = true;
    this.onTick(this.remaining, this.active);
    this.intervalId = setInterval(() => {
      this.remaining -= 1;
      this.onTick(this.remaining, this.active);
      if (this.remaining <= 0) {
        this.stop();
        this.onTimeout();
      }
    }, 1000);
  }

  /** Call on any relevant user activity to push the deadline back. */
  poke() {
    if (this.active) this.start();
  }

  stop() {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = null;
    this.active = false;
    this.onTick(this.limit, false);
  }
}

window.InactivityTimer = InactivityTimer;
