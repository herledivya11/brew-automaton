/* ==========================================================================
   visualization.js — renders the DFA as an SVG "snake" diagram of amount
   states plus three destination nodes (qAccept / qError / qDead), keeps the
   transition table & formal definition in sync, and drives the step-by-step
   replay of the recorded input tape.
   ========================================================================== */

class DFAVisualizer {
  constructor(dfa, svgEl) {
    this.dfa = dfa;
    this.svg = svgEl;
    this.nodePos = new Map(); // state -> {x,y}
    this.visited = new Set(["q0"]);
    this.replayIndex = -1; // -1 = live / not replaying
    this.autoPlayId = null;
    this._buildLayout();
    this._renderStatic();
  }

  _buildLayout() {
    const amounts = this.dfa.amountStates; // q0..qMAX
    const rowSplit = Math.ceil(amounts.length / 2);
    const row1 = amounts.slice(0, rowSplit);
    const row2 = amounts.slice(rowSplit).reverse();

    const padX = 55, w = 900;
    const usable = w - padX * 2;
    const y1 = 90, y2 = 230;

    row1.forEach((s, i) => {
      const x = padX + (row1.length === 1 ? 0 : (usable * i) / (row1.length - 1));
      this.nodePos.set(s, { x, y: y1 });
    });
    row2.forEach((s, i) => {
      const x = padX + (row2.length === 1 ? 0 : (usable * i) / (row2.length - 1));
      this.nodePos.set(s, { x, y: y2 });
    });

    this.nodePos.set("qAccept", { x: 830, y: 160 });
    this.nodePos.set("qError", { x: 470, y: 340 });
    this.nodePos.set("qDead", { x: 830, y: 340 });

    this.row1 = row1;
    this.row2 = row2;
  }

  _svgNS(tag) { return document.createElementNS("http://www.w3.org/2000/svg", tag); }

  _renderStatic() {
    this.svg.innerHTML = "";

    // defs: arrow marker + glow filter
    const defs = this._svgNS("defs");
    defs.innerHTML = `
      <marker id="arrowHead" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
        <path d="M0,0 L8,3 L0,6 Z" fill="var(--gold-bright)"/>
      </marker>
      <marker id="arrowHeadDyn" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
        <path d="M0,0 L8,3 L0,6 Z" fill="#ffffff"/>
      </marker>`;
    this.svg.appendChild(defs);

    this.edgesLayer = this._svgNS("g"); this.edgesLayer.setAttribute("class", "edges-layer");
    this.dynLayer = this._svgNS("g"); this.dynLayer.setAttribute("class", "dyn-layer");
    this.nodesLayer = this._svgNS("g"); this.nodesLayer.setAttribute("class", "nodes-layer");
    this.svg.appendChild(this.edgesLayer);
    this.svg.appendChild(this.dynLayer);
    this.svg.appendChild(this.nodesLayer);

    // permanent +5 chain edges
    const chain = [...this.row1, ...this.row2];
    for (let i = 0; i < chain.length - 1; i++) {
      this._drawEdge(chain[i], chain[i + 1], { permanent: true, label: i === chain.length - 2 ? "" : "" });
    }
    // connector row1 -> row2 (down curve)
    // (already included since chain concatenates row1 then row2)

    // nodes
    [...this.dfa.amountStates, "qAccept", "qError", "qDead"].forEach((s) => this._drawNode(s));

    this._labelSpecial("qAccept", "F · accept");
    this._labelSpecial("qError", "reject / retry");
    this._labelSpecial("qDead", "trap");
  }

  _drawEdge(fromS, toS, opts = {}) {
    const a = this.nodePos.get(fromS), b = this.nodePos.get(toS);
    if (!a || !b) return null;
    const path = this._svgNS("path");
    const midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2 - (opts.curve || 18);
    const d = `M ${a.x} ${a.y} Q ${midX} ${midY} ${b.x} ${b.y}`;
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("class", "dfa-edge");
    path.setAttribute("stroke", opts.permanent ? "rgba(212,162,76,0.35)" : "#fff");
    path.setAttribute("stroke-width", opts.permanent ? "1.6" : "2.4");
    path.setAttribute("marker-end", opts.permanent ? "url(#arrowHead)" : "url(#arrowHeadDyn)");
    (opts.permanent ? this.edgesLayer : this.dynLayer).appendChild(path);
    return path;
  }

  _drawNode(state) {
    const pos = this.nodePos.get(state);
    if (!pos) return;
    const g = this._svgNS("g");
    g.setAttribute("class", "dfa-node");
    g.setAttribute("data-state", state);
    g.setAttribute("transform", `translate(${pos.x},${pos.y})`);

    const isSpecial = ["qAccept", "qError", "qDead"].includes(state);
    const r = isSpecial ? 26 : 20;

    const circle = this._svgNS("circle");
    circle.setAttribute("r", r);
    circle.setAttribute("class", "dfa-node-circle");
    circle.setAttribute("fill", isSpecial ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.04)");
    circle.setAttribute("stroke", "rgba(255,255,255,0.25)");
    circle.setAttribute("stroke-width", state === this.dfa.startState ? 3 : 1.6);
    g.appendChild(circle);

    if (state === this.dfa.startState) {
      const arrow = this._svgNS("path");
      arrow.setAttribute("d", `M ${-r - 26} 0 L ${-r - 4} 0`);
      arrow.setAttribute("stroke", "var(--gold-bright)");
      arrow.setAttribute("stroke-width", "2.4");
      arrow.setAttribute("marker-end", "url(#arrowHead)");
      g.appendChild(arrow);
    }

    if (this.dfa.acceptStates.has(state)) {
      const inner = this._svgNS("circle");
      inner.setAttribute("r", r - 5);
      inner.setAttribute("fill", "none");
      inner.setAttribute("stroke", "rgba(67,209,122,0.6)");
      inner.setAttribute("stroke-width", "1.4");
      g.appendChild(inner);
      g.classList.add("is-accept");
    }
    if (state === "qError") g.classList.add("is-error-node");
    if (state === "qDead") g.classList.add("is-dead-node");

    const label = this._svgNS("text");
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("dy", "5");
    label.setAttribute("class", "dfa-label mono");
    label.setAttribute("fill", "var(--cream)");
    label.setAttribute("font-size", isSpecial ? "11" : "11.5");
    label.textContent = isSpecial ? state.replace("q", "q") : state;
    g.appendChild(label);

    this.nodesLayer.appendChild(g);
  }

  _labelSpecial(state, text) {
    const pos = this.nodePos.get(state);
    const t = this._svgNS("text");
    t.setAttribute("x", pos.x);
    t.setAttribute("y", pos.y + 42);
    t.setAttribute("text-anchor", "middle");
    t.setAttribute("class", "dfa-label mono");
    t.setAttribute("fill", "var(--cream-dim)");
    t.setAttribute("font-size", "9.5");
    t.textContent = text;
    this.nodesLayer.appendChild(t);
  }

  _nodeEl(state) { return this.svg.querySelector(`.dfa-node[data-state="${CSS.escape(state)}"]`); }

  /** Clears transient highlighting classes, keeps visited trail. */
  clearCurrentHighlight() {
    this.svg.querySelectorAll(".dfa-node.is-current").forEach((n) => n.classList.remove("is-current"));
  }

  setCurrent(state) {
    this.clearCurrentHighlight();
    const el = this._nodeEl(state);
    if (el) {
      el.classList.add("is-current", "is-visited", "pulse");
      setTimeout(() => el.classList.remove("pulse"), 700);
    }
    this.visited.add(state);
    this.svg.querySelectorAll(".dfa-node").forEach((n) => {
      if (this.visited.has(n.dataset.state)) n.classList.add("is-visited");
    });
  }

  /** Draws a transient labelled arrow for the given transition and fades it out. */
  animateTransition(fromState, toState, inputLabel, rejectedText) {
    // clear old dynamic edges
    this.dynLayer.innerHTML = "";
    if (fromState !== toState) {
      const path = this._drawEdge(fromState, toState, { permanent: false, curve: 46 });
      if (path) {
        path.classList.add("is-active", "dfa-edge-flow");
        const len = path.getTotalLength ? path.getTotalLength() : 100;
        const a = this.nodePos.get(fromState), b = this.nodePos.get(toState);
        if (a && b) {
          const lbl = this._svgNS("text");
          lbl.setAttribute("x", (a.x + b.x) / 2);
          lbl.setAttribute("y", (a.y + b.y) / 2 - 22);
          lbl.setAttribute("text-anchor", "middle");
          lbl.setAttribute("class", "dfa-label mono");
          lbl.setAttribute("fill", "#fff");
          lbl.setAttribute("font-size", "11");
          lbl.textContent = inputLabel;
          this.dynLayer.appendChild(lbl);
        }
      }
    }
    if (rejectedText) {
      const p = this.nodePos.get(toState);
      if (p) {
        const rt = this._svgNS("text");
        rt.setAttribute("x", p.x);
        rt.setAttribute("y", p.y + 62);
        rt.setAttribute("text-anchor", "middle");
        rt.setAttribute("class", "dfa-label mono");
        rt.setAttribute("fill", "var(--state-error)");
        rt.setAttribute("font-size", "11");
        rt.textContent = rejectedText;
        this.dynLayer.appendChild(rt);
      }
    }
    this.setCurrent(toState);
    clearTimeout(this._fadeTimer);
    this._fadeTimer = setTimeout(() => { this.dynLayer.innerHTML = ""; }, rejectedText ? 5000 : 1600);
  }

  resetTrail() {
    this.visited = new Set(["q0"]);
    this.svg.querySelectorAll(".dfa-node").forEach((n) => n.classList.remove("is-visited", "is-current"));
    this.dynLayer.innerHTML = "";
    this.setCurrent("q0");
  }
}

/* -------------------------------------------------------------------------
   Supporting UI: formal definition text, transition table, transition log,
   step-by-step explanation + replay controls.
   ------------------------------------------------------------------------- */

const VizUI = {
  updateFormalDef(dfa) {
    const def = dfa.formalDefinitionText();
    document.getElementById("def-Q").textContent = def.Q;
    document.getElementById("def-sigma").textContent = def.sigma;
    document.getElementById("def-q0").textContent = def.q0;
    document.getElementById("def-F").textContent = def.F;
  },

  updateDelta(fromState, input, toState) {
    document.getElementById("def-delta").textContent = `δ(${fromState}, ${input}) = ${toState}`;
  },

  renderTransitionTable(dfa, activeState = null, activeInput = null) {
    const body = document.getElementById("transition-table-body");
    const rows = dfa.buildTransitionTable();
    body.innerHTML = rows
      .map((r) => {
        const isActiveRow = r.state === activeState;
        const cellClass = (col) => {
          let cls = "";
          if (isActiveRow && col === activeInput) cls += " cell-input-active";
          if (isActiveRow && col === activeInput) cls += " cell-next";
          return cls;
        };
        return `<tr class="${isActiveRow ? "row-active" : ""}">
          <td>${r.state}</td>
          <td class="mono${cellClass("5")}">${r["5"]}</td>
          <td class="mono${cellClass("10")}">${r["10"]}</td>
          <td class="mono${cellClass("20")}">${r["20"]}</td>
          <td class="mono${cellClass("BUY")}">${r["BUY"]}</td>
          <td class="mono${cellClass("RESET")}">${r["RESET"]}</td>
        </tr>`;
      })
      .join("");

    if (activeState) {
      const activeRow = body.querySelector("tr.row-active");
      if (activeRow && typeof activeRow.scrollIntoView === "function") {
        activeRow.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  },

  addLogEntry(entry) {
    const list = document.getElementById("log-list");
    const div = document.createElement("div");
    let cls = "log-entry log-current";
    if (entry.to === "qAccept") cls = "log-entry log-accept";
    else if (entry.to === "qError" || entry.to === "qDead") cls = "log-entry log-error";
    div.className = cls;
    const time = new Date(entry.t).toLocaleTimeString();
    div.textContent = `[${time}] δ(${entry.from}, ${entry.input}) = ${entry.to}`;
    list.appendChild(div);
    if (entry.rejected) {
      const rej = document.createElement("div");
      rej.className = "log-entry log-error";
      rej.textContent = `✖ REJECTED  ${entry.rejectedString}  (${entry.path}) · ${entry.rejectReason}`;
      list.appendChild(rej);
    }
    list.scrollTop = list.scrollHeight;
    // cap log size
    while (list.children.length > 60) list.removeChild(list.firstChild);
  },

  clearLog() {
    document.getElementById("log-list").innerHTML = "";
  },

  updateStepExplain(entry) {
    document.getElementById("ex-state").textContent = entry.from;
    document.getElementById("ex-input").textContent = entry.input;
    document.getElementById("ex-next").textContent = entry.to;
    document.getElementById("ex-reason").textContent = entry.rejected
      ? `REJECTED — Rejected String: ${entry.rejectedString} — Reason: ${entry.rejectReason}`
      : entry.reason;
  },

  updateStepIndicator(idx, total) {
    document.getElementById("step-indicator").textContent = `step ${idx} / ${total}`;
  },
};

window.DFAVisualizer = DFAVisualizer;
window.VizUI = VizUI;
