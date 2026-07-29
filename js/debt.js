/**
 * Debt page logic: manage debts (CRUD + payoff progress) and debt
 * payments (CRUD), linked by a required debtId on each payment.
 */
(function () {
  "use strict";

  let editingDebtId = null;
  let editingPaymentId = null;

  const debtEls = {
    form: document.getElementById("debt-form"),
    name: document.getElementById("d-name"),
    category: document.getElementById("d-category"),
    principal: document.getElementById("d-principal"),
    rate: document.getElementById("d-rate"),
    due: document.getElementById("d-due"),
    note: document.getElementById("d-note"),
    error: document.getElementById("debt-form-error"),
    submitBtn: document.getElementById("debt-submit-btn"),
    cancelBtn: document.getElementById("debt-cancel-btn"),
    title: document.getElementById("debt-form-title"),
    grid: document.getElementById("debts-grid"),
  };

  const paymentEls = {
    form: document.getElementById("payment-form"),
    date: document.getElementById("p-date"),
    debt: document.getElementById("p-debt"),
    amount: document.getElementById("p-amount"),
    note: document.getElementById("p-note"),
    error: document.getElementById("payment-form-error"),
    submitBtn: document.getElementById("payment-submit-btn"),
    cancelBtn: document.getElementById("payment-cancel-btn"),
    title: document.getElementById("payment-form-title"),
    body: document.getElementById("payments-body"),
    filterDebt: document.getElementById("filter-debt"),
    filterMonth: document.getElementById("filter-month"),
    clearFilters: document.getElementById("btn-clear-filters"),
    exportPdf: document.getElementById("btn-export-pdf"),
  };

  function populateCategories() {
    MMS.DEBT_CATEGORIES.forEach((cat) => debtEls.category.appendChild(new Option(cat, cat)));
  }

  // ---------- Debts ----------

  function resetDebtForm() {
    editingDebtId = null;
    debtEls.form.reset();
    debtEls.category.value = MMS.DEBT_CATEGORIES[0];
    debtEls.error.textContent = "";
    debtEls.submitBtn.textContent = "➕ Add Debt";
    debtEls.title.textContent = "Add Debt";
    debtEls.cancelBtn.hidden = true;
  }

  function startEditDebt(debt) {
    editingDebtId = debt.id;
    debtEls.name.value = debt.name;
    debtEls.category.value = debt.category;
    debtEls.principal.value = debt.principalAmount;
    debtEls.rate.value = debt.interestRate || "";
    debtEls.due.value = debt.dueDate || "";
    debtEls.note.value = debt.note || "";
    debtEls.submitBtn.textContent = "💾 Update Debt";
    debtEls.title.textContent = "Edit Debt";
    debtEls.cancelBtn.hidden = false;
    debtEls.form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleDebtSubmit(e) {
    e.preventDefault();
    const name = debtEls.name.value.trim();
    const category = debtEls.category.value;
    const principalAmount = parseFloat(debtEls.principal.value);
    const interestRate = debtEls.rate.value ? parseFloat(debtEls.rate.value) : null;
    const dueDate = debtEls.due.value;
    const note = debtEls.note.value.trim();

    if (!name || !(principalAmount > 0)) {
      debtEls.error.textContent = "Please enter a debt name and a principal amount greater than 0.";
      return;
    }
    debtEls.error.textContent = "";

    const payload = { name, category, principalAmount, interestRate, dueDate, note };
    if (editingDebtId) {
      MMS.Debts.update(editingDebtId, payload);
      MMS.UI.toast("Debt updated", "success");
    } else {
      MMS.Debts.add(payload);
      MMS.UI.toast("Debt added", "success");
    }
    resetDebtForm();
    refreshDebtSelects();
    renderDebtsGrid();
    renderStats();
  }

  function deleteDebt(debt) {
    const payments = MMS.DebtPayments.all();
    const linked = payments.filter((p) => p.debtId === debt.id);
    const msg = linked.length
      ? `Delete debt "${debt.name}"? ${linked.length} payment${linked.length === 1 ? "" : "s"} totaling ${MMS.formatCurrency(
          MMS.sum(linked)
        )} will also be deleted.`
      : `Delete debt "${debt.name}"?`;

    MMS.UI.confirmAction(msg).then((ok) => {
      if (!ok) return;
      linked.forEach((p) => MMS.DebtPayments.remove(p.id));
      MMS.Debts.remove(debt.id);
      if (editingDebtId === debt.id) resetDebtForm();

      refreshDebtSelects();
      renderDebtsGrid();
      renderPaymentsTable();
      renderStats();
      MMS.UI.toast("Debt deleted", "success");
    });
  }

  function renderDebtsGrid() {
    const debts = MMS.Debts.all();
    const payments = MMS.DebtPayments.all();
    debtEls.grid.innerHTML = "";

    if (debts.length === 0) {
      debtEls.grid.innerHTML =
        '<div class="empty-state" style="grid-column:1/-1;"><div class="empty-icon">💳</div>No debts yet. Add one above to start tracking payoff progress.</div>';
      return;
    }

    debts.forEach((debt) => {
      const paid = MMS.paidForDebt(debt.id, payments);
      const outstanding = MMS.outstandingForDebt(debt, payments);
      const pct = debt.principalAmount > 0 ? Math.min(100, (paid / debt.principalAmount) * 100) : 0;
      const complete = outstanding <= 0;

      const card = document.createElement("div");
      card.className = "goal-card";

      const top = document.createElement("div");
      top.className = "goal-top";
      const name = document.createElement("span");
      name.className = "goal-name";
      name.textContent = debt.name;
      const amounts = document.createElement("span");
      amounts.className = "goal-amounts";
      amounts.textContent = `${MMS.formatCurrency(paid)} / ${MMS.formatCurrency(debt.principalAmount)}`;
      top.append(name, amounts);

      const track = document.createElement("div");
      track.className = "progress-track";
      const fill = document.createElement("div");
      fill.className = "progress-fill" + (complete ? " complete" : "");
      fill.style.width = pct + "%";
      track.appendChild(fill);

      const meta = document.createElement("div");
      meta.className = "goal-meta";
      const status = document.createElement("span");
      status.textContent = complete ? "Paid off 🎉" : `Outstanding: ${MMS.formatCurrency(outstanding)}`;
      const pctLabel = document.createElement("span");
      pctLabel.textContent = pct.toFixed(0) + "% paid";
      meta.append(status, pctLabel);

      const actions = document.createElement("div");
      actions.className = "row-actions";
      actions.style.justifyContent = "flex-start";
      const editBtn = document.createElement("button");
      editBtn.className = "btn btn-secondary btn-sm";
      editBtn.textContent = "✏️ Edit";
      editBtn.addEventListener("click", () => startEditDebt(debt));
      const delBtn = document.createElement("button");
      delBtn.className = "btn btn-danger btn-sm";
      delBtn.textContent = "🗑️ Delete";
      delBtn.addEventListener("click", () => deleteDebt(debt));
      actions.append(editBtn, delBtn);

      card.append(top, track, meta, actions);
      debtEls.grid.appendChild(card);
    });
  }

  function refreshDebtSelects() {
    const debts = MMS.Debts.all();
    const currentPaymentDebt = paymentEls.debt.value;
    const currentFilterDebt = paymentEls.filterDebt.value;

    paymentEls.filterDebt.innerHTML = '<option value="">All debts</option>';
    debts.forEach((d) => paymentEls.filterDebt.appendChild(new Option(d.name, d.id)));
    if (debts.some((d) => d.id === currentFilterDebt)) paymentEls.filterDebt.value = currentFilterDebt;

    if (debts.length === 0) {
      paymentEls.debt.innerHTML = '<option value="">No debts yet — add one first</option>';
      paymentEls.submitBtn.disabled = true;
    } else {
      paymentEls.debt.innerHTML = "";
      debts.forEach((d) => paymentEls.debt.appendChild(new Option(d.name, d.id)));
      paymentEls.submitBtn.disabled = false;
      if (debts.some((d) => d.id === currentPaymentDebt)) paymentEls.debt.value = currentPaymentDebt;
    }
  }

  // ---------- Debt payments ----------

  function resetPaymentForm() {
    editingPaymentId = null;
    paymentEls.form.reset();
    paymentEls.date.value = MMS.todayStr();
    paymentEls.error.textContent = "";
    paymentEls.submitBtn.textContent = "➕ Add Payment";
    paymentEls.title.textContent = "Add Debt Payment";
    paymentEls.cancelBtn.hidden = true;
  }

  function startEditPayment(item) {
    editingPaymentId = item.id;
    paymentEls.date.value = item.date;
    paymentEls.debt.value = item.debtId || "";
    paymentEls.amount.value = item.amount;
    paymentEls.note.value = item.note || "";
    paymentEls.submitBtn.textContent = "💾 Update Payment";
    paymentEls.title.textContent = "Edit Debt Payment";
    paymentEls.cancelBtn.hidden = false;
    paymentEls.form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handlePaymentSubmit(e) {
    e.preventDefault();
    const date = paymentEls.date.value;
    const debtId = paymentEls.debt.value || null;
    const amount = parseFloat(paymentEls.amount.value);
    const note = paymentEls.note.value.trim();

    if (!date || !debtId || !(amount > 0)) {
      paymentEls.error.textContent = "Please select a debt, a date, and a valid amount greater than 0.";
      return;
    }
    paymentEls.error.textContent = "";

    const payload = { date, debtId, amount, note };
    if (editingPaymentId) {
      MMS.DebtPayments.update(editingPaymentId, payload);
      MMS.UI.toast("Payment updated", "success");
    } else {
      MMS.DebtPayments.add(payload);
      MMS.UI.toast("Payment added", "success");
    }
    resetPaymentForm();
    renderPaymentsTable();
    renderDebtsGrid();
    renderStats();
  }

  function getFilteredPayments() {
    const debtId = paymentEls.filterDebt.value;
    const month = paymentEls.filterMonth.value;
    return MMS.DebtPayments.all().filter((x) => {
      if (debtId && x.debtId !== debtId) return false;
      if (month && MMS.monthKey(x.date) !== month) return false;
      return true;
    });
  }

  function renderPaymentsTable() {
    const debts = MMS.Debts.all();
    const list = getFilteredPayments();
    paymentEls.body.innerHTML = "";

    if (list.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 5;
      td.className = "empty-state";
      td.innerHTML = '<div class="empty-icon">💳</div>No debt payments match your filters.';
      tr.appendChild(td);
      paymentEls.body.appendChild(tr);
      return;
    }

    list.forEach((item) => {
      const debt = debts.find((d) => d.id === item.debtId);
      const tr = document.createElement("tr");

      const tdDate = document.createElement("td");
      tdDate.textContent = MMS.formatDate(item.date);

      const tdDebt = document.createElement("td");
      const badge = document.createElement("span");
      badge.className = "badge badge-debt";
      badge.textContent = debt ? debt.name : "Deleted Debt";
      tdDebt.appendChild(badge);

      const tdNote = document.createElement("td");
      tdNote.textContent = item.note || "—";
      tdNote.style.color = "var(--text-muted)";

      const tdAmt = document.createElement("td");
      tdAmt.className = "num amount-debt";
      tdAmt.textContent = MMS.formatCurrency(item.amount);

      const tdActions = document.createElement("td");
      tdActions.className = "row-actions";
      const editBtn = document.createElement("button");
      editBtn.className = "btn btn-secondary btn-sm";
      editBtn.textContent = "✏️";
      editBtn.title = "Edit";
      editBtn.addEventListener("click", () => startEditPayment(item));
      const delBtn = document.createElement("button");
      delBtn.className = "btn btn-danger btn-sm";
      delBtn.textContent = "🗑️";
      delBtn.title = "Delete";
      delBtn.addEventListener("click", () => {
        MMS.UI.confirmAction("Delete this debt payment?").then((ok) => {
          if (!ok) return;
          MMS.DebtPayments.remove(item.id);
          if (editingPaymentId === item.id) resetPaymentForm();
          renderPaymentsTable();
          renderDebtsGrid();
          renderStats();
          MMS.UI.toast("Payment deleted", "success");
        });
      });
      tdActions.append(editBtn, delBtn);

      tr.append(tdDate, tdDebt, tdNote, tdAmt, tdActions);
      paymentEls.body.appendChild(tr);
    });
  }

  function renderStats() {
    const debts = MMS.Debts.all();
    const payments = MMS.DebtPayments.all();

    document.getElementById("stat-outstanding").textContent = MMS.formatCurrency(MMS.totalOutstandingDebt());
    document.getElementById("stat-debt-count").textContent = `${debts.length} debts`;
    document.getElementById("stat-paid").textContent = MMS.formatCurrency(MMS.sum(payments));
    document.getElementById("stat-payment-count").textContent = `${payments.length} payments`;

    let active = 0;
    let cleared = 0;
    debts.forEach((d) => {
      if (MMS.outstandingForDebt(d, payments) <= 0 && d.principalAmount > 0) cleared++;
      else active++;
    });
    document.getElementById("stat-active-debts").textContent = active;
    document.getElementById("stat-cleared-debts").textContent = cleared;
  }

  function initFilters() {
    [paymentEls.filterDebt, paymentEls.filterMonth].forEach((el) =>
      el.addEventListener("input", renderPaymentsTable)
    );
    paymentEls.clearFilters.addEventListener("click", () => {
      paymentEls.filterDebt.value = "";
      paymentEls.filterMonth.value = "";
      renderPaymentsTable();
    });
  }

  function describePaymentFilters() {
    const parts = [];
    const debtId = paymentEls.filterDebt.value;
    if (debtId) {
      const debt = MMS.Debts.get(debtId);
      parts.push(`Debt: ${debt ? debt.name : "Unknown"}`);
    }
    if (paymentEls.filterMonth.value) parts.push(`Month: ${MMS.monthLabel(paymentEls.filterMonth.value)}`);
    return parts.length ? `Payments filtered by ${parts.join(", ")}` : "All debt payments (no filters applied)";
  }

  function exportPdf() {
    const debts = MMS.Debts.all();
    const allPayments = MMS.DebtPayments.all();
    const filteredPayments = getFilteredPayments();
    const filteredTotal = MMS.sum(filteredPayments);

    const debtRows = debts.map((d) => {
      const paid = MMS.paidForDebt(d.id, allPayments);
      const outstanding = MMS.outstandingForDebt(d, allPayments);
      const pct = d.principalAmount > 0 ? Math.min(100, (paid / d.principalAmount) * 100) : 0;
      return [
        d.name,
        d.category,
        MMS.formatCurrency(d.principalAmount),
        MMS.formatCurrency(paid),
        MMS.formatCurrency(outstanding),
        pct.toFixed(0) + "%",
        outstanding <= 0 ? "Paid off" : "Active",
      ];
    });

    const paymentRows = filteredPayments.map((item) => {
      const debt = debts.find((d) => d.id === item.debtId);
      return [MMS.formatDate(item.date), debt ? debt.name : "Deleted Debt", item.note || "—", MMS.formatCurrency(item.amount)];
    });

    const clearedCount = debts.filter((d) => MMS.outstandingForDebt(d, allPayments) <= 0 && d.principalAmount > 0).length;

    MMS.Print.show({
      title: "Debt Statement",
      meta: [`Generated on ${MMS.formatDate(MMS.todayStr())}`, describePaymentFilters()],
      summary: [
        { label: "Total Outstanding", value: MMS.formatCurrency(MMS.totalOutstandingDebt()) },
        { label: "Total Paid (shown)", value: MMS.formatCurrency(filteredTotal) },
        { label: "Debts", value: String(debts.length) },
        { label: "Debts Cleared", value: String(clearedCount) },
      ],
      sections: [
        {
          heading: "Debts Progress",
          columns: [
            { label: "Debt" },
            { label: "Category" },
            { label: "Principal", align: "right" },
            { label: "Paid", align: "right" },
            { label: "Outstanding", align: "right" },
            { label: "Progress", align: "right" },
            { label: "Status" },
          ],
          rows: debtRows,
        },
        {
          heading: "Debt Payments",
          columns: [{ label: "Date" }, { label: "Debt" }, { label: "Note" }, { label: "Amount", align: "right" }],
          rows: paymentRows,
          totalRow: ["", "", "Total", MMS.formatCurrency(filteredTotal)],
        },
      ],
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    populateCategories();
    resetDebtForm();
    resetPaymentForm();
    refreshDebtSelects();

    debtEls.form.addEventListener("submit", handleDebtSubmit);
    debtEls.cancelBtn.addEventListener("click", resetDebtForm);
    paymentEls.form.addEventListener("submit", handlePaymentSubmit);
    paymentEls.cancelBtn.addEventListener("click", resetPaymentForm);
    initFilters();
    paymentEls.exportPdf.addEventListener("click", exportPdf);

    renderDebtsGrid();
    renderPaymentsTable();
    renderStats();
  });
})();
