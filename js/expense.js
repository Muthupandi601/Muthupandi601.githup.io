/**
 * Expense page logic: add/edit/delete expense entries, filter, summarize
 * and render the category-breakdown donut chart.
 */
(function () {
  "use strict";

  let editingId = null;

  const els = {
    form: document.getElementById("expense-form"),
    date: document.getElementById("f-date"),
    category: document.getElementById("f-category"),
    amount: document.getElementById("f-amount"),
    note: document.getElementById("f-note"),
    error: document.getElementById("form-error"),
    submitBtn: document.getElementById("btn-submit"),
    cancelBtn: document.getElementById("btn-cancel-edit"),
    formTitle: document.getElementById("form-title"),
    body: document.getElementById("expense-body"),
    search: document.getElementById("filter-search"),
    filterCategory: document.getElementById("filter-category"),
    filterMonth: document.getElementById("filter-month"),
    clearFilters: document.getElementById("btn-clear-filters"),
    chartCanvas: document.getElementById("chart-category"),
    legend: document.getElementById("legend-category"),
    exportPdf: document.getElementById("btn-export-pdf"),
  };

  function populateCategories() {
    MMS.EXPENSE_CATEGORIES.forEach((cat) => {
      els.category.appendChild(new Option(cat, cat));
      els.filterCategory.appendChild(new Option(cat, cat));
    });
  }

  function resetForm() {
    editingId = null;
    els.form.reset();
    els.date.value = MMS.todayStr();
    els.category.value = MMS.EXPENSE_CATEGORIES[0];
    els.error.textContent = "";
    els.submitBtn.textContent = "➕ Add Expense";
    els.formTitle.textContent = "Add Expense";
    els.cancelBtn.hidden = true;
  }

  function startEdit(item) {
    editingId = item.id;
    els.date.value = item.date;
    els.category.value = item.category;
    els.amount.value = item.amount;
    els.note.value = item.note || "";
    els.submitBtn.textContent = "💾 Update Expense";
    els.formTitle.textContent = "Edit Expense";
    els.cancelBtn.hidden = false;
    els.form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleSubmit(e) {
    e.preventDefault();
    const date = els.date.value;
    const category = els.category.value;
    const amount = parseFloat(els.amount.value);
    const note = els.note.value.trim();

    if (!date || !(amount > 0)) {
      els.error.textContent = "Please fill in date and a valid amount greater than 0.";
      return;
    }
    els.error.textContent = "";

    const payload = { date, category, amount, note };
    if (editingId) {
      MMS.Expense.update(editingId, payload);
      MMS.UI.toast("Expense updated", "success");
    } else {
      MMS.Expense.add(payload);
      MMS.UI.toast("Expense added", "success");
    }
    resetForm();
    renderTable();
    renderStats();
    renderChart();
  }

  function getFiltered() {
    const q = els.search.value.trim().toLowerCase();
    const cat = els.filterCategory.value;
    const month = els.filterMonth.value;
    return MMS.Expense.all().filter((x) => {
      if (cat && x.category !== cat) return false;
      if (month && MMS.monthKey(x.date) !== month) return false;
      if (q && !(x.note || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }

  function renderTable() {
    const list = getFiltered();
    els.body.innerHTML = "";

    if (list.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 5;
      td.className = "empty-state";
      td.innerHTML = '<div class="empty-icon">🧾</div>No expense entries match your filters.';
      tr.appendChild(td);
      els.body.appendChild(tr);
      return;
    }

    list.forEach((item) => {
      const tr = document.createElement("tr");

      const tdDate = document.createElement("td");
      tdDate.textContent = MMS.formatDate(item.date);

      const tdCat = document.createElement("td");
      const badge = document.createElement("span");
      badge.className = "badge badge-expense";
      badge.textContent = item.category;
      tdCat.appendChild(badge);

      const tdNote = document.createElement("td");
      tdNote.textContent = item.note || "—";
      tdNote.style.color = "var(--text-muted)";

      const tdAmt = document.createElement("td");
      tdAmt.className = "num amount-expense";
      tdAmt.textContent = MMS.formatCurrency(item.amount);

      const tdActions = document.createElement("td");
      tdActions.className = "row-actions";
      const editBtn = document.createElement("button");
      editBtn.className = "btn btn-secondary btn-sm";
      editBtn.textContent = "✏️";
      editBtn.title = "Edit";
      editBtn.addEventListener("click", () => startEdit(item));
      const delBtn = document.createElement("button");
      delBtn.className = "btn btn-danger btn-sm";
      delBtn.textContent = "🗑️";
      delBtn.title = "Delete";
      delBtn.addEventListener("click", () => {
        MMS.UI.confirmAction(`Delete this ${item.category} expense?`).then((ok) => {
          if (!ok) return;
          MMS.Expense.remove(item.id);
          if (editingId === item.id) resetForm();
          renderTable();
          renderStats();
          renderChart();
          MMS.UI.toast("Expense deleted", "success");
        });
      });
      tdActions.append(editBtn, delBtn);

      tr.append(tdDate, tdCat, tdNote, tdAmt, tdActions);
      els.body.appendChild(tr);
    });
  }

  function renderStats() {
    const all = MMS.Expense.all();
    const total = MMS.sum(all);
    document.getElementById("stat-total").textContent = MMS.formatCurrency(total);
    document.getElementById("stat-count").textContent = `${all.length} entries`;

    const thisMonth = MMS.monthKey(MMS.todayStr());
    const monthTotal = MMS.sum(all.filter((x) => MMS.monthKey(x.date) === thisMonth));
    document.getElementById("stat-month").textContent = MMS.formatCurrency(monthTotal);

    const grouped = MMS.groupSumByCategory(all);
    const top = Object.keys(grouped).sort((a, b) => grouped[b] - grouped[a])[0];
    document.getElementById("stat-top-category").textContent = top || "—";
    document.getElementById("stat-top-category-sub").textContent = top
      ? MMS.formatCurrency(grouped[top]) + " total"
      : "No data yet";
  }

  function renderChart() {
    const all = MMS.Expense.all();
    const grouped = MMS.groupSumByCategory(all);
    const entries = Object.keys(grouped)
      .map((label) => ({ label, value: grouped[label], color: MMS.colorForLabel(label) }))
      .sort((a, b) => b.value - a.value);

    if (entries.length === 0) {
      els.chartCanvas.style.display = "none";
      els.legend.innerHTML = '<div class="chart-empty">No expenses recorded yet</div>';
      return;
    }
    els.chartCanvas.style.display = "";
    const total = entries.reduce((a, x) => a + x.value, 0);
    entries[0].totalLabel = MMS.formatCurrency(total);
    MMS.Charts.donut(els.chartCanvas, entries);

    els.legend.innerHTML = "";
    entries.forEach((e) => {
      const item = document.createElement("span");
      item.className = "legend-item";
      const dot = document.createElement("span");
      dot.className = "legend-dot";
      dot.style.background = e.color;
      item.appendChild(dot);
      item.appendChild(document.createTextNode(`${e.label} · ${MMS.formatCurrency(e.value)}`));
      els.legend.appendChild(item);
    });
  }

  function initFilters() {
    [els.search, els.filterCategory, els.filterMonth].forEach((el) =>
      el.addEventListener("input", renderTable)
    );
    els.clearFilters.addEventListener("click", () => {
      els.search.value = "";
      els.filterCategory.value = "";
      els.filterMonth.value = "";
      renderTable();
    });
  }

  function describeFilters() {
    const parts = [];
    if (els.filterCategory.value) parts.push(`Category: ${els.filterCategory.value}`);
    if (els.filterMonth.value) parts.push(`Month: ${MMS.monthLabel(els.filterMonth.value)}`);
    if (els.search.value.trim()) parts.push(`Search: "${els.search.value.trim()}"`);
    return parts.length ? `Filtered by ${parts.join(", ")}` : "All expense entries (no filters applied)";
  }

  function exportPdf() {
    const list = getFiltered();
    const total = MMS.sum(list);
    const grouped = MMS.groupSumByCategory(list);
    const catRows = Object.keys(grouped)
      .sort((a, b) => grouped[b] - grouped[a])
      .map((cat) => [
        cat,
        MMS.formatCurrency(grouped[cat]),
        total > 0 ? ((grouped[cat] / total) * 100).toFixed(1) + "%" : "0%",
      ]);

    MMS.Print.show({
      title: "Expense Statement",
      meta: [`Generated on ${MMS.formatDate(MMS.todayStr())}`, describeFilters()],
      summary: [
        { label: "Total Expense", value: MMS.formatCurrency(total) },
        { label: "Entries", value: String(list.length) },
      ],
      sections: [
        {
          heading: "Category Breakdown",
          columns: [{ label: "Category" }, { label: "Amount", align: "right" }, { label: "% of Total", align: "right" }],
          rows: catRows,
        },
        {
          heading: "Expense Entries",
          columns: [
            { label: "Date" },
            { label: "Category" },
            { label: "Note" },
            { label: "Amount", align: "right" },
          ],
          rows: list.map((x) => [MMS.formatDate(x.date), x.category, x.note || "—", MMS.formatCurrency(x.amount)]),
          totalRow: ["", "", "Total", MMS.formatCurrency(total)],
        },
      ],
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    populateCategories();
    resetForm();
    els.form.addEventListener("submit", handleSubmit);
    els.cancelBtn.addEventListener("click", () => resetForm());
    initFilters();
    els.exportPdf.addEventListener("click", exportPdf);
    renderTable();
    renderStats();
    renderChart();

    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(renderChart, 150);
    });
    window.addEventListener("mms:theme-change", renderChart);
  });
})();
