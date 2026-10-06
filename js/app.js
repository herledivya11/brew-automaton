/* ==========================================================================
   app.js — application bootstrap and glue code.
   ========================================================================== */

(function () {
  "use strict";

  // ---------- core engines ----------
  const dfa = new DFA(100, 5);
  const sound = new SoundManager();
  const history = new TransactionHistory(document.getElementById("history-body"));
  const machine = new VendingMachine(dfa, sound, history);
  const viz = new DFAVisualizer(dfa, document.getElementById("dfa-svg"));

  let paused = false;
  let demoActive = false;
  let demoTimer = null;
  let replayMode = false;
  let replayIndex = -1;
  let timeoutResetId = null;

  // ---------- inactivity timer ----------
  const timeoutChip = document.getElementById("timeout-chip");
  const timeoutCountEl = document.getElementById("timeout-count");
  const inactivity = new InactivityTimer({
    limit: 30,
    onTick: (remaining, active) => {
      if (active) {
        timeoutChip.hidden = false;
        timeoutCountEl.textContent = remaining;
      } else {
        timeoutChip.hidden = true;
      }
    },
    onTimeout: () => {
      const refund = machine.currentAmount();
      Anim.toast(`Session timed out — returning ₹${refund}.`, "warning", "fa-hourglass-end");
      sound.play("error");
      machine.stats.timeouts += 1;
      machine.timeout(); // DFA: TIMEOUT -> qError (rejected string shown in graph/log/explanation)
      // keep the rejection visible before the usual refund + reset
      timeoutResetId = setTimeout(() => {
        if (refund > 0) animateChangeReturn(refund);
        doReset("timeout");
      }, 3000);
    },
  });

  // ================================================================
  // Splash screen
  // ================================================================
  window.addEventListener("load", () => {
    setTimeout(() => document.getElementById("splash-screen").classList.add("hide"), 900);
  });
  Anim.initParticles();

  // ================================================================
  // Clock
  // ================================================================
  function tickClock() {
    document.getElementById("clock").textContent = new Date().toLocaleTimeString();
  }
  tickClock();
  setInterval(tickClock, 1000);

  // ================================================================
  // Render coffee grid
  // ================================================================
  const grid = document.getElementById("coffee-grid");
  COFFEE_MENU.forEach((coffee, i) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "coffee-card";
    card.dataset.id = coffee.id;
    card.setAttribute("aria-label", `${coffee.name}, ₹${coffee.price}`);
    card.innerHTML = `
      <div class="coffee-img-wrap"><img loading="lazy" src="${coffee.img}" alt="${coffee.name}"></div>
      <div class="coffee-name">${coffee.name}</div>
      <div class="coffee-price mono">₹${coffee.price}</div>
      <div class="coffee-desc">${coffee.desc}</div>
    `;
    card.addEventListener("click", () => selectCoffee(coffee.id, card));
    grid.appendChild(card);
  });

  function selectCoffee(id, cardEl) {
    machine.selectCoffee(id);
    document.querySelectorAll(".coffee-card").forEach((c) => c.classList.remove("selected"));
    cardEl.classList.add("selected");
    Anim.popCard(cardEl);
    sound.play("click");
    updateScreen();
  }

  // ================================================================
  // Stats grid
  // ================================================================
  const statsGrid = document.getElementById("stats-grid");
  function renderStats() {
    statsGrid.innerHTML = machine.getStatsView()
      .map((s) => `<div class="stat-card"><div class="stat-value">${s.value}</div><div class="stat-label">${s.label}</div></div>`)
      .join("");
  }
  renderStats();

  // ================================================================
  // Screen / HUD updates
  // ================================================================
  function updateScreen() {
    const amount = machine.currentAmount();
    const price = machine.selectedCoffee ? machine.selectedCoffee.price : 0;
    document.getElementById("screen-coffee").textContent = machine.selectedCoffee ? machine.selectedCoffee.name : "— none —";
    document.getElementById("screen-amount").textContent = `₹${amount}`;
    document.getElementById("screen-price").textContent = `₹${price}`;
    document.getElementById("progress-text").textContent = `₹${amount} / ₹${price}`;
    const pct = price > 0 ? Math.min(100, (amount / price) * 100) : 0;
    document.getElementById("progress-fill").style.width = `${pct}%`;

    document.getElementById("hud-state").textContent = dfa.current;
    document.getElementById("hud-amount").textContent = `₹${amount}`;

    const pillState = document.getElementById("pill-state");
    pillState.classList.remove("state-current", "state-accept", "state-error");
    if (dfa.current === "qAccept") pillState.classList.add("state-accept");
    else if (dfa.current === "qError" || dfa.current === "qDead") pillState.classList.add("state-error");
    else pillState.classList.add("state-current");
  }

  function setMachineStatus(label, statusKey) {
    document.getElementById("hud-status").textContent = label;
    document.getElementById("machine-status-text").textContent = label;
    const chip = document.getElementById("machine-status-chip");
    chip.className = `status-chip status-${statusKey}`;
  }

  const STATUS_LABEL = {
    idle: "Idle", waiting: "Waiting", processing: "Processing",
    dispensing: "Dispensing", returning: "Returning Change", accepted: "Accepted",
    rejected: "Rejected", error: "Error", timeout: "Timeout", reset: "Reset",
  };
  machine.on("status", (status) => setMachineStatus(STATUS_LABEL[status] || status, status));

  // ================================================================
  // Transition -> visualization sync
  // ================================================================
  machine.on("transition", (entry) => {
    viz.animateTransition(entry.from, entry.to, formatInputLabel(entry.input), rejectedLabel(entry));
    VizUI.updateDelta(entry.from, entry.input, entry.to);
    VizUI.addLogEntry(entry);
    VizUI.renderTransitionTable(dfa, entry.from, entry.input);
    VizUI.updateStepExplain(entry);
    VizUI.updateStepIndicator(dfa.tape.length, dfa.tape.length);
    updateScreen();
  });

  function rejectedLabel(entry) {
    return entry.rejected ? `REJECTED: ${entry.rejectedString}` : undefined;
  }

  function formatInputLabel(input) {
    if (["5", "10", "20"].includes(input)) return `₹${input}`;
    return input;
  }

  VizUI.updateFormalDef(dfa);
  VizUI.renderTransitionTable(dfa);
  viz.setCurrent("q0");

  // ================================================================
  // Coin insertion
  // ================================================================
  document.querySelectorAll(".coin-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      Anim.ripple(e, btn);
      handleCoin(btn.dataset.coin, btn);
    });
  });

  function handleCoin(coinValue, sourceEl, flightMs = 650) {
    if (paused) return Anim.toast("Machine is paused.", "warning");
    if (!machine.selectedCoffee && coinValue !== "invalid") {
      Anim.toast("Pick a coffee first, then insert coins.", "info", "fa-mug-hot");
    }
    inactivity.poke();
    if (!inactivity.active) inactivity.start();

    const slot = document.getElementById("coin-slot");
    Anim.flyCoin(sourceEl, slot, coinValue === "invalid" ? "?" : `₹${coinValue}`, () => {
      const entry = machine.insertCoin(coinValue);
      if (!entry) return;
      if (entry.to === "qDead") {
        sound.play("error");
        Anim.shake(slot);
        Anim.toast("Unrecognised token rejected — machine trapped in qDead.", "error");
        Anim.setGlow("error");
        setTimeout(() => {
          Anim.toast("Auto-recovering from dead state (RESET).", "info", "fa-rotate-left");
          machine.reset("reset");
          Anim.setGlow(null);
          viz.resetTrail();
          updateScreen();
        }, 1800);
      } else {
        sound.play("coin");
        Anim.setGlow(null);
      }
    }, flightMs);
  }

  // ================================================================
  // Buy
  // ================================================================
  document.getElementById("btn-buy").addEventListener("click", (e) => {
    Anim.ripple(e, e.currentTarget);
    if (paused) return Anim.toast("Machine is paused.", "warning");
    doBuy();
  });

  // Default timings are the original hard-coded values (manual vending unchanged).
  // Demo Mode passes a scaled set so the speed setting drives the whole dispense.
  const MANUAL_TIMING = { fill: 1500, done: 1600, change: 400, resetChange: 2600, resetNoChange: 1800 };

  function doBuy(onDone, t = MANUAL_TIMING) {
    inactivity.stop();
    const result = machine.buy();
    if (result.reason === "no-coffee") {
      Anim.toast("Select a coffee before buying.", "warning", "fa-mug-hot");
      if (onDone) onDone();
      return;
    }
    if (!result.ok) {
      sound.play("error");
      Anim.setGlow("error");
      Anim.toast(`Insufficient balance — need ₹${result.needed} more.`, "error");
      setTimeout(() => Anim.setGlow(null), 900);
      inactivity.start();
      if (onDone) onDone();
      return;
    }

    // accepted
    sound.play("start");
    Anim.setGlow("processing");
    setMachineStatus("Dispensing", "dispensing");
    setTimeout(() => sound.play("dispense"), 250);
    Anim.fillCup(1, t.fill);

    setTimeout(() => {
      sound.play("success");
      Anim.setGlow("success");
      Anim.confetti(46);
      Anim.toast(`${result.coffee.name} is ready! Enjoy.`, "success", "fa-mug-saucer");
      machine.recordTransaction({ coffee: result.coffee, paid: result.paid, change: Math.max(result.change, 0), status: "Accepted" });
      renderStats();

      if (result.change > 0) {
        setTimeout(() => animateChangeReturn(result.change), t.change);
      }

      setTimeout(() => {
        Anim.resetCup();
        Anim.setGlow(null);
        machine.reset("idle");
        viz.resetTrail();
        updateScreen();
        document.querySelectorAll(".coffee-card").forEach((c) => c.classList.remove("selected"));
        machine.selectedCoffee = null;
        setMachineStatus("Idle", "idle");
        updateScreen();
        if (onDone) onDone(); // this coffee is fully complete
      }, result.change > 0 ? t.resetChange : t.resetNoChange);
    }, t.done);
  }

  function animateChangeReturn(amount) {
    setMachineStatus("Returning Change", "returning");
    sound.play("change");
    Anim.toast(`Returning Change ₹${amount}`, "info", "fa-coins");
    const slot = document.getElementById("coin-slot");
    const denominations = breakIntoCoins(amount);
    denominations.forEach((d, i) => {
      setTimeout(() => {
        const ghost = document.createElement("div");
        ghost.style.position = "absolute";
        ghost.style.left = "50%"; ghost.style.top = "50%";
        slot.parentElement.appendChild(ghost);
        Anim.flyCoin(slot, ghost, `₹${d}`, () => ghost.remove());
      }, i * 220);
    });
  }

  function breakIntoCoins(amount) {
    const coins = [20, 10, 5];
    const result = [];
    let remaining = amount;
    for (const c of coins) {
      while (remaining >= c) { result.push(c); remaining -= c; }
    }
    return result;
  }

  // ================================================================
  // Reset
  // ================================================================
  document.getElementById("btn-reset").addEventListener("click", (e) => {
    Anim.ripple(e, e.currentTarget);
    doReset("reset");
  });

  function doReset(reasonStatus) {
    clearTimeout(timeoutResetId);
    const refundNeeded = machine.currentAmount();
    inactivity.stop();
    if (refundNeeded > 0 && reasonStatus === "reset") {
      animateChangeReturn(refundNeeded);
      machine.recordTransaction({ coffee: machine.selectedCoffee, paid: refundNeeded, change: refundNeeded, status: "Rejected" });
      renderStats();
    }
    machine.reset(reasonStatus === "timeout" ? "timeout" : "reset");
    Anim.resetCup();
    Anim.setGlow(null);
    viz.resetTrail();
    document.querySelectorAll(".coffee-card").forEach((c) => c.classList.remove("selected"));
    machine.selectedCoffee = null;
    updateScreen();
    sound.play("reset");
    setTimeout(() => setMachineStatus("Idle", "idle"), 500);
  }

  // ================================================================
  // Pause / Resume
  // ================================================================
  document.getElementById("btn-pause").addEventListener("click", (e) => {
    paused = !paused;
    const btn = e.currentTarget;
    btn.classList.toggle("active", paused);
    btn.innerHTML = paused
      ? `<i class="fa-solid fa-play"></i> Resume`
      : `<i class="fa-solid fa-pause"></i> Pause`;
    Anim.toast(paused ? "Animations & machine paused." : "Machine resumed.", paused ? "warning" : "success");
    if (paused) inactivity.stop();
  });

  // ================================================================
  // Demo mode
  // ================================================================
  // Speed factor k scales EVERY demo timing: step delays, coin flight, fill/dispense,
  // completion and final reset. Fast = 0.5x, Medium = 1x (original timings), Slow = 2x.
  const DEMO_SPEEDS = {
    fast:   { label: "Fast",   k: 0.5 },
    medium: { label: "Medium", k: 1 },
    slow:   { label: "Slow",   k: 2 },
  };
  let demoSpeed = "medium";
  const demoSpeedBtn = document.getElementById("btn-demo-speed");
  demoSpeedBtn.addEventListener("click", () => {
    const keys = Object.keys(DEMO_SPEEDS);
    demoSpeed = keys[(keys.indexOf(demoSpeed) + 1) % keys.length];
    demoSpeedBtn.innerHTML = `<i class="fa-solid fa-gauge-high"></i> Speed: ${DEMO_SPEEDS[demoSpeed].label}`;
    Anim.toast(`Demo speed: ${DEMO_SPEEDS[demoSpeed].label}`, "info", "fa-gauge-high");
  });

  function demoTiming() {
    const k = DEMO_SPEEDS[demoSpeed].k;
    return {
      step: 750 * k,   // pause between demo actions (select, each coin, BUY)
      flight: 650 * k, // coin flight to the slot
      fill: 1500 * k, done: 1600 * k, change: 400 * k,
      resetChange: 2600 * k, resetNoChange: 1800 * k,
    };
  }

  const demoBtn = document.getElementById("btn-demo");
  demoBtn.addEventListener("click", () => {
    demoActive = !demoActive;
    demoBtn.classList.toggle("active", demoActive);
    if (demoActive) {
      Anim.toast("Demo started — one coffee, then it stops.", "info", "fa-wand-magic-sparkles");
      runDemoCycle();
    } else {
      clearTimeout(demoTimer);
      Anim.toast("Demo mode stopped.", "info");
    }
  });

  // The demo runs ONE coffee and then stops. There is no timer that starts the next one:
  // the user presses Demo Mode again to run the next coffee.
  function finishDemo() {
    if (!demoActive) return;
    demoActive = false;
    clearTimeout(demoTimer);
    demoBtn.classList.remove("active");
    Anim.toast("Coffee complete — demo stopped. Press Demo Mode for the next coffee.", "info", "fa-circle-stop");
  }

  function runDemoCycle() {
    if (!demoActive) return;
    if (paused) { demoTimer = setTimeout(runDemoCycle, 800); return; }

    const t = demoTiming();
    const coffee = COFFEE_MENU[Math.floor(Math.random() * COFFEE_MENU.length)];
    const card = document.querySelector(`.coffee-card[data-id="${coffee.id}"]`);
    selectCoffee(coffee.id, card);

    const coinChoices = [5, 10, 20];
    let inserted = 0;
    const insertNext = () => {
      if (!demoActive) return;
      if (paused) { demoTimer = setTimeout(insertNext, 800); return; }
      if (inserted < coffee.price) {
        const remaining = coffee.price - inserted;
        const coin = coinChoices.filter((c) => c <= Math.max(remaining, 5)).pop() || 5;
        const btn = document.querySelector(`.coin-btn[data-coin="${coin}"]`);
        handleCoin(String(coin), btn, t.flight);
        inserted += coin;
        demoTimer = setTimeout(insertNext, t.step);
      } else {
        demoTimer = setTimeout(buyStep, t.step);
      }
    };
    const buyStep = () => {
      if (!demoActive) return;
      if (paused) { demoTimer = setTimeout(buyStep, 800); return; }
      doBuy(finishDemo, t); // fully dispensed + reset -> STOP and wait for the user
    };
    demoTimer = setTimeout(insertNext, t.step);
  }

  // ================================================================
  // Theme (dark / light)
  // ================================================================
  const themeBtn = document.getElementById("btn-theme");
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    themeBtn.innerHTML = theme === "light" ? `<i class="fa-solid fa-sun"></i>` : `<i class="fa-solid fa-moon"></i>`;
    try { localStorage.setItem("coffee-dfa-theme", theme); } catch (e) {}
  }
  let savedTheme = "dark";
  try { savedTheme = localStorage.getItem("coffee-dfa-theme") || "dark"; } catch (e) {}
  applyTheme(savedTheme);
  themeBtn.addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    applyTheme(next);
  });

  // ================================================================
  // Mute
  // ================================================================
  const muteBtn = document.getElementById("btn-mute");
  muteBtn.addEventListener("click", () => {
    const muted = sound.toggleMute();
    muteBtn.innerHTML = muted ? `<i class="fa-solid fa-volume-xmark"></i>` : `<i class="fa-solid fa-volume-high"></i>`;
    Anim.toast(muted ? "Sound muted." : "Sound unmuted.", "info");
  });

  // ================================================================
  // Fullscreen
  // ================================================================
  document.getElementById("btn-fullscreen").addEventListener("click", () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  });

  // ================================================================
  // History actions
  // ================================================================
  document.getElementById("btn-clear-history").addEventListener("click", () => {
    history.clear();
    Anim.toast("Transaction history cleared.", "info", "fa-trash");
  });
  document.getElementById("btn-export-history").addEventListener("click", () => {
    if (history.records.length === 0) return Anim.toast("Nothing to export yet.", "warning");
    history.exportCSV();
    Anim.toast("History exported as CSV.", "success");
  });

  // ================================================================
  // Step-by-step replay controls
  // ================================================================
  const stepPrevBtn = document.getElementById("btn-step-prev");
  const stepNextBtn = document.getElementById("btn-step-next");
  const stepAutoBtn = document.getElementById("btn-step-auto");
  let autoPlayId = null;

  function showReplayStep(i) {
    const tape = dfa.tape;
    if (i < 0 || i >= tape.length) return;
    replayIndex = i;
    const entry = tape[i];
    viz.setCurrent(entry.to);
    viz.animateTransition(entry.from, entry.to, formatInputLabel(entry.input), rejectedLabel(entry));
    VizUI.updateStepExplain(entry);
    VizUI.updateDelta(entry.from, entry.input, entry.to);
    VizUI.renderTransitionTable(dfa, entry.from, entry.input);
    VizUI.updateStepIndicator(i + 1, tape.length);
  }

  stepPrevBtn.addEventListener("click", () => {
    if (dfa.tape.length === 0) return;
    replayIndex = replayIndex <= 0 ? 0 : replayIndex - 1;
    showReplayStep(replayIndex);
  });
  stepNextBtn.addEventListener("click", () => {
    if (dfa.tape.length === 0) return;
    replayIndex = replayIndex < 0 ? 0 : Math.min(dfa.tape.length - 1, replayIndex + 1);
    showReplayStep(replayIndex);
  });
  stepAutoBtn.addEventListener("click", () => {
    if (autoPlayId) {
      clearInterval(autoPlayId);
      autoPlayId = null;
      stepAutoBtn.innerHTML = `<i class="fa-solid fa-play"></i> Auto Play`;
      return;
    }
    if (dfa.tape.length === 0) return Anim.toast("No transitions recorded yet.", "warning");
    replayIndex = -1;
    stepAutoBtn.innerHTML = `<i class="fa-solid fa-pause"></i> Stop`;
    autoPlayId = setInterval(() => {
      replayIndex += 1;
      if (replayIndex >= dfa.tape.length) {
        clearInterval(autoPlayId);
        autoPlayId = null;
        stepAutoBtn.innerHTML = `<i class="fa-solid fa-play"></i> Auto Play`;
        return;
      }
      showReplayStep(replayIndex);
    }, 1000);
  });

  // ================================================================
  // Keyboard shortcuts
  // ================================================================
  const shortcutsModal = document.getElementById("shortcuts-modal");
  document.getElementById("btn-close-shortcuts").addEventListener("click", () => (shortcutsModal.hidden = true));

  window.addEventListener("keydown", (e) => {
    if (["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) return;
    const key = e.key.toLowerCase();
    if (key === "?") { shortcutsModal.hidden = !shortcutsModal.hidden; return; }
    if (["1", "2", "3", "4", "5"].includes(key)) {
      const idx = parseInt(key, 10) - 1;
      const coffee = COFFEE_MENU[idx];
      if (coffee) {
        const card = document.querySelector(`.coffee-card[data-id="${coffee.id}"]`);
        selectCoffee(coffee.id, card);
      }
      return;
    }
    if (key === "q") { const b = document.querySelector('.coin-btn[data-coin="5"]'); handleCoin("5", b); }
    if (key === "w") { const b = document.querySelector('.coin-btn[data-coin="10"]'); handleCoin("10", b); }
    if (key === "e") { const b = document.querySelector('.coin-btn[data-coin="20"]'); handleCoin("20", b); }
    if (key === "b") doBuy();
    if (key === "r") doReset("reset");
    if (key === "p") document.getElementById("btn-pause").click();
    if (key === "d") themeBtn.click();
    if (key === "m") muteBtn.click();
    if (key === "f") document.getElementById("btn-fullscreen").click();
  });

  // initial paint
  updateScreen();
  renderStats();
})();
