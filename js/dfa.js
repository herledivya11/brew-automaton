/* ==========================================================================
   dfa.js
   ----------------------------------------------------------------------
   A genuine, table-driven Deterministic Finite Automaton that models the
   payment logic of the vending machine.

   Formal definition   M = (Q, Σ, δ, q0, F)

   Q  (states)   = { q0, q5, q10, ..., qMAX }  ∪  { qAccept, qError, qDead }
                   -- "amount states" represent the rupees inserted so far,
                      quantised to steps of 5 and capped at MAX_AMOUNT so
                      that Q stays finite, which is required for a DFA.

   Σ  (alphabet) = { "5", "10", "20", "invalid", "BUY", "RESET" }

   δ  (transition function), informally:
       δ(q_amt, "5")        = q_min(amt+5,  MAX)
       δ(q_amt, "10")       = q_min(amt+10, MAX)
       δ(q_amt, "20")       = q_min(amt+20, MAX)
       δ(q_amt, "invalid")  = qDead                (unrecognised token trap)
       δ(q_amt, "BUY")      = qAccept   if amt >= price(selectedCoffee)
                             = qError    otherwise
       δ(qError, "RESET"|"5"|"10"|"20") = q_amt (returns to the amount it came from)
       δ(qAccept, "RESET")  = q0
       δ(qDead,  x != RESET) = qDead
       δ(qDead,  "RESET")   = q0
       δ(q_amt, "RESET")    = q0                   (manual/auto reset, any state)

   q0 (start state) = q0     (₹0 inserted)
   F  (accept states) = { qAccept }   -- L(M) is exactly the set of input
       strings that end with a successful "BUY" once enough coins were fed in.
   ========================================================================== */

class DFA {
  constructor(maxAmount = 100, step = 5) {
    this.MAX = maxAmount;
    this.STEP = step;
    this.alphabet = ["5", "10", "20", "invalid", "BUY", "RESET", "TIMEOUT"];
    this.startState = "q0";
    this.acceptStates = new Set(["qAccept"]);
    this.errorState = "qError";
    this.deadState = "qDead";

    this.amountStates = [];
    for (let a = 0; a <= this.MAX; a += this.STEP) this.amountStates.push(`q${a}`);

    this.states = [...this.amountStates, "qAccept", "qError", "qDead"];

    this.current = this.startState;
    this.lastAmountState = this.startState; // used to recover from qError
    this.price = 0; // required amount for currently selected coffee

    // full input tape recorded so far, for step-by-step replay
    this.tape = []; // { from, input, to, reason }
  }

  reset() {
    this.current = this.startState;
    this.lastAmountState = this.startState;
  }

  clearTape() {
    this.tape = [];
  }

  amountOf(state) {
    if (!state.startsWith("q") || state === "qAccept" || state === "qError" || state === "qDead") return null;
    return parseInt(state.slice(1), 10);
  }

  setPrice(price) {
    this.price = price;
  }

  /** Pure transition function δ(state, input) -> nextState. Does not mutate. */
  delta(state, input) {
    if (state === this.deadState) {
      return input === "RESET" ? this.startState : this.deadState;
    }

    if (state === "qAccept") {
      return input === "RESET" ? this.startState : "qAccept";
    }

    if (state === "qError") {
      if (input === "RESET") return this.startState;
      if (input === "invalid") return this.deadState;
      const amt = this.amountOf(this.lastAmountState) ?? 0;
      if (["5", "10", "20"].includes(input)) {
        return `q${Math.min(amt + parseInt(input, 10), this.MAX)}`;
      }
      if (input === "BUY") {
        return amt >= this.price ? "qAccept" : "qError";
      }
      return "qError";
    }

    // state is an amount state q<amt>
    const amt = this.amountOf(state) ?? 0;

    if (input === "RESET") return this.startState;
    if (input === "invalid") return this.deadState;
    if (input === "TIMEOUT") return "qError";
    if (["5", "10", "20"].includes(input)) {
      return `q${Math.min(amt + parseInt(input, 10), this.MAX)}`;
    }
    if (input === "BUY") {
      return amt >= this.price ? "qAccept" : "qError";
    }
    return state;
  }

  reasonFor(fromState, input, toState) {
    if (fromState === "qDead" && toState === "qDead") return "Machine is trapped in the dead state — only RESET can escape qDead.";
    if (fromState === "qAccept" && toState === "qAccept") return "Coffee already dispensed — waiting for RESET to serve the next customer.";
    if (input === "TIMEOUT") return "Timeout — no input before the time limit expired, transition to qError.";
    if (input === "invalid") return "Unrecognised token — trapped in the dead state qDead.";
    if (input === "RESET") return "Reset signal received — amount cleared back to q0.";
    if (["5", "10", "20"].includes(input)) {
      const before = this.amountOf(fromState) ?? this.amountOf(this.lastAmountState) ?? 0;
      const after = this.amountOf(toState);
      return `Amount increased by ₹${input} (₹${before} → ₹${after}).`;
    }
    if (input === "BUY") {
      const amt = this.amountOf(fromState) ?? this.amountOf(this.lastAmountState) ?? 0;
      if (toState === "qAccept") return `₹${amt} ≥ price ₹${this.price} — string accepted, dispensing coffee.`;
      return `₹${amt} < price ₹${this.price} — insufficient balance, transition to qError.`;
    }
    return "—";
  }

  /** Executes one input symbol on the live machine, records it on the tape. */
  step(input) {
    const from = this.current;
    if (from !== "qError") this.lastAmountState = from.startsWith("q") && from !== "qAccept" && from !== "qDead" ? from : this.lastAmountState;
    const to = this.delta(from, input);
    const reason = this.reasonFor(from, input, to);
    this.current = to;
    const entry = { from, input, to, reason, t: Date.now() };

    // Rejected string: every input since the last RESET, ending in the input that caused rejection.
    if ((input === "BUY" || input === "TIMEOUT") && to === this.errorState) {
      const label = (i) => (["5", "10", "20"].includes(i) ? `₹${i}` : i);
      let lastReset = -1;
      for (let i = this.tape.length - 1; i >= 0; i--) {
        if (this.tape[i].input === "RESET") { lastReset = i; break; }
      }
      const seq = [...this.tape.slice(lastReset + 1), entry];
      const amt = this.amountOf(from) ?? this.amountOf(this.lastAmountState) ?? 0;
      entry.rejected = true;
      entry.rejectedString = seq.map((e) => label(e.input)).join(" → ");
      entry.path = seq[0].from + seq.map((e) => ` --${label(e.input)}--> ${e.to}`).join("");
      entry.rejectReason = input === "BUY" ? `Insufficient balance (₹${amt} < ₹${this.price})` : "Inactivity timeout";
    }

    this.tape.push(entry);
    return entry;
  }

  isAccepting(state = this.current) {
    return this.acceptStates.has(state);
  }

  isError(state = this.current) {
    return state === this.errorState;
  }

  isDead(state = this.current) {
    return state === this.deadState;
  }

  /** Returns a compact transition table for the currently relevant states
   *  (amount states that are reachable given MAX/STEP), used by the UI. */
  buildTransitionTable() {
    const rows = [];
    for (const s of this.amountStates) {
      const amt = this.amountOf(s);
      rows.push({
        state: s,
        amount: amt,
        "5": this.delta(s, "5"),
        "10": this.delta(s, "10"),
        "20": this.delta(s, "20"),
        BUY: amt >= this.price ? "qAccept" : "qError",
        RESET: "q0",
      });
    }
    rows.push({ state: "qAccept", amount: null, "5": "qAccept", "10": "qAccept", "20": "qAccept", BUY: "qAccept", RESET: "q0" });
    rows.push({ state: "qError", amount: null, "5": "…", "10": "…", "20": "…", BUY: "qError/qAccept", RESET: "q0" });
    rows.push({ state: "qDead", amount: null, "5": "qDead", "10": "qDead", "20": "qDead", BUY: "qDead", RESET: "q0" });
    return rows;
  }

  formalDefinitionText() {
    return {
      Q: `{ q0, q5, …, q${this.MAX}, qAccept, qError, qDead }  (|Q| = ${this.states.length})`,
      sigma: `{ ${this.alphabet.join(", ")} }`,
      q0: this.startState,
      F: `{ qAccept }`,
    };
  }
}

// exposed globally for the other modules (vanilla, no bundler)
window.DFA = DFA;
