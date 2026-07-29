/**
 * MMS (Money Management System) - shared data layer & utilities.
 * All persistence is done via localStorage. Every page includes this
 * file before its own page-specific script.
 */
const MMS = (function () {
  "use strict";

  const KEYS = {
    income: "mms_income",
    expense: "mms_expense",
    goals: "mms_goals",
    savings: "mms_savings",
    debts: "mms_debts",
    debtPayments: "mms_debt_payments",
    theme: "mms_theme",
  };

  const CURRENCY = "₹"; // ₹

  const INCOME_CATEGORIES = [
    "Salary",
    "Business",
    "Freelance",
    "Investment",
    "Gift",
    "Other",
  ];

  const EXPENSE_CATEGORIES = [
    "Food & Dining",
    "Transport",
    "Housing & Rent",
    "Utilities",
    "Health",
    "Entertainment",
    "Shopping",
    "Education",
    "Other",
  ];

  const DEBT_CATEGORIES = [
    "Credit Card",
    "Personal Loan",
    "Home Loan",
    "Vehicle Loan",
    "Education Loan",
    "Borrowed from Friend/Family",
    "Other",
  ];

  const PALETTE = [
    "#6366f1",
    "#ec4899",
    "#f59e0b",
    "#10b981",
    "#06b6d4",
    "#8b5cf6",
    "#ef4444",
    "#14b8a6",
    "#f97316",
    "#84cc16",
  ];

  function readRaw(key) {
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error("MMS: failed reading", key, e);
      return [];
    }
  }

  function writeRaw(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function todayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  function formatCurrency(amount) {
    const n = Number(amount) || 0;
    return (
      CURRENCY +
      n.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  }

  function formatDate(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr + "T00:00:00");
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  function monthKey(dateStr) {
    return (dateStr || "").slice(0, 7); // YYYY-MM
  }

  function monthLabel(key) {
    const [y, m] = (key || "").split("-");
    if (!y || !m) return key || "";
    const d = new Date(Number(y), Number(m) - 1, 1);
    return d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str === null || str === undefined ? "" : String(str);
    return div.innerHTML;
  }

  function colorForLabel(label) {
    const str = String(label || "");
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    const idx = Math.abs(hash) % PALETTE.length;
    return PALETTE[idx];
  }

  function sum(list) {
    return list.reduce((acc, x) => acc + (Number(x.amount) || 0), 0);
  }

  function sortByDateDesc(list) {
    return list.slice().sort((a, b) => {
      const d = (b.date || "").localeCompare(a.date || "");
      if (d !== 0) return d;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }

  function makeCollection(key) {
    return {
      all() {
        return sortByDateDesc(readRaw(key));
      },
      get(id) {
        return readRaw(key).find((x) => x.id === id) || null;
      },
      add(item) {
        const list = readRaw(key);
        const record = Object.assign({ id: uid(), createdAt: Date.now() }, item);
        list.push(record);
        writeRaw(key, list);
        return record;
      },
      update(id, patch) {
        const list = readRaw(key);
        const idx = list.findIndex((x) => x.id === id);
        if (idx === -1) return null;
        list[idx] = Object.assign({}, list[idx], patch);
        writeRaw(key, list);
        return list[idx];
      },
      remove(id) {
        const list = readRaw(key);
        const next = list.filter((x) => x.id !== id);
        writeRaw(key, next);
        return next.length !== list.length;
      },
      clear() {
        writeRaw(key, []);
      },
    };
  }

  const Income = makeCollection(KEYS.income);
  const Expense = makeCollection(KEYS.expense);
  const Goals = makeCollection(KEYS.goals);
  const Savings = makeCollection(KEYS.savings);
  const Debts = makeCollection(KEYS.debts);
  const DebtPayments = makeCollection(KEYS.debtPayments);

  function paidForDebt(debtId, payments) {
    return (payments || DebtPayments.all())
      .filter((p) => p.debtId === debtId)
      .reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
  }

  function outstandingForDebt(debt, payments) {
    const paid = paidForDebt(debt.id, payments);
    return Math.max(0, (Number(debt.principalAmount) || 0) - paid);
  }

  function totalOutstandingDebt() {
    const payments = DebtPayments.all();
    return Debts.all().reduce((acc, d) => acc + outstandingForDebt(d, payments), 0);
  }

  function totals() {
    const income = sum(Income.all());
    const expense = sum(Expense.all());
    const saving = sum(Savings.all());
    const debtPaid = sum(DebtPayments.all());
    const debtOutstanding = totalOutstandingDebt();
    return {
      income,
      expense,
      saving,
      debtPaid,
      debtOutstanding,
      balance: income - expense - saving - debtPaid,
    };
  }

  function groupSumByCategory(list) {
    const map = {};
    list.forEach((x) => {
      const cat = x.category || "Other";
      map[cat] = (map[cat] || 0) + (Number(x.amount) || 0);
    });
    return map;
  }

  function groupSumByMonth(list) {
    const map = {};
    list.forEach((x) => {
      const key = monthKey(x.date);
      if (!key) return;
      map[key] = (map[key] || 0) + (Number(x.amount) || 0);
    });
    return map;
  }

  function lastNMonthKeys(n) {
    const keys = [];
    const now = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      keys.push(
        d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0")
      );
    }
    return keys;
  }

  function exportData() {
    return {
      app: "money-management-system",
      version: 1,
      exportedAt: new Date().toISOString(),
      income: readRaw(KEYS.income),
      expense: readRaw(KEYS.expense),
      goals: readRaw(KEYS.goals),
      savings: readRaw(KEYS.savings),
      debts: readRaw(KEYS.debts),
      debtPayments: readRaw(KEYS.debtPayments),
    };
  }

  function importData(data) {
    if (!data || typeof data !== "object") {
      throw new Error("Invalid backup file");
    }
    if (Array.isArray(data.income)) writeRaw(KEYS.income, data.income);
    if (Array.isArray(data.expense)) writeRaw(KEYS.expense, data.expense);
    if (Array.isArray(data.goals)) writeRaw(KEYS.goals, data.goals);
    if (Array.isArray(data.savings)) writeRaw(KEYS.savings, data.savings);
    if (Array.isArray(data.debts)) writeRaw(KEYS.debts, data.debts);
    if (Array.isArray(data.debtPayments)) writeRaw(KEYS.debtPayments, data.debtPayments);
  }

  function clearAll() {
    Income.clear();
    Expense.clear();
    Goals.clear();
    Savings.clear();
    Debts.clear();
    DebtPayments.clear();
  }

  function loadDemoData() {
    clearAll();
    const today = new Date();
    const iso = (offsetDays) => {
      const d = new Date(today);
      d.setDate(d.getDate() - offsetDays);
      return d.toISOString().slice(0, 10);
    };

    [
      { date: iso(2), source: "Acme Corp", category: "Salary", amount: 55000, note: "Monthly salary" },
      { date: iso(20), source: "Website project", category: "Freelance", amount: 12000, note: "Client invoice" },
      { date: iso(35), source: "Dividend payout", category: "Investment", amount: 2200, note: "" },
      { date: iso(50), source: "Acme Corp", category: "Salary", amount: 55000, note: "Monthly salary" },
    ].forEach((i) => Income.add(i));

    [
      { date: iso(1), category: "Food & Dining", amount: 850, note: "Groceries" },
      { date: iso(3), category: "Transport", amount: 400, note: "Fuel" },
      { date: iso(5), category: "Housing & Rent", amount: 15000, note: "Monthly rent" },
      { date: iso(8), category: "Entertainment", amount: 600, note: "Movie night" },
      { date: iso(15), category: "Utilities", amount: 2100, note: "Electricity + internet" },
      { date: iso(22), category: "Shopping", amount: 3200, note: "Clothes" },
      { date: iso(33), category: "Health", amount: 1200, note: "Pharmacy" },
      { date: iso(47), category: "Food & Dining", amount: 950, note: "Groceries" },
    ].forEach((e) => Expense.add(e));

    const emergencyGoal = Goals.add({ name: "Emergency Fund", targetAmount: 100000, targetDate: "" });
    const tripGoal = Goals.add({ name: "Goa Trip", targetAmount: 30000, targetDate: "" });

    [
      { date: iso(2), goalId: emergencyGoal.id, amount: 5000, storageType: "Bank", bankName: "HDFC Bank", note: "" },
      { date: iso(20), goalId: emergencyGoal.id, amount: 5000, storageType: "Bank", bankName: "HDFC Bank", note: "" },
      { date: iso(5), goalId: tripGoal.id, amount: 3000, storageType: "Cash", bankName: "", note: "" },
      { date: iso(35), goalId: null, amount: 1500, storageType: "Bank", bankName: "SBI", note: "General savings" },
    ].forEach((s) => Savings.add(s));

    const creditCardDebt = Debts.add({ name: "HDFC Credit Card", category: "Credit Card", principalAmount: 45000, interestRate: 36, dueDate: "", note: "" });
    const vehicleLoan = Debts.add({ name: "Bike Loan", category: "Vehicle Loan", principalAmount: 80000, interestRate: 11, dueDate: "", note: "" });

    [
      { date: iso(4), debtId: creditCardDebt.id, amount: 8000, note: "Minimum + extra" },
      { date: iso(34), debtId: creditCardDebt.id, amount: 6000, note: "" },
      { date: iso(10), debtId: vehicleLoan.id, amount: 5000, note: "EMI" },
      { date: iso(40), debtId: vehicleLoan.id, amount: 5000, note: "EMI" },
    ].forEach((p) => DebtPayments.add(p));
  }

  function hasAnyData() {
    return (
      readRaw(KEYS.income).length +
        readRaw(KEYS.expense).length +
        readRaw(KEYS.goals).length +
        readRaw(KEYS.savings).length +
        readRaw(KEYS.debts).length +
        readRaw(KEYS.debtPayments).length >
      0
    );
  }

  return {
    KEYS,
    CURRENCY,
    INCOME_CATEGORIES,
    EXPENSE_CATEGORIES,
    DEBT_CATEGORIES,
    Income,
    Expense,
    Goals,
    Savings,
    Debts,
    DebtPayments,
    uid,
    todayStr,
    formatCurrency,
    formatDate,
    monthKey,
    monthLabel,
    escapeHtml,
    colorForLabel,
    sum,
    totals,
    groupSumByCategory,
    groupSumByMonth,
    lastNMonthKeys,
    paidForDebt,
    outstandingForDebt,
    totalOutstandingDebt,
    exportData,
    importData,
    clearAll,
    loadDemoData,
    hasAnyData,
  };
})();
