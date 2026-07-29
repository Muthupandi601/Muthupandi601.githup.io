/**
 * MMS.Charts - tiny dependency-free canvas chart helpers.
 * Only what the dashboard/reports need: a donut chart and a grouped
 * bar chart. No external libraries, so the app works fully offline.
 */
MMS.Charts = (function () {
  "use strict";

  function readCssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name);
    return v && v.trim() ? v.trim() : fallback;
  }

  // Scales the canvas backing store for crisp rendering on hi-dpi screens
  // and returns a 2d context already scaled to CSS pixel coordinates.
  function prepareCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(rect.width, canvas.width, 10);
    const h = Math.max(rect.height || canvas.height, canvas.height, 10);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }

  /**
   * items: [{ label, value, color }]
   */
  function donut(canvas, items) {
    const { ctx, w, h } = prepareCanvas(canvas);
    const total = items.reduce((a, x) => a + x.value, 0);
    const cx = w / 2;
    const cy = h / 2;
    const outerR = Math.min(w, h) / 2 - 6;
    const innerR = outerR * 0.62;

    if (total <= 0) return;

    let start = -Math.PI / 2;
    items.forEach((item) => {
      const frac = item.value / total;
      const end = start + frac * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, outerR, start, end);
      ctx.closePath();
      ctx.fillStyle = item.color;
      ctx.fill();
      start = end;
    });

    // punch the hole
    const bg = readCssVar("--surface", "#ffffff");
    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
    ctx.fillStyle = bg;
    ctx.fill();

    // center label
    ctx.fillStyle = readCssVar("--text", "#1c2333");
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "600 15px -apple-system, Segoe UI, Roboto, sans-serif";
    ctx.fillText(items[0] && items[0].totalLabel ? items[0].totalLabel : "", cx, cy - 8);
  }

  /**
   * labels: [string] (x-axis groups, e.g. months)
   * series: [{ name, color, data: [numbers] }]
   */
  function groupedBars(canvas, labels, series) {
    const { ctx, w, h } = prepareCanvas(canvas);
    const padding = { top: 16, right: 12, bottom: 26, left: 44 };
    const plotW = w - padding.left - padding.right;
    const plotH = h - padding.top - padding.bottom;
    if (plotW <= 0 || plotH <= 0 || labels.length === 0) return;

    let max = 0;
    labels.forEach((_, i) => {
      series.forEach((s) => {
        if (s.data[i] > max) max = s.data[i];
      });
    });
    if (max <= 0) max = 1;
    // round max up to a "nice" number
    const magnitude = Math.pow(10, Math.floor(Math.log10(max)));
    max = Math.ceil(max / magnitude) * magnitude;

    const gridColor = readCssVar("--border", "#e3e7f1");
    const textColor = readCssVar("--text-muted", "#667085");

    // gridlines + y labels
    const steps = 4;
    ctx.strokeStyle = gridColor;
    ctx.fillStyle = textColor;
    ctx.font = "11px -apple-system, Segoe UI, Roboto, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let i = 0; i <= steps; i++) {
      const y = padding.top + plotH - (plotH * i) / steps;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.globalAlpha = 0.6;
      ctx.stroke();
      ctx.globalAlpha = 1;
      const val = (max * i) / steps;
      ctx.fillText(compactNumber(val), padding.left - 8, y);
    }

    const groupW = plotW / labels.length;
    const barGap = 4;
    const barW = Math.min(18, (groupW - barGap * (series.length + 1)) / series.length);
    const seriesTotalW = barW * series.length + barGap * (series.length - 1);

    labels.forEach((label, gi) => {
      const groupX = padding.left + groupW * gi + (groupW - seriesTotalW) / 2;
      series.forEach((s, si) => {
        const val = s.data[gi] || 0;
        const barH = (val / max) * plotH;
        const x = groupX + si * (barW + barGap);
        const y = padding.top + plotH - barH;
        ctx.fillStyle = s.color;
        roundRectTop(ctx, x, y, barW, Math.max(barH, val > 0 ? 2 : 0), 3);
        ctx.fill();
      });

      ctx.fillStyle = textColor;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(label, padding.left + groupW * gi + groupW / 2, h - 8);
    });
  }

  function roundRectTop(ctx, x, y, w, h, r) {
    if (h <= 0) {
      ctx.beginPath();
      return;
    }
    r = Math.min(r, w / 2, h);
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
  }

  function compactNumber(n) {
    if (Math.abs(n) >= 100000) return (n / 100000).toFixed(n % 100000 === 0 ? 0 : 1) + "L";
    if (Math.abs(n) >= 1000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + "k";
    return String(Math.round(n));
  }

  return { donut, groupedBars, cssVar: readCssVar };
})();
