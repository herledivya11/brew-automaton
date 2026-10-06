/* ==========================================================================
   animation.js — reusable, dependency-free animation helpers.
   ========================================================================== */

const Anim = {
  /** Flies a coin from a source element to the coin slot. */
  flyCoin(sourceEl, targetEl, label, onDone, duration = 650) {
    const layer = document.getElementById("coin-flight-layer");
    const stage = layer.closest(".dispense-stage") || layer.parentElement;
    const srcRect = sourceEl.getBoundingClientRect();
    const tgtRect = targetEl.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();

    const coin = document.createElement("div");
    coin.className = "flying-coin";
    coin.textContent = label;
    coin.style.left = `${srcRect.left - stageRect.left + srcRect.width / 2 - 17}px`;
    coin.style.top = `${srcRect.top - stageRect.top + srcRect.height / 2 - 17}px`;

    const dx = (tgtRect.left - stageRect.left + tgtRect.width / 2) - (srcRect.left - stageRect.left + srcRect.width / 2);
    const dy = (tgtRect.top - stageRect.top + tgtRect.height / 2) - (srcRect.top - stageRect.top + srcRect.height / 2);
    coin.style.setProperty("--dx", `${dx}px`);
    coin.style.setProperty("--dy", `${dy}px`);
    coin.style.transform = `translate(0,0)`;
    coin.animate(
      [
        { transform: "translate(0px,0px) scale(1)", offset: 0 },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 40}px) scale(1.1)`, offset: 0.5 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.4)`, offset: 1 },
      ],
      { duration, easing: "cubic-bezier(.3,.6,.4,1)" }
    );

    coin.style.animationDuration = `${duration}ms`; // keep CSS coin spin/fade in sync with the flight
    layer.appendChild(coin);
    setTimeout(() => {
      coin.remove();
      if (onDone) onDone();
    }, duration);
  },

  shake(el) {
    el.classList.remove("shake");
    void el.offsetWidth; // reflow to restart animation
    el.classList.add("shake");
    setTimeout(() => el.classList.remove("shake"), 450);
  },

  popCard(el) {
    el.classList.remove("pop");
    void el.offsetWidth;
    el.classList.add("pop");
    setTimeout(() => el.classList.remove("pop"), 340);
  },

  /** Fill the SVG cup from 0 -> pct (0..1) over duration ms, with steam + slide. */
  fillCup(pct, duration = 1400) {
    const rect = document.getElementById("coffee-fill");
    const steam = document.getElementById("steam-group");
    const cupWrap = document.querySelector(".cup-wrap");
    const totalH = 88; // matches clip path height roughly
    const targetH = totalH * pct;

    rect.style.transition = `height ${duration}ms cubic-bezier(.4,0,.2,1), y ${duration}ms cubic-bezier(.4,0,.2,1)`;
    rect.setAttribute("height", targetH);
    rect.setAttribute("y", 118 - targetH);

    steam.classList.add("steaming");
    cupWrap.classList.add("sliding");

    setTimeout(() => {
      cupWrap.classList.remove("sliding");
    }, duration);
  },

  resetCup() {
    const rect = document.getElementById("coffee-fill");
    const steam = document.getElementById("steam-group");
    rect.style.transition = "height 400ms ease, y 400ms ease";
    rect.setAttribute("height", 0);
    rect.setAttribute("y", 118);
    steam.classList.remove("steaming");
  },

  setGlow(mode) {
    const glow = document.getElementById("machine-glow");
    glow.className = "machine-glow";
    if (mode) glow.classList.add(`glow-${mode}`);
  },

  ripple(e, btn) {
    const rect = btn.getBoundingClientRect();
    const circle = document.createElement("span");
    const size = Math.max(rect.width, rect.height);
    circle.className = "ripple-circle";
    circle.style.width = circle.style.height = `${size}px`;
    const x = (e.clientX ?? rect.left + rect.width / 2) - rect.left - size / 2;
    const y = (e.clientY ?? rect.top + rect.height / 2) - rect.top - size / 2;
    circle.style.left = `${x}px`;
    circle.style.top = `${y}px`;
    btn.style.position = btn.style.position || "relative";
    btn.style.overflow = "hidden";
    btn.appendChild(circle);
    setTimeout(() => circle.remove(), 620);
  },

  confetti(count = 42) {
    const colors = ["#d4a24c", "#f0c169", "#43d17a", "#f3e6d2", "#6b4226"];
    for (let i = 0; i < count; i++) {
      const piece = document.createElement("div");
      piece.className = "confetti-piece";
      piece.style.left = `${Math.random() * 100}vw`;
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      piece.style.animationDuration = `${1.6 + Math.random() * 1.4}s`;
      piece.style.transform = `rotate(${Math.random() * 360}deg)`;
      document.body.appendChild(piece);
      setTimeout(() => piece.remove(), 3200);
    }
  },

  toast(message, type = "info", icon = null) {
    const icons = { success: "fa-circle-check", error: "fa-circle-xmark", warning: "fa-triangle-exclamation", info: "fa-circle-info" };
    const el = document.createElement("div");
    el.className = `toast toast-${type}`;
    el.innerHTML = `<i class="fa-solid ${icon || icons[type] || icons.info}"></i><span>${message}</span>`;
    document.getElementById("toast-container").appendChild(el);
    setTimeout(() => el.remove(), 3500);
  },

  /** Lightweight ambient background particles resembling coffee bean motes. */
  initParticles() {
    const canvas = document.getElementById("bg-particles");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let w, h, particles;

    function resize() {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    }
    function makeParticles() {
      const count = Math.min(50, Math.floor((w * h) / 32000));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 1 + Math.random() * 2.2,
        vy: 0.12 + Math.random() * 0.25,
        vx: (Math.random() - 0.5) * 0.15,
        a: 0.15 + Math.random() * 0.35,
      }));
    }
    function tick() {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "rgba(212,162,76,1)";
      particles.forEach((p) => {
        ctx.globalAlpha = p.a;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        p.y -= p.vy;
        p.x += p.vx;
        if (p.y < -5) { p.y = h + 5; p.x = Math.random() * w; }
      });
      requestAnimationFrame(tick);
    }
    resize();
    makeParticles();
    window.addEventListener("resize", () => { resize(); makeParticles(); });
    tick();
  },
};

window.Anim = Anim;
