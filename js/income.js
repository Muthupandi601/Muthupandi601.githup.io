/**
 * Income page logic: add/edit/delete income entries, filter & summarize.
 */
(function () {
  "use strict";

  let editingId = null;

  const els = {
    form: document.getElementById("income-form"),
    date: document.getElementById("f-date"),
    source: document.getElementById("f-source"),
    category: document.getElementById("f-category"),
    amount: document.getElementById("f-amount"),
    note: document.getElementById("f-note"),
    error: document.getElementById("form-error"),
    submitBtn: document.getElementById("btn-submit"),
    cancelBtn: document.getElementById("btn-cancel-edit"),
    formTitle: document.getElementById("form-title"),
    body: document.getElementById("income-body"),
    search: document.getElementById("filter-search"),
    filterCategory: document.getElementById("filter-category"),
    filterMonth: document.getElementById("filter-month"),
    clearFilters: document.getElementById("btn-clear-filters"),
    exportPdf: document.getElementById("btn-export-pdf"),
  };

  function populateCategories() {
    MMS.INCOME_CATEGORIES.forEach((cat) => {
      els.category.appendChild(new Option(cat, cat));
      els.filterCategory.appendChild(new Option(cat, cat));
    });
  }

  function resetForm() {
    editingId = null;
    els.form.reset();
    els.date.value = MMS.todayStr();
    els.category.value = MMS.INCOME_CATEGORIES[0];
    els.error.textContent = "";
    els.submitBtn.textContent = "➕ Add Income";
    els.formTitle.textContent = "Add Income";
    els.cancelBtn.hidden = true;
  }

  function startEdit(item) {
    editingId = item.id;
    els.date.value = item.date;
    els.source.value = item.source;
    els.category.value = item.category;
    els.amount.value = item.amount;
    els.note.value = item.note || "";
    els.submitBtn.textContent = "💾 Update Income";
    els.formTitle.textContent = "Edit Income";
    els.cancelBtn.hidden = false;
    els.form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleSubmit(e) {
    e.preventDefault();
    const date = els.date.value;
    const source = els.source.value.trim();
    const category = els.category.value;
    const amount = parseFloat(els.amount.value);
    const note = els.note.value.trim();

    if (!date || !source || !(amount > 0)) {
      els.error.textContent = "Please fill in date, source and a valid amount greater than 0.";
      return;
    }
    els.error.textContent = "";

    const payload = { date, source, category, amount, note };
    if (editingId) {
      MMS.Income.update(editingId, payload);
      MMS.UI.toast("Income updated", "success");
    } else {
      MMS.Income.add(payload);
      MMS.UI.toast("Income added", "success");
    }
    resetForm();
    renderTable();
    renderStats();
  }

  function getFiltered() {
    const q = els.search.value.trim().toLowerCase();
    const cat = els.filterCategory.value;
    const month = els.filterMonth.value; // YYYY-MM
    return MMS.Income.all().filter((x) => {
      if (cat && x.category !== cat) return false;
      if (month && MMS.monthKey(x.date) !== month) return false;
      if (q) {
        const hay = `${x.source} ${x.note || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function renderTable() {
    const list = getFiltered();
    els.body.innerHTML = "";

    if (list.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 6;
      td.className = "empty-state";
      td.innerHTML = '<div class="empty-icon">💵</div>No income entries match your filters.';
      tr.appendChild(td);
      els.body.appendChild(tr);
      return;
    }

    list.forEach((item) => {
      const tr = document.createElement("tr");

      const tdDate = document.createElement("td");
      tdDate.textContent = MMS.formatDate(item.date);

      const tdSource = document.createElement("td");
      tdSource.textContent = item.source;

      const tdCat = document.createElement("td");
      const badge = document.createElement("span");
      badge.className = "badge badge-income";
      badge.textContent = item.category;
      tdCat.appendChild(badge);

      const tdNote = document.createElement("td");
      tdNote.textContent = item.note || "—";
      tdNote.style.color = "var(--text-muted)";

      const tdAmt = document.createElement("td");
      tdAmt.className = "num amount-income";
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
        MMS.UI.confirmAction(`Delete income "${item.source}"?`).then((ok) => {
          if (!ok) return;
          MMS.Income.remove(item.id);
          if (editingId === item.id) resetForm();
          renderTable();
          renderStats();
          MMS.UI.toast("Income deleted", "success");
        });
      });
      tdActions.append(editBtn, delBtn);

      tr.append(tdDate, tdSource, tdCat, tdNote, tdAmt, tdActions);
      els.body.appendChild(tr);
    });
  }

  function renderStats() {
    const all = MMS.Income.all();
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
    return parts.length ? `Filtered by ${parts.join(", ")}` : "All income entries (no filters applied)";
  }

  function exportPdf() {
    const list = getFiltered();
    const total = MMS.sum(list);
    MMS.Print.show({
      title: "Income Statement",
      meta: [`Generated on ${MMS.formatDate(MMS.todayStr())}`, describeFilters()],
      summary: [
        { label: "Total Income", value: MMS.formatCurrency(total) },
        { label: "Entries", value: String(list.length) },
      ],
      sections: [
        {
          heading: "Income Entries",
          columns: [
            { label: "Date" },
            { label: "Source" },
            { label: "Category" },
            { label: "Note" },
            { label: "Amount", align: "right" },
          ],
          rows: list.map((x) => [
            MMS.formatDate(x.date),
            x.source,
            x.category,
            x.note || "—",
            MMS.formatCurrency(x.amount),
          ]),
          totalRow: ["", "", "", "Total", MMS.formatCurrency(total)],
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
  });
})();
