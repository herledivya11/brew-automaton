/* ==========================================================================
   vending.js — the vending machine itself: coffee menu, balance, coin
   handling, purchase / change-return flow, statistics. All state changes
   are expressed as DFA input symbols fed through `this.dfa`.
   ========================================================================== */

const COFFEE_MENU = [
  {
    id: "espresso",
    name: "Espresso",
    price: 30,
    desc: "Bold, concentrated shot with a rich crema.",
    img: "https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?q=80&w=400&auto=format&fit=crop",
  },
  {
    id: "americano",
    name: "Americano",
    price: 50,
    desc: "Espresso lengthened with hot water, smooth body.",
    img: "https://images.unsplash.com/photo-1497935586351-b67a49e012bf?q=80&w=400&auto=format&fit=crop",
  },
  {
    id: "cappuccino",
    name: "Cappuccino",
    price: 60,
    desc: "Equal parts espresso, steamed milk and foam.",
    img: "https://images.unsplash.com/photo-1534778101976-62847782c213?q=80&w=400&auto=format&fit=crop",
  },
  {
    id: "latte",
    name: "Latte",
    price: 70,
    desc: "Silky steamed milk with a light layer of foam.",
    img: "https://images.unsplash.com/photo-1561047029-3000c68339ca?q=80&w=400&auto=format&fit=crop",
  },
  {
    id: "mocha",
    name: "Mocha",
    price: 80,
    desc: "Espresso with chocolate and steamed milk.",
    img: "https://images.unsplash.com/photo-1541167760496-1628856ab772?q=80&w=400&auto=format&fit=crop",
  },
];

class VendingMachine {
  constructor(dfa, sound, history) {
    this.dfa = dfa;
    this.sound = sound;
    this.history = history;
    this.selectedCoffee = null;
    this.status = "idle"; // idle | waiting | processing | dispensing | returning | timeout
    this.stats = {
      transactions: 0, accepted: 0, rejected: 0, timeouts: 0,
      errors: 0, coinsInserted: 0, revenue: 0, coffeeSold: 0,
    };
    this.listeners = {};
  }

  on(evt, fn) { (this.listeners[evt] = this.listeners[evt] || []).push(fn); }
  emit(evt, payload) { (this.listeners[evt] || []).forEach((fn) => fn(payload)); }

  selectCoffee(id) {
    const coffee = COFFEE_MENU.find((c) => c.id === id);
    if (!coffee) return;
    this.selectedCoffee = coffee;
    this.dfa.setPrice(coffee.price);
    this.emit("coffee-selected", coffee);
  }

  setStatus(status) {
    this.status = status;
    this.emit("status", status);
  }

  /** Insert a coin (or the "invalid" demo token). Returns the DFA tape entry. */
  insertCoin(value) {
    if (this.status === "dispensing" || this.status === "returning") return null;
    const input = String(value);
    const entry = this.dfa.step(input);
    this.stats.coinsInserted += 1;

    if (entry.to === "qDead") {
      this.setStatus("rejected");
      this.stats.rejected += 1;
      this.stats.errors += 1;
    } else {
      this.setStatus("waiting");
    }
    this.emit("transition", entry);
    return entry;
  }

  currentAmount() {
    return this.dfa.amountOf(this.dfa.current) ?? this.dfa.amountOf(this.dfa.lastAmountState) ?? 0;
  }

  /** Attempts a purchase. Returns { ok, entry, change } */
  buy() {
    if (!this.selectedCoffee) {
      this.emit("need-coffee");
      return { ok: false, reason: "no-coffee" };
    }
    if (this.status === "dispensing" || this.status === "returning") return { ok: false, reason: "busy" };

    const amountBefore = this.currentAmount();
    const entry = this.dfa.step("BUY");
    this.emit("transition", entry);
    this.stats.transactions += 1;

    if (entry.to === "qAccept") {
      const change = amountBefore - this.selectedCoffee.price;
      this.stats.accepted += 1;
      this.stats.revenue += this.selectedCoffee.price;
      this.stats.coffeeSold += 1;
      this.setStatus("processing");
      return { ok: true, entry, change, coffee: this.selectedCoffee, paid: amountBefore };
    } else {
      this.stats.rejected += 1;
      this.stats.errors += 1;
      this.setStatus("error");
      return { ok: false, entry, reason: "insufficient", needed: this.selectedCoffee.price - amountBefore };
    }
  }

  /** Timeout: feeds the TIMEOUT symbol to the DFA (-> qError), shown as a rejected string. */
  timeout() {
    const entry = this.dfa.step("TIMEOUT");
    if (!this.selectedCoffee) {
      entry.rejectReason = "Coffee selection timeout";
      entry.reason = "Timeout — no coffee was selected in time, transition to qError.";
    }
    this.emit("transition", entry);
    this.setStatus("timeout");
    return entry;
  }

  /** Records history + resets DFA back to q0 (manual, auto, or post-purchase). */
  reset(reasonStatus = "reset") {
    const entry = this.dfa.step("RESET");
    this.emit("transition", entry);
    this.setStatus(reasonStatus);
    return entry;
  }

  recordTransaction({ coffee, paid, change, status }) {
    this.history.add({
      time: new Date().toLocaleTimeString(),
      coffee: coffee ? coffee.name : "—",
      paid: paid ?? 0,
      change: change ?? 0,
      status,
    });
  }

  getStatsView() {
    return [
      { label: "Transactions", value: this.stats.transactions },
      { label: "Accepted", value: this.stats.accepted },
      { label: "Rejected", value: this.stats.rejected },
      { label: "Timeouts", value: this.stats.timeouts },
      { label: "Errors", value: this.stats.errors },
      { label: "Coins Inserted", value: this.stats.coinsInserted },
      { label: "Revenue", value: `₹${this.stats.revenue}` },
      { label: "Coffee Sold", value: this.stats.coffeeSold },
    ];
  }
}

window.COFFEE_MENU = COFFEE_MENU;
window.VendingMachine = VendingMachine;
