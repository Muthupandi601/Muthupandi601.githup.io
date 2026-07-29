/**
 * Shared UI wiring: nav highlighting, mobile menu, theme toggle, toasts.
 * Included on every page, after storage.js.
 */
MMS.UI = (function () {
  "use strict";

  function toast(message, type) {
    let stack = document.querySelector(".toast-stack");
    if (!stack) {
      stack = document.createElement("div");
      stack.className = "toast-stack";
      document.body.appendChild(stack);
    }
    const el = document.createElement("div");
    el.className = "toast" + (type ? " " + type : "");
    el.textContent = message;
    stack.appendChild(el);
    setTimeout(() => {
      el.style.opacity = "0";
      el.style.transition = "opacity .2s ease";
      setTimeout(() => el.remove(), 200);
    }, 2800);
  }

  // Custom confirm modal (returns a Promise<boolean>) instead of the native
  // window.confirm(), which renders inconsistently and blocks the event loop.
  function confirmAction(message) {
    return new Promise((resolve) => {
      let overlay = document.querySelector(".modal-overlay");
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.className = "modal-overlay";
        overlay.innerHTML =
          '<div class="modal-box" role="alertdialog" aria-modal="true">' +
          '<div class="modal-head"><h3>Please confirm</h3></div>' +
          '<p class="confirm-message"></p>' +
          '<div class="form-actions" style="margin-top:1.25rem;">' +
          '<button type="button" class="btn btn-danger confirm-yes">Yes, continue</button>' +
          '<button type="button" class="btn btn-secondary confirm-no">Cancel</button>' +
          "</div></div>";
        document.body.appendChild(overlay);
      }

      overlay.querySelector(".confirm-message").textContent = message || "Are you sure?";
      const yesBtn = overlay.querySelector(".confirm-yes");
      const noBtn = overlay.querySelector(".confirm-no");

      function cleanup(result) {
        overlay.classList.remove("open");
        yesBtn.removeEventListener("click", onYes);
        noBtn.removeEventListener("click", onNo);
        overlay.removeEventListener("click", onOverlayClick);
        document.removeEventListener("keydown", onKeydown);
        resolve(result);
      }
      function onYes() {
        cleanup(true);
      }
      function onNo() {
        cleanup(false);
      }
      function onOverlayClick(e) {
        if (e.target === overlay) cleanup(false);
      }
      function onKeydown(e) {
        if (e.key === "Escape") cleanup(false);
      }

      yesBtn.addEventListener("click", onYes);
      noBtn.addEventListener("click", onNo);
      overlay.addEventListener("click", onOverlayClick);
      document.addEventListener("keydown", onKeydown);
      requestAnimationFrame(() => overlay.classList.add("open"));
    });
  }

  function isDarkActive() {
    const attr = document.documentElement.getAttribute("data-theme");
    if (attr === "dark") return true;
    if (attr === "light") return false;
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function updateThemeIcon(btn) {
    const dark = isDarkActive();
    btn.textContent = dark ? "☀️" : "🌙";
    btn.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
  }

  function initThemeToggle() {
    const btn = document.querySelector(".theme-toggle");
    if (!btn) return;
    updateThemeIcon(btn);
    btn.addEventListener("click", () => {
      const next = isDarkActive() ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem(MMS.KEYS.theme, next);
      updateThemeIcon(btn);
      window.dispatchEvent(new CustomEvent("mms:theme-change"));
    });
  }

  function initLockButton() {
    const btn = document.querySelector(".lock-toggle");
    if (!btn) return;
    btn.addEventListener("click", () => {
      if (MMS.Auth) MMS.Auth.lockNow();
    });
  }

  function initNav() {
    const path = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    document.querySelectorAll(".nav-links a").forEach((a) => {
      const href = (a.getAttribute("href") || "").toLowerCase();
      if (href === path) a.classList.add("active");
    });

    const toggle = document.querySelector(".nav-toggle");
    const links = document.querySelector(".nav-links");
    if (toggle && links) {
      toggle.addEventListener("click", () => links.classList.toggle("open"));
      links.querySelectorAll("a").forEach((a) =>
        a.addEventListener("click", () => links.classList.remove("open"))
      );
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    initNav();
    initThemeToggle();
    initLockButton();
  });

  return { toast, confirmAction };
})();
