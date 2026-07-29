/**
 * Dashboard page logic: summary cards, charts, goals snapshot,
 * recent transactions, and the data-management panel.
 */
(function () {
  "use strict";

  function renderStats() {
    const t = MMS.totals();
    document.getElementById("stat-income").textContent = MMS.formatCurrency(t.income);
    document.getElementById("stat-expense").textContent = MMS.formatCurrency(t.expense);
    document.getElementById("stat-saving").textContent = MMS.formatCurrency(t.saving);
    document.getElementById("stat-debt").textContent = MMS.formatCurrency(t.debtOutstanding);
    document.getElementById("stat-balance").textContent = MMS.formatCurrency(t.balance);

    document.getElementById("stat-income-sub").textContent = `${MMS.Income.all().length} entries`;
    document.getElementById("stat-expense-sub").textContent = `${MMS.Expense.all().length} entries`;
    document.getElementById("stat-saving-sub").textContent = `${MMS.Goals.all().length} goals`;
    document.getElementById("stat-debt-sub").textContent = `${MMS.Debts.all().length} debts`;
  }

  function renderExpenseCategoryChart() {
    const canvas = document.getElementById("chart-expense-category");
    const legend = document.getElementById("legend-expense-category");
    const expenses = MMS.Expense.all();
    const grouped = MMS.groupSumByCategory(expenses);
    const entries = Object.keys(grouped)
      .map((label) => ({ label, value: grouped[label], color: MMS.colorForLabel(label) }))
      .sort((a, b) => b.value - a.value);

    if (entries.length === 0) {
      canvas.style.display = "none";
      legend.innerHTML = '<div class="chart-empty">No expenses recorded yet</div>';
      return;
    }
    canvas.style.display = "";
    const total = entries.reduce((a, x) => a + x.value, 0);
    entries[0].totalLabel = MMS.formatCurrency(total);
    MMS.Charts.donut(canvas, entries);

    legend.innerHTML = "";
    entries.forEach((e) => {
      const item = document.createElement("span");
      item.className = "legend-item";
      const dot = document.createElement("span");
      dot.className = "legend-dot";
      dot.style.background = e.color;
      item.appendChild(dot);
      item.appendChild(document.createTextNode(`${e.label} · ${MMS.formatCurrency(e.value)}`));
      legend.appendChild(item);
    });
  }

  function renderMonthlyTrendChart() {
    const canvas = document.getElementById("chart-monthly-trend");
    const months = MMS.lastNMonthKeys(6);
    const incomeByMonth = MMS.groupSumByMonth(MMS.Income.all());
    const expenseByMonth = MMS.groupSumByMonth(MMS.Expense.all());
    const savingByMonth = MMS.groupSumByMonth(MMS.Savings.all());
    const debtByMonth = MMS.groupSumByMonth(MMS.DebtPayments.all());

    const hasAny =
      Object.keys(incomeByMonth).length ||
      Object.keys(expenseByMonth).length ||
      Object.keys(savingByMonth).length ||
      Object.keys(debtByMonth).length;

    if (!hasAny) {
      canvas.style.display = "none";
      let empty = canvas.parentElement.querySelector(".chart-empty");
      if (!empty) {
        empty = document.createElement("div");
        empty.className = "chart-empty";
        empty.textContent = "No data yet — add some income or expenses";
        canvas.parentElement.insertBefore(empty, canvas.nextSibling);
      }
      return;
    }
    canvas.style.display = "";
    const existingEmpty = canvas.parentElement.querySelector(".chart-empty");
    if (existingEmpty) existingEmpty.remove();

    const labels = months.map(MMS.monthLabel);
    const series = [
      { name: "Income", color: MMS.Charts.cssVar("--income", "#16a34a"), data: months.map((m) => incomeByMonth[m] || 0) },
      { name: "Expense", color: MMS.Charts.cssVar("--expense", "#e11d48"), data: months.map((m) => expenseByMonth[m] || 0) },
      { name: "Savings", color: MMS.Charts.cssVar("--saving", "#0891b2"), data: months.map((m) => savingByMonth[m] || 0) },
      { name: "Debt Payments", color: MMS.Charts.cssVar("--debt", "#d97706"), data: months.map((m) => debtByMonth[m] || 0) },
    ];
    MMS.Charts.groupedBars(canvas, labels, series);
  }

  function renderGoals() {
    const wrap = document.getElementById("dash-goals");
    const goals = MMS.Goals.all();
    if (goals.length === 0) {
      wrap.innerHTML = '<div class="empty-state"><div class="empty-icon">🏦</div>No savings goals yet. Create one on the Savings page.</div>';
      return;
    }
    const savings = MMS.Savings.all();
    wrap.innerHTML = "";
    goals.slice(0, 4).forEach((goal) => {
      const saved = savings.filter((s) => s.goalId === goal.id).reduce((a, s) => a + Number(s.amount || 0), 0);
      const pct = goal.targetAmount > 0 ? Math.min(100, (saved / goal.targetAmount) * 100) : 0;

      const card = document.createElement("div");
      card.className = "goal-card";
      card.innerHTML = `
        <div class="goal-top">
          <span class="goal-name"></span>
          <span class="goal-amounts"></span>
        </div>
        <div class="progress-track"><div class="progress-fill${pct >= 100 ? " complete" : ""}" style="width:${pct}%"></div></div>
        <div class="goal-meta"><span></span><span>${pct.toFixed(0)}%</span></div>
      `;
      card.querySelector(".goal-name").textContent = goal.name;
      card.querySelector(".goal-amounts").textContent = `${MMS.formatCurrency(saved)} / ${MMS.formatCurrency(goal.targetAmount)}`;
      card.querySelector(".goal-meta span").textContent = pct >= 100 ? "Goal reached 🎉" : "In progress";
      wrap.appendChild(card);
    });
  }

  function renderDebts() {
    const wrap = document.getElementById("dash-debts");
    const debts = MMS.Debts.all();
    if (debts.length === 0) {
      wrap.innerHTML = '<div class="empty-state"><div class="empty-icon">💳</div>No debts tracked. Add one on the Debt page.</div>';
      return;
    }
    const payments = MMS.DebtPayments.all();
    wrap.innerHTML = "";
    debts.slice(0, 4).forEach((debt) => {
      const paid = MMS.paidForDebt(debt.id, payments);
      const outstanding = MMS.outstandingForDebt(debt, payments);
      const pct = debt.principalAmount > 0 ? Math.min(100, (paid / debt.principalAmount) * 100) : 0;
      const complete = outstanding <= 0;

      const card = document.createElement("div");
      card.className = "goal-card";
      card.innerHTML = `
        <div class="goal-top">
          <span class="goal-name"></span>
          <span class="goal-amounts"></span>
        </div>
        <div class="progress-track"><div class="progress-fill${complete ? " complete" : ""}" style="width:${pct}%"></div></div>
        <div class="goal-meta"><span></span><span>${pct.toFixed(0)}% paid</span></div>
      `;
      card.querySelector(".goal-name").textContent = debt.name;
      card.querySelector(".goal-amounts").textContent = `${MMS.formatCurrency(paid)} / ${MMS.formatCurrency(debt.principalAmount)}`;
      card.querySelector(".goal-meta span").textContent = complete ? "Paid off 🎉" : `Outstanding: ${MMS.formatCurrency(outstanding)}`;
      wrap.appendChild(card);
    });
  }

  function renderRecentTransactions() {
    const income = MMS.Income.all().map((x) => ({ ...x, type: "income", desc: x.source || x.category || "Income" }));
    const expense = MMS.Expense.all().map((x) => ({ ...x, type: "expense", desc: x.category || "Expense" }));
    const goals = MMS.Goals.all();
    const savings = MMS.Savings.all().map((x) => {
      const goal = x.goalId ? goals.find((g) => g.id === x.goalId) : null;
      return { ...x, type: "saving", desc: goal ? goal.name : "General Savings" };
    });
    const debts = MMS.Debts.all();
    const debtPayments = MMS.DebtPayments.all().map((x) => {
      const debt = x.debtId ? debts.find((d) => d.id === x.debtId) : null;
      return { ...x, type: "debt", desc: debt ? debt.name : "Deleted Debt" };
    });

    const all = income.concat(expense, savings, debtPayments).sort((a, b) => {
      const d = (b.date || "").localeCompare(a.date || "");
      return d !== 0 ? d : (b.createdAt || 0) - (a.createdAt || 0);
    });

    const body = document.getElementById("recent-tx-body");
    body.innerHTML = "";
    if (all.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 4;
      td.className = "empty-state";
      td.innerHTML = '<div class="empty-icon">📄</div>No transactions yet';
      tr.appendChild(td);
      body.appendChild(tr);
      return;
    }

    const badgeText = { income: "Income", expense: "Expense", saving: "Saving", debt: "Debt" };
    const sign = { income: "+", expense: "−", saving: "−", debt: "−" };

    all.slice(0, 8).forEach((tx) => {
      const tr = document.createElement("tr");

      const tdDate = document.createElement("td");
      tdDate.textContent = MMS.formatDate(tx.date);

      const tdType = document.createElement("td");
      const badge = document.createElement("span");
      badge.className = `badge badge-${tx.type}`;
      badge.textContent = badgeText[tx.type];
      tdType.appendChild(badge);

      const tdDesc = document.createElement("td");
      tdDesc.textContent = tx.desc;

      const tdAmt = document.createElement("td");
      tdAmt.className = `num amount-${tx.type}`;
      tdAmt.textContent = `${sign[tx.type]} ${MMS.formatCurrency(tx.amount)}`;

      tr.append(tdDate, tdType, tdDesc, tdAmt);
      body.appendChild(tr);
    });
  }

  function renderAll() {
    renderStats();
    renderExpenseCategoryChart();
    renderMonthlyTrendChart();
    renderGoals();
    renderDebts();
    renderRecentTransactions();
  }

  function buildLedger() {
    const goals = MMS.Goals.all();
    const income = MMS.Income.all().map((x) => ({
      date: x.date,
      createdAt: x.createdAt || 0,
      type: "Income",
      desc: x.source || x.category || "Income",
      credit: Number(x.amount) || 0,
      debit: 0,
    }));
    const expense = MMS.Expense.all().map((x) => ({
      date: x.date,
      createdAt: x.createdAt || 0,
      type: "Expense",
      desc: x.category + (x.note ? " – " + x.note : ""),
      credit: 0,
      debit: Number(x.amount) || 0,
    }));
    const savings = MMS.Savings.all().map((x) => {
      const goal = x.goalId ? goals.find((g) => g.id === x.goalId) : null;
      return {
        date: x.date,
        createdAt: x.createdAt || 0,
        type: "Saving",
        desc: goal ? goal.name : "General Savings",
        credit: 0,
        debit: Number(x.amount) || 0,
      };
    });
    const debts = MMS.Debts.all();
    const debtPayments = MMS.DebtPayments.all().map((x) => {
      const debt = x.debtId ? debts.find((d) => d.id === x.debtId) : null;
      return {
        date: x.date,
        createdAt: x.createdAt || 0,
        type: "Debt Payment",
        desc: debt ? debt.name : "Deleted Debt",
        credit: 0,
        debit: Number(x.amount) || 0,
      };
    });

    const all = income.concat(expense, savings, debtPayments).sort((a, b) => {
      const d = (a.date || "").localeCompare(b.date || "");
      return d !== 0 ? d : a.createdAt - b.createdAt;
    });

    let running = 0;
    return all.map((tx) => {
      running += tx.credit - tx.debit;
      return [
        MMS.formatDate(tx.date),
        tx.type,
        tx.desc,
        tx.credit ? MMS.formatCurrency(tx.credit) : "—",
        tx.debit ? MMS.formatCurrency(tx.debit) : "—",
        MMS.formatCurrency(running),
      ];
    });
  }

  function exportStatementPdf() {
    const t = MMS.totals();
    const ledgerRows = buildLedger();

    MMS.Print.show({
      title: "Account Statement",
      meta: [`Generated on ${MMS.formatDate(MMS.todayStr())}`, "All transactions, oldest to newest"],
      summary: [
        { label: "Total Income", value: MMS.formatCurrency(t.income) },
        { label: "Total Expense", value: MMS.formatCurrency(t.expense) },
        { label: "Total Savings", value: MMS.formatCurrency(t.saving) },
        { label: "Debt Payments", value: MMS.formatCurrency(t.debtPaid) },
        { label: "Outstanding Debt", value: MMS.formatCurrency(t.debtOutstanding) },
        { label: "Available Balance", value: MMS.formatCurrency(t.balance) },
      ],
      sections: [
        {
          heading: "Transaction Ledger",
          columns: [
            { label: "Date" },
            { label: "Type" },
            { label: "Description" },
            { label: "Credit", align: "right" },
            { label: "Debit", align: "right" },
            { label: "Balance", align: "right" },
          ],
          rows: ledgerRows,
          totalRow: ["", "", "", "", "Available Balance", MMS.formatCurrency(t.balance)],
        },
      ],
    });
  }

  function initDataManagement() {
    document.getElementById("btn-export-statement").addEventListener("click", exportStatementPdf);

    document.getElementById("btn-export").addEventListener("click", () => {
      const data = MMS.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `money-manager-backup-${MMS.todayStr()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      MMS.UI.toast("Backup file downloaded", "success");
    });

    const fileInput = document.getElementById("file-import");
    document.getElementById("btn-import").addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
      const file = fileInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          MMS.importData(data);
          renderAll();
          MMS.UI.toast("Data imported successfully", "success");
        } catch (e) {
          MMS.UI.toast("Import failed: invalid backup file", "error");
        } finally {
          fileInput.value = "";
        }
      };
      reader.readAsText(file);
    });

    document.getElementById("btn-demo").addEventListener("click", () => {
      MMS.UI.confirmAction("Load demo data? This will replace any existing data.").then((ok) => {
        if (!ok) return;
        MMS.loadDemoData();
        renderAll();
        MMS.UI.toast("Demo data loaded", "success");
      });
    });

    document.getElementById("btn-clear").addEventListener("click", () => {
      MMS.UI.confirmAction("Clear ALL data? This cannot be undone.").then((ok) => {
        if (!ok) return;
        MMS.clearAll();
        renderAll();
        MMS.UI.toast("All data cleared", "success");
      });
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    renderAll();
    initDataManagement();

    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        renderExpenseCategoryChart();
        renderMonthlyTrendChart();
      }, 150);
    });
    window.addEventListener("mms:theme-change", () => {
      renderExpenseCategoryChart();
      renderMonthlyTrendChart();
    });
  });
})();
