/**
 * MMS.Auth - simple local PIN/password lock screen.
 *
 * This is a client-side deterrent only: there is no server, so nothing
 * here can be truly "secure" the way a real login system is. It hides
 * the app behind a PIN so a passerby on this device can't casually open
 * it, but it does NOT encrypt the underlying data - anyone opening
 * localStorage or editing the page's JS directly can still get in.
 * Forgetting the PIN only resets the lock (never touches financial
 * data), by design, so nobody is ever permanently locked out.
 *
 * Runs immediately when the script executes (near the end of <body>,
 * after storage.js/main.js) - no need to wait for DOMContentLoaded
 * since document.body already exists by then. A tiny inline script in
 * <head> adds the "mms-auth-pending" class to <html> before first
 * paint, and CSS hides everything except the lock overlay until this
 * script calls revealApp().
 */
MMS.Auth = (function () {
  "use strict";

  const KEY_SALT = "mms_auth_salt";
  const KEY_HASH = "mms_auth_hash";
  const KEY_SESSION = "mms_auth_session";
  const SESSION_MS = 12 * 60 * 60 * 1000; // stay unlocked for 12 hours on this device

  // A fast, well-distributed non-cryptographic hash (cyrb53-style).
  // crypto.subtle is avoided here because it's restricted to "secure
  // contexts" and can be unavailable when this app is opened directly
  // from a file:// URL in some browsers; this hash has no such
  // restriction and needs no async/await.
  function hash53(str) {
    let h1 = 0xdeadbeef ^ str.length;
    let h2 = 0x41c6ce57 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
  }

  function randomSalt() {
    return Array.from(crypto.getRandomValues(new Uint32Array(4)))
      .map((n) => n.toString(16))
      .join("");
  }

  function hashPin(pin, salt) {
    return hash53(salt + ":" + pin);
  }

  function isSetUp() {
    return !!localStorage.getItem(KEY_HASH);
  }

  function isSessionValid() {
    try {
      const session = JSON.parse(localStorage.getItem(KEY_SESSION) || "null");
      return !!session && typeof session.expiresAt === "number" && Date.now() < session.expiresAt;
    } catch (e) {
      return false;
    }
  }

  function startSession() {
    localStorage.setItem(KEY_SESSION, JSON.stringify({ expiresAt: Date.now() + SESSION_MS }));
  }

  function lockNow() {
    localStorage.removeItem(KEY_SESSION);
    location.reload();
  }

  function resetPin() {
    localStorage.removeItem(KEY_HASH);
    localStorage.removeItem(KEY_SALT);
    localStorage.removeItem(KEY_SESSION);
    location.reload();
  }

  function revealApp() {
    document.documentElement.classList.remove("mms-auth-pending");
    const overlay = document.querySelector(".auth-overlay");
    if (overlay) overlay.remove();
  }

  function buildOverlay() {
    const overlay = document.createElement("div");
    overlay.className = "auth-overlay";
    document.body.appendChild(overlay);
    return overlay;
  }

  function renderSetup(overlay) {
    overlay.innerHTML =
      '<div class="auth-card">' +
      '<div class="auth-brand">💰</div>' +
      "<h2>Create a Lock PIN</h2>" +
      '<div class="subtitle">Set a PIN or password to keep this Money Manager private on this device.</div>' +
      '<form id="auth-setup-form" novalidate>' +
      '<div class="field"><label for="auth-pin1">New PIN / Password</label>' +
      '<input type="password" id="auth-pin1" autocomplete="new-password" required /></div>' +
      '<div class="field"><label for="auth-pin2">Confirm PIN / Password</label>' +
      '<input type="password" id="auth-pin2" autocomplete="new-password" required /></div>' +
      '<div class="field-error" id="auth-setup-error"></div>' +
      '<button type="submit" class="btn btn-primary btn-block">🔒 Set Lock</button>' +
      "</form></div>";

    const form = overlay.querySelector("#auth-setup-form");
    const error = overlay.querySelector("#auth-setup-error");
    const pin1 = overlay.querySelector("#auth-pin1");
    const pin2 = overlay.querySelector("#auth-pin2");

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (pin1.value.length < 4) {
        error.textContent = "PIN/password must be at least 4 characters.";
        return;
      }
      if (pin1.value !== pin2.value) {
        error.textContent = "The two entries do not match.";
        return;
      }
      error.textContent = "";
      const salt = randomSalt();
      localStorage.setItem(KEY_SALT, salt);
      localStorage.setItem(KEY_HASH, hashPin(pin1.value, salt));
      startSession();
      revealApp();
    });

    pin1.focus();
  }

  function renderUnlock(overlay) {
    overlay.innerHTML =
      '<div class="auth-card">' +
      '<div class="auth-brand">💰</div>' +
      "<h2>Enter PIN to Unlock</h2>" +
      '<div class="subtitle">Money Manager is locked on this device.</div>' +
      '<form id="auth-unlock-form" novalidate>' +
      '<div class="field"><label for="auth-pin">PIN / Password</label>' +
      '<input type="password" id="auth-pin" autocomplete="current-password" required /></div>' +
      '<div class="field-error" id="auth-unlock-error"></div>' +
      '<button type="submit" class="btn btn-primary btn-block">🔓 Unlock</button>' +
      "</form>" +
      '<div class="auth-forgot"><button type="button" id="auth-forgot-btn">Forgot PIN?</button></div>' +
      "</div>";

    const form = overlay.querySelector("#auth-unlock-form");
    const error = overlay.querySelector("#auth-unlock-error");
    const pinInput = overlay.querySelector("#auth-pin");

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const salt = localStorage.getItem(KEY_SALT) || "";
      if (hashPin(pinInput.value, salt) === localStorage.getItem(KEY_HASH)) {
        startSession();
        revealApp();
      } else {
        error.textContent = "Incorrect PIN/password. Try again.";
        pinInput.value = "";
        pinInput.focus();
      }
    });

    overlay.querySelector("#auth-forgot-btn").addEventListener("click", () => {
      const message =
        "Reset your lock PIN? Your income, expense, savings and debt data is not affected — only the lock itself resets, and you'll set a new PIN.";
      const ask =
        MMS.UI && MMS.UI.confirmAction
          ? MMS.UI.confirmAction(message)
          : Promise.resolve(window.confirm(message));
      ask.then((ok) => {
        if (ok) resetPin();
      });
    });

    pinInput.focus();
  }

  function init() {
    if (!isSetUp()) {
      renderSetup(buildOverlay());
      return;
    }
    if (isSessionValid()) {
      revealApp();
      return;
    }
    renderUnlock(buildOverlay());
  }

  init();

  return { lockNow, resetPin, isSetUp, isSessionValid };
})();
