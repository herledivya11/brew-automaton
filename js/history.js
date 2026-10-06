/* ==========================================================================
   history.js — transaction history table: add / render / clear / export
   ========================================================================== */

class TransactionHistory {
  constructor(tbodyEl) {
    this.tbody = tbodyEl;
    this.records = [];
  }

  add(record) {
    // record: { time, coffee, paid, change, status }
    this.records.unshift(record);
    this.render();
  }

  clear() {
    this.records = [];
    this.render();
  }

  render() {
    if (this.records.length === 0) {
      this.tbody.innerHTML = `<tr class="empty-row"><td colspan="5">No transactions yet — insert a coin to begin.</td></tr>`;
      return;
    }
    this.tbody.innerHTML = this.records
      .map((r) => {
        const badgeClass = r.status === "Accepted" ? "badge-success" : r.status === "Rejected" ? "badge-error" : "badge-warning";
        return `<tr>
          <td class="mono">${r.time}</td>
          <td>${r.coffee}</td>
          <td class="mono">₹${r.paid}</td>
          <td class="mono">₹${r.change}</td>
          <td><span class="badge ${badgeClass}">${r.status}</span></td>
        </tr>`;
      })
      .join("");
  }

  exportCSV() {
    const header = "Time,Coffee,Paid,Change,Status\n";
    const rows = this.records.map((r) => `${r.time},${r.coffee},${r.paid},${r.change},${r.status}`).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transaction-history.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
}

window.TransactionHistory = TransactionHistory;
