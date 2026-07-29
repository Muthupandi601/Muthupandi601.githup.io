/**
 * Savings page logic: manage goals (CRUD + progress) and saving
 * transactions (CRUD), linked by an optional goalId on each entry.
 */
(function () {
  "use strict";

  let editingGoalId = null;
  let editingEntryId = null;

  const goalEls = {
    form: document.getElementById("goal-form"),
    name: document.getElementById("g-name"),
    target: document.getElementById("g-target"),
    date: document.getElementById("g-date"),
    error: document.getElementById("goal-form-error"),
    submitBtn: document.getElementById("goal-submit-btn"),
    cancelBtn: document.getElementById("goal-cancel-btn"),
    title: document.getElementById("goal-form-title"),
    grid: document.getElementById("goals-grid"),
  };

  const entryEls = {
    form: document.getElementById("entry-form"),
    date: document.getElementById("e-date"),
    goal: document.getElementById("e-goal"),
    amount: document.getElementById("e-amount"),
    storageType: document.getElementById("e-storage-type"),
    bankField: document.getElementById("e-bank-field"),
    bankName: document.getElementById("e-bank-name"),
    note: document.getElementById("e-note"),
    error: document.getElementById("entry-form-error"),
    submitBtn: document.getElementById("entry-submit-btn"),
    cancelBtn: document.getElementById("entry-cancel-btn"),
    title: document.getElementById("entry-form-title"),
    body: document.getElementById("entries-body"),
    filterGoal: document.getElementById("filter-goal"),
    filterStorageType: document.getElementById("filter-storage-type"),
    filterMonth: document.getElementById("filter-month"),
    clearFilters: document.getElementById("btn-clear-filters"),
    exportPdf: document.getElementById("btn-export-pdf"),
  };

  function toggleBankField() {
    entryEls.bankField.hidden = entryEls.storageType.value !== "Bank";
  }

  function savedForGoal(goalId, entries) {
    return entries.filter((e) => e.goalId === goalId).reduce((a, e) => a + Number(e.amount || 0), 0);
  }

  // ---------- Goals ----------

  function resetGoalForm() {
    editingGoalId = null;
    goalEls.form.reset();
    goalEls.error.textContent = "";
    goalEls.submitBtn.textContent = "➕ Add Goal";
    goalEls.title.textContent = "Add Savings Goal";
    goalEls.cancelBtn.hidden = true;
  }

  function startEditGoal(goal) {
    editingGoalId = goal.id;
    goalEls.name.value = goal.name;
    goalEls.target.value = goal.targetAmount;
    goalEls.date.value = goal.targetDate || "";
    goalEls.submitBtn.textContent = "💾 Update Goal";
    goalEls.title.textContent = "Edit Savings Goal";
    goalEls.cancelBtn.hidden = false;
    goalEls.form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleGoalSubmit(e) {
    e.preventDefault();
    const name = goalEls.name.value.trim();
    const targetAmount = parseFloat(goalEls.target.value);
    const targetDate = goalEls.date.value;

    if (!name || !(targetAmount > 0)) {
      goalEls.error.textContent = "Please enter a goal name and a target amount greater than 0.";
      return;
    }
    goalEls.error.textContent = "";

    const payload = { name, targetAmount, targetDate };
    if (editingGoalId) {
      MMS.Goals.update(editingGoalId, payload);
      MMS.UI.toast("Goal updated", "success");
    } else {
      MMS.Goals.add(payload);
      MMS.UI.toast("Goal created", "success");
    }
    resetGoalForm();
    refreshGoalSelects();
    renderGoalsGrid();
    renderStats();
  }

  function deleteGoal(goal) {
    const entries = MMS.Savings.all();
    const linked = entries.filter((e) => e.goalId === goal.id).length;
    const msg = linked
      ? `Delete goal "${goal.name}"? ${linked} saving entr${linked === 1 ? "y" : "ies"} will move to General Savings.`
      : `Delete goal "${goal.name}"?`;

    MMS.UI.confirmAction(msg).then((ok) => {
      if (!ok) return;
      entries
        .filter((e) => e.goalId === goal.id)
        .forEach((e) => MMS.Savings.update(e.id, { goalId: null }));
      MMS.Goals.remove(goal.id);
      if (editingGoalId === goal.id) resetGoalForm();

      refreshGoalSelects();
      renderGoalsGrid();
      renderEntriesTable();
      renderLocationBreakdown();
      renderStats();
      MMS.UI.toast("Goal deleted", "success");
    });
  }

  function renderGoalsGrid() {
    const goals = MMS.Goals.all();
    const entries = MMS.Savings.all();
    goalEls.grid.innerHTML = "";

    if (goals.length === 0) {
      goalEls.grid.innerHTML =
        '<div class="empty-state" style="grid-column:1/-1;"><div class="empty-icon">🎯</div>No savings goals yet. Create one above.</div>';
      return;
    }

    goals.forEach((goal) => {
      const saved = savedForGoal(goal.id, entries);
      const pct = goal.targetAmount > 0 ? Math.min(100, (saved / goal.targetAmount) * 100) : 0;
      const complete = pct >= 100;

      const card = document.createElement("div");
      card.className = "goal-card";

      const top = document.createElement("div");
      top.className = "goal-top";
      const name = document.createElement("span");
      name.className = "goal-name";
      name.textContent = goal.name;
      const amounts = document.createElement("span");
      amounts.className = "goal-amounts";
      amounts.textContent = `${MMS.formatCurrency(saved)} / ${MMS.formatCurrency(goal.targetAmount)}`;
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
      status.textContent = complete
        ? "Goal reached 🎉"
        : goal.targetDate
        ? "Due " + MMS.formatDate(goal.targetDate)
        : "In progress";
      const pctLabel = document.createElement("span");
      pctLabel.textContent = pct.toFixed(0) + "%";
      meta.append(status, pctLabel);

      const actions = document.createElement("div");
      actions.className = "row-actions";
      actions.style.justifyContent = "flex-start";
      const editBtn = document.createElement("button");
      editBtn.className = "btn btn-secondary btn-sm";
      editBtn.textContent = "✏️ Edit";
      editBtn.addEventListener("click", () => startEditGoal(goal));
      const delBtn = document.createElement("button");
      delBtn.className = "btn btn-danger btn-sm";
      delBtn.textContent = "🗑️ Delete";
      delBtn.addEventListener("click", () => deleteGoal(goal));
      actions.append(editBtn, delBtn);

      card.append(top, track, meta, actions);
      goalEls.grid.appendChild(card);
    });
  }

  function refreshGoalSelects() {
    const goals = MMS.Goals.all();
    const currentEntryGoal = entryEls.goal.value;
    const currentFilterGoal = entryEls.filterGoal.value;

    entryEls.goal.innerHTML = '<option value="">General Savings (no goal)</option>';
    entryEls.filterGoal.innerHTML = '<option value="">All goals</option>';
    goals.forEach((g) => {
      entryEls.goal.appendChild(new Option(g.name, g.id));
      entryEls.filterGoal.appendChild(new Option(g.name, g.id));
    });

    if (goals.some((g) => g.id === currentEntryGoal)) entryEls.goal.value = currentEntryGoal;
    if (goals.some((g) => g.id === currentFilterGoal)) entryEls.filterGoal.value = currentFilterGoal;
  }

  // ---------- Saving entries ----------

  function resetEntryForm() {
    editingEntryId = null;
    entryEls.form.reset();
    entryEls.date.value = MMS.todayStr();
    entryEls.goal.value = "";
    entryEls.storageType.value = "Cash";
    toggleBankField();
    entryEls.error.textContent = "";
    entryEls.submitBtn.textContent = "➕ Add Entry";
    entryEls.title.textContent = "Add Saving Entry";
    entryEls.cancelBtn.hidden = true;
  }

  function startEditEntry(item) {
    editingEntryId = item.id;
    entryEls.date.value = item.date;
    entryEls.goal.value = item.goalId || "";
    entryEls.amount.value = item.amount;
    entryEls.storageType.value = item.storageType || "Cash";
    entryEls.bankName.value = item.bankName || "";
    toggleBankField();
    entryEls.note.value = item.note || "";
    entryEls.submitBtn.textContent = "💾 Update Entry";
    entryEls.title.textContent = "Edit Saving Entry";
    entryEls.cancelBtn.hidden = false;
    entryEls.form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleEntrySubmit(e) {
    e.preventDefault();
    const date = entryEls.date.value;
    const goalId = entryEls.goal.value || null;
    const amount = parseFloat(entryEls.amount.value);
    const storageType = entryEls.storageType.value;
    const bankName = storageType === "Bank" ? entryEls.bankName.value.trim() : "";
    const note = entryEls.note.value.trim();

    if (!date || !(amount > 0)) {
      entryEls.error.textContent = "Please fill in date and a valid amount greater than 0.";
      return;
    }
    if (storageType === "Bank" && !bankName) {
      entryEls.error.textContent = "Please enter which bank this saving is in.";
      return;
    }
    entryEls.error.textContent = "";

    const payload = { date, goalId, amount, storageType, bankName, note };
    if (editingEntryId) {
      MMS.Savings.update(editingEntryId, payload);
      MMS.UI.toast("Saving entry updated", "success");
    } else {
      MMS.Savings.add(payload);
      MMS.UI.toast("Saving entry added", "success");
    }
    resetEntryForm();
    renderEntriesTable();
      renderLocationBreakdown();
    renderGoalsGrid();
    renderStats();
  }

  function getFilteredEntries() {
    const goalId = entryEls.filterGoal.value;
    const month = entryEls.filterMonth.value;
    const storageType = entryEls.filterStorageType.value;
    return MMS.Savings.all().filter((x) => {
      if (goalId && x.goalId !== goalId) return false;
      if (month && MMS.monthKey(x.date) !== month) return false;
      if (storageType && (x.storageType || "Cash") !== storageType) return false;
      return true;
    });
  }

  function renderEntriesTable() {
    const goals = MMS.Goals.all();
    const list = getFilteredEntries();
    entryEls.body.innerHTML = "";

    if (list.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 6;
      td.className = "empty-state";
      td.innerHTML = '<div class="empty-icon">🏦</div>No saving entries match your filters.';
      tr.appendChild(td);
      entryEls.body.appendChild(tr);
      return;
    }

    list.forEach((item) => {
      const goal = item.goalId ? goals.find((g) => g.id === item.goalId) : null;
      const tr = document.createElement("tr");

      const tdDate = document.createElement("td");
      tdDate.textContent = MMS.formatDate(item.date);

      const tdGoal = document.createElement("td");
      const badge = document.createElement("span");
      badge.className = "badge " + (goal ? "badge-saving" : "badge-neutral");
      badge.textContent = goal ? goal.name : "General Savings";
      tdGoal.appendChild(badge);

      const tdWhere = document.createElement("td");
      const whereBadge = document.createElement("span");
      const isBank = (item.storageType || "Cash") === "Bank";
      whereBadge.className = "badge " + (isBank ? "badge-saving" : "badge-neutral");
      whereBadge.textContent = isBank ? `🏦 ${item.bankName || "Bank"}` : "💵 Cash";
      tdWhere.appendChild(whereBadge);

      const tdNote = document.createElement("td");
      tdNote.textContent = item.note || "—";
      tdNote.style.color = "var(--text-muted)";

      const tdAmt = document.createElement("td");
      tdAmt.className = "num amount-saving";
      tdAmt.textContent = MMS.formatCurrency(item.amount);

      const tdActions = document.createElement("td");
      tdActions.className = "row-actions";
      const editBtn = document.createElement("button");
      editBtn.className = "btn btn-secondary btn-sm";
      editBtn.textContent = "✏️";
      editBtn.title = "Edit";
      editBtn.addEventListener("click", () => startEditEntry(item));
      const delBtn = document.createElement("button");
      delBtn.className = "btn btn-danger btn-sm";
      delBtn.textContent = "🗑️";
      delBtn.title = "Delete";
      delBtn.addEventListener("click", () => {
        MMS.UI.confirmAction("Delete this saving entry?").then((ok) => {
          if (!ok) return;
          MMS.Savings.remove(item.id);
          if (editingEntryId === item.id) resetEntryForm();
          renderEntriesTable();
      renderLocationBreakdown();
          renderGoalsGrid();
          renderStats();
          MMS.UI.toast("Saving entry deleted", "success");
        });
      });
      tdActions.append(editBtn, delBtn);

      tr.append(tdDate, tdGoal, tdWhere, tdNote, tdAmt, tdActions);
      entryEls.body.appendChild(tr);
    });
  }

  function computeLocationBreakdown(entries) {
    const groups = {};
    entries.forEach((e) => {
      const isBank = (e.storageType || "Cash") === "Bank";
      const key = isBank ? e.bankName || "Bank" : "Cash";
      if (!groups[key]) groups[key] = { key, total: 0, count: 0, isBank };
      groups[key].total += Number(e.amount) || 0;
      groups[key].count += 1;
    });

    const total = MMS.sum(entries);
    return Object.values(groups)
      .map((g) => Object.assign(g, { pct: total > 0 ? (g.total / total) * 100 : 0 }))
      .sort((a, b) => b.total - a.total);
  }

  function renderLocationBreakdown() {
    const wrap = document.getElementById("location-grid");
    const entries = MMS.Savings.all();

    if (entries.length === 0) {
      wrap.innerHTML =
        '<div class="empty-state" style="grid-column:1/-1;"><div class="empty-icon">🏦</div>No savings recorded yet.</div>';
      return;
    }

    const breakdown = computeLocationBreakdown(entries);

    wrap.innerHTML = "";
    breakdown.forEach((g) => {
      const pct = g.pct;
      const key = g.key;

      const card = document.createElement("div");
      card.className = "goal-card";
      const top = document.createElement("div");
      top.className = "goal-top";
      const name = document.createElement("span");
      name.className = "goal-name";
      name.textContent = (g.isBank ? "🏦 " : "💵 ") + key;
      const amounts = document.createElement("span");
      amounts.className = "goal-amounts";
      amounts.textContent = MMS.formatCurrency(g.total);
      top.append(name, amounts);

      const meta = document.createElement("div");
      meta.className = "goal-meta";
      const countLabel = document.createElement("span");
      countLabel.textContent = `${g.count} ${g.count === 1 ? "entry" : "entries"}`;
      const pctLabel = document.createElement("span");
      pctLabel.textContent = pct.toFixed(0) + "% of total";
      meta.append(countLabel, pctLabel);

      card.append(top, meta);
      wrap.appendChild(card);
    });
  }

  function renderStats() {
    const entries = MMS.Savings.all();
    const goals = MMS.Goals.all();
    document.getElementById("stat-total").textContent = MMS.formatCurrency(MMS.sum(entries));
    document.getElementById("stat-count").textContent = `${entries.length} entries`;

    let active = 0;
    let completed = 0;
    goals.forEach((g) => {
      const saved = savedForGoal(g.id, entries);
      if (g.targetAmount > 0 && saved >= g.targetAmount) completed++;
      else active++;
    });
    document.getElementById("stat-active-goals").textContent = active;
    document.getElementById("stat-completed-goals").textContent = completed;
  }

  function initFilters() {
    [entryEls.filterGoal, entryEls.filterStorageType, entryEls.filterMonth].forEach((el) =>
      el.addEventListener("input", renderEntriesTable)
    );
    entryEls.clearFilters.addEventListener("click", () => {
      entryEls.filterGoal.value = "";
      entryEls.filterStorageType.value = "";
      entryEls.filterMonth.value = "";
      renderEntriesTable();
      renderLocationBreakdown();
    });
  }

  function describeEntryFilters() {
    const parts = [];
    const goalId = entryEls.filterGoal.value;
    if (goalId) {
      const goal = MMS.Goals.get(goalId);
      parts.push(`Goal: ${goal ? goal.name : "Unknown"}`);
    }
    if (entryEls.filterStorageType.value) parts.push(`Type: ${entryEls.filterStorageType.value}`);
    if (entryEls.filterMonth.value) parts.push(`Month: ${MMS.monthLabel(entryEls.filterMonth.value)}`);
    return parts.length ? `Entries filtered by ${parts.join(", ")}` : "All saving entries (no filters applied)";
  }

  function exportPdf() {
    const goals = MMS.Goals.all();
    const allEntries = MMS.Savings.all();
    const filteredEntries = getFilteredEntries();
    const filteredTotal = MMS.sum(filteredEntries);

    const goalRows = goals.map((g) => {
      const saved = savedForGoal(g.id, allEntries);
      const pct = g.targetAmount > 0 ? Math.min(100, (saved / g.targetAmount) * 100) : 0;
      return [
        g.name,
        MMS.formatCurrency(g.targetAmount),
        MMS.formatCurrency(saved),
        pct.toFixed(0) + "%",
        pct >= 100 ? "Reached" : "In progress",
      ];
    });

    const entryRows = filteredEntries.map((item) => {
      const goal = item.goalId ? goals.find((g) => g.id === item.goalId) : null;
      const isBank = (item.storageType || "Cash") === "Bank";
      return [
        MMS.formatDate(item.date),
        goal ? goal.name : "General Savings",
        isBank ? item.bankName || "Bank" : "Cash",
        item.note || "—",
        MMS.formatCurrency(item.amount),
      ];
    });

    const locationRows = computeLocationBreakdown(allEntries).map((g) => [
      (g.isBank ? "🏦 " : "💵 ") + g.key,
      MMS.formatCurrency(g.total),
      String(g.count),
      g.pct.toFixed(0) + "%",
    ]);

    MMS.Print.show({
      title: "Savings Statement",
      meta: [`Generated on ${MMS.formatDate(MMS.todayStr())}`, describeEntryFilters()],
      summary: [
        { label: "Total Saved (shown)", value: MMS.formatCurrency(filteredTotal) },
        { label: "Entries", value: String(filteredEntries.length) },
        { label: "Goals", value: String(goals.length) },
      ],
      sections: [
        {
          heading: "Savings Goals Progress",
          columns: [
            { label: "Goal" },
            { label: "Target", align: "right" },
            { label: "Saved", align: "right" },
            { label: "Progress", align: "right" },
            { label: "Status" },
          ],
          rows: goalRows,
        },
        {
          heading: "Savings by Location",
          columns: [
            { label: "Location" },
            { label: "Amount", align: "right" },
            { label: "Entries", align: "right" },
            { label: "% of Total", align: "right" },
          ],
          rows: locationRows,
        },
        {
          heading: "Saving Entries",
          columns: [
            { label: "Date" },
            { label: "Goal" },
            { label: "Where" },
            { label: "Note" },
            { label: "Amount", align: "right" },
          ],
          rows: entryRows,
          totalRow: ["", "", "", "Total", MMS.formatCurrency(filteredTotal)],
        },
      ],
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    resetGoalForm();
    resetEntryForm();
    refreshGoalSelects();

    goalEls.form.addEventListener("submit", handleGoalSubmit);
    goalEls.cancelBtn.addEventListener("click", resetGoalForm);
    entryEls.form.addEventListener("submit", handleEntrySubmit);
    entryEls.cancelBtn.addEventListener("click", resetEntryForm);
    entryEls.storageType.addEventListener("change", toggleBankField);
    initFilters();
    entryEls.exportPdf.addEventListener("click", exportPdf);

    renderGoalsGrid();
    renderEntriesTable();
      renderLocationBreakdown();
    renderStats();
  });
})();
