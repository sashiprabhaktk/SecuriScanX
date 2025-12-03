document.addEventListener("DOMContentLoaded", () => {
  // Views
  const loginView = document.getElementById("loginView");
  const signupView = document.getElementById("signupView");
  const forgotView = document.getElementById("forgotView");
  const scanView = document.getElementById("scanView");
  const historyView = document.getElementById("historyView");

  // Controls
  const usernameInput = document.getElementById("username");
  const passwordInput = document.getElementById("password");
  const loginBtn = document.getElementById("loginBtn");
  const signupLink = document.getElementById("signupLink");
  const signupBtn = document.getElementById("signupBtn");
  const backToLogin = document.getElementById("backToLogin");
  const forgotLink = document.getElementById("forgotLink");
  const forgotBtn = document.getElementById("forgotBtn");
  const backFromForgot = document.getElementById("backFromForgot");
  const scanBtn = document.getElementById("scan");
  const exportBtn = document.getElementById("exportBtn");
  const filterSelect = document.getElementById("filter");
  const logoutBtn = document.getElementById("logoutBtn");
  const historyBtn = document.getElementById("historyBtn");
  const historyBack = document.getElementById("historyBack");
  const historyPageList = document.getElementById("historyPageList");

  // Session helpers: manage active scan session stored in chrome.storage.local
  let activeSessionId = null;

  function storageGet(keys) {
    return new Promise(resolve => {
      try {
        chrome.storage.local.get(keys, (res) => resolve(res || {}));
      } catch (e) { resolve({}); }
    });
  }
  function storageSet(obj) {
    return new Promise(resolve => {
      try {
        chrome.storage.local.set(obj, () => resolve());
      } catch (e) { resolve(); }
    });
  }

  async function appendResultToActiveSession(item) {
    // append result to activeSession.results, or fall back to legacy scanHistory
    // (bounded sizes applied to avoid unbounded growth)
    try {
      const res = await storageGet(["activeSession", "scanHistory"]);
      let active = res.activeSession;
      if (active && active.id === activeSessionId) {
        active.results = active.results || [];
        active.results.push(item);
        if (active.results.length > 2000) active.results.length = 2000;
        await storageSet({ activeSession: active });
      } else {
        const hist = (res.scanHistory || []);
        hist.unshift({
          ts: Date.now(),
          status: item.status || "",
          type: item.type || "",
          target: item.target || "",
          payload: String(item.payload || "").slice(0, 800)
        });
        if (hist.length > 200) hist.length = 200;
        await storageSet({ scanHistory: hist });
      }
    } catch (e) { /* ignore storage errors */ }
  }

  async function finalizeActiveSession() {
    try {
      const res = await storageGet(["activeSession", "scanSessions"]);
      const active = res.activeSession;
      let sessions = res.scanSessions || [];
      if (!active) return;
      active.finishedAt = Date.now();
      // push most recent first
      sessions.unshift(active);
      if (sessions.length > 50) sessions.length = 50;
      await storageSet({ scanSessions: sessions, activeSession: null, activeSessionId: null });
      activeSessionId = null;
      showToast("Scan completed.", "success", 3000);
      populateHistory(); // refresh UI
    } catch (e) { /* ignore */ }
  }

  function show(view) {
    loginView.style.display = (view === "login") ? "" : "none";
    signupView.style.display = (view === "signup") ? "" : "none";
    forgotView && (forgotView.style.display = (view === "forgot") ? "" : "none");
    scanView && (scanView.style.display = (view === "scan") ? "" : "none");
    historyView && (historyView.style.display = (view === "history") ? "" : "none");
  }

  // runtime message -> results table (attach after DOM ready)
  chrome.runtime.onMessage.addListener((message) => {
    if (message.result) {
      // If it's an INFO message, keep existing toast handling but also finalize session on COMPLETED
      if (message.type === "INFO") {
        showToast(message.payload || "Info", (message.status === "FAILED") ? "error" : "success", 3000);
        if (String(message.status || "").toUpperCase() === "COMPLETED") {
          // finalize session
          finalizeActiveSession();
        }
        return;
      }
      if (String(message.status || "").toUpperCase() === "FAILED" && message.type !== "INFO") {
        showToast(`${message.type || "Scan"}: ${message.payload || "Failed"}`, "error", 3200);
      }

      const tbody = document.querySelector("#resultsTable tbody");
      if (!tbody) return;

      // create a single compact result row (Status | Type | Target | Payload snippet)
      const row = document.createElement("tr");
      row.className = message.className;
      row.setAttribute("data-status", message.status);

      const compactPayload = escapeHtml(String(message.payload || "")).slice(0, 120);
      const payloadCell = `<span class="payload-cell">${compactPayload}${String(message.payload||"").length > 120 ? "…" : ""}</span>`;

      row.innerHTML = `<td>${escapeHtml(message.status || "")}</td>
                       <td>${escapeHtml(message.type || "Unknown")}</td>
                       <td>${escapeHtml(message.target || "")}</td>
                       <td>${payloadCell}</td>`;

      // append only the main row; no expandable detail row
      tbody.appendChild(row);

      // Persist a compact history item in active session (keep most recent first)
      try {
        const item = {
          status: message.status || "",
          type: message.type || "",
          target: message.target || "",
          payload: String(message.payload || "")
        };
        // async append; don't await (fire-and-forget)
        appendResultToActiveSession(item);
      } catch (e) {
        // ignore storage errors
      }
    }
  });

  // Prefill login if user exists
  chrome.storage.local.get("user", (res) => {
    if (res && res.user) {
      // login input expects email
      usernameInput.value = res.user.email || "";
      passwordInput.value = res.user.password || "";
    }
  });

  // Navigation handlers
  signupLink && signupLink.addEventListener("click", (e) => { e.preventDefault(); show("signup"); });
  backToLogin && backToLogin.addEventListener("click", (e) => { e.preventDefault(); show("login"); });
  forgotLink && forgotLink.addEventListener("click", (e) => { e.preventDefault(); show("forgot"); });
  backFromForgot && backFromForgot.addEventListener("click", (e) => { e.preventDefault(); show("login"); });

  // Toast helper (deduplicates identical message+type; anchored to visible view hero)
  // usage: showToast(message, type = "success", timeout = 2500, opts = {})
  function showToast(message, type = "success", timeout = 2500, opts = {}) {
    const container = document.getElementById("toast-container");
    if (!container) return;

    // remove any existing toasts with same message+type (keep UI single-notice)
    try {
      const existingToasts = Array.from(container.querySelectorAll(".toast"));
      for (const t of existingToasts) {
        if (t.dataset && t.dataset.type === type && t.dataset.message === String(message)) {
          if (t._hideTimer) { clearTimeout(t._hideTimer); t._hideTimer = null; }
          if (container.contains(t)) container.removeChild(t);
        }
      }
    } catch (e) { /* ignore dedupe errors */ }

    // determine anchor for toast placement (hero of visible view)
    function findVisibleHero() {
      if (opts && opts.anchorElement instanceof Element) return opts.anchorElement;
      if (opts && typeof opts.anchorSelector === "string") {
        const q = document.querySelector(opts.anchorSelector);
        if (q) return q;
      }
      const views = [loginView, signupView, forgotView, scanView, historyView].filter(Boolean);
      for (const v of views) {
        try {
          const cs = window.getComputedStyle(v);
          if (cs && cs.display !== "none" && v.offsetParent !== null) {
            const hero = v.querySelector(".hero-border, .hero-center");
            if (hero) return hero;
          }
        } catch (e) { /* ignore hidden/removed nodes */ }
      }
      return document.querySelector(".hero-border, .hero-center");
    }

    // position toast container relative to hero or default bottom-center
    const hero = findVisibleHero();
    if (hero) {
      const rect = hero.getBoundingClientRect();
      const left = Math.round(rect.left + rect.width / 2);
      const top = Math.round(rect.bottom + 6);
      container.style.position = "fixed";
      container.style.top = `${top}px`;
      container.style.left = `${left}px`;
      container.style.transform = "translateX(-50%)";
      container.style.bottom = "";
    } else {
      container.style.position = "fixed";
      container.style.bottom = "18px";
      container.style.left = "50%";
      container.style.transform = "translateX(-50%)";
      container.style.top = "";
    }

    // create toast element (stores timer on element for later cleanup)
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    toast.dataset.type = type;
    toast.dataset.message = String(message);

    const iconHtml = opts.iconHtml || defaultIconFor(type);
    if (iconHtml) {
      const ic = document.createElement("span");
      ic.className = "toast-icon";
      ic.innerHTML = iconHtml;
      toast.appendChild(ic);
    }

    const txt = document.createElement("div");
    txt.className = "toast-text";
    txt.innerText = message;
    toast.appendChild(txt);

    if (opts.actionText && typeof opts.actionText === "string") {
      const actionBtn = document.createElement("button");
      actionBtn.className = "toast-action";
      actionBtn.type = "button";
      actionBtn.innerText = opts.actionText;
      actionBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        try { if (typeof opts.actionCallback === "function") opts.actionCallback(); } catch (e) {}
        removeToast(toast);
      });
      toast.appendChild(actionBtn);
    }

    if (opts.closeable) {
      const close = document.createElement("button");
      close.className = "toast-close";
      close.type = "button";
      close.setAttribute("aria-label", "Dismiss");
      close.innerHTML = "✕";
      close.addEventListener("click", (ev) => {
        ev.stopPropagation();
        removeToast(toast);
      });
      toast.appendChild(close);
    }

    toast.addEventListener("click", (ev) => {
      if (opts.closeable || !opts.actionText) removeToast(toast);
    });

    container.appendChild(toast);

    // show animation
    requestAnimationFrame(() => toast.classList.add("show"));

    // auto-remove timeout (store on element for dedupe/cleanup)
    if (timeout && timeout > 0) {
      toast._hideTimer = setTimeout(() => removeToast(toast), timeout);
    } else {
      toast._hideTimer = null;
    }

    function removeToast(el) {
      if (!el) return;
      if (el._hideTimer) { clearTimeout(el._hideTimer); el._hideTimer = null; }
      el.classList.remove("show");
      setTimeout(() => {
        if (container.contains(el)) container.removeChild(el);
        if (!container.children.length) {
          container.style.top = "";
          container.style.left = "";
          container.style.transform = "";
          container.style.position = "";
          container.style.bottom = "";
        }
      }, 220);
    }

    // default SVG icon per type
    function defaultIconFor(t) {
      if (t === "success") return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
      if (t === "error") return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
      if (t === "warning") return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94A2 2 0 0 0 22.18 18L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
      if (t === "info") return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="0.5"/></svg>';
      return '';
    }
  } // showToast

  // password visibility toggles (improved accessibility & labels)
  document.body.addEventListener("click", (e) => {
    const btn = e.target.closest && e.target.closest(".toggle-pass");
    if (!btn) return;
    const field = btn.closest(".password-field");
    if (!field) return;
    const input = field.querySelector("input[type='password'], input[type='text']");
    if (!input) return;

    const isPwd = input.type === "password";
    // toggle field type
    input.type = isPwd ? "text" : "password";

    // update visual state
    if (isPwd) {
      btn.classList.add("visible");
    } else {
      btn.classList.remove("visible");
    }

    // accessibility: update pressed state and label
    btn.setAttribute("aria-pressed", isPwd ? "true" : "false");
    btn.setAttribute("title", isPwd ? "Hide password" : "Show password");
    btn.setAttribute("aria-label", isPwd ? "Hide password" : "Show password");

    // ensure focus remains on the input for seamless typing if user toggles
    input.focus();
  });

  // Signup
  signupBtn && signupBtn.addEventListener("click", () => {
    const email = document.getElementById("email").value.trim();
    const pwd = document.getElementById("signupPassword").value;
    const confirm = document.getElementById("confirmPassword").value;

    if (!email || !pwd) {
      showToast("Please enter email and password.", "error");
      return;
    }
    if (pwd !== confirm) {
      showToast("Passwords do not match.", "error");
      return;
    }
    // basic email pattern (lightweight)
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(email)) {
      showToast("Please enter a valid email address.", "error");
      return;
    }

    const user = { email, password: pwd };
    chrome.storage.local.set({ user }, () => {
      usernameInput.value = user.email;
      passwordInput.value = user.password;
      showToast("Signup successful. You can now login.", "success");
      show("login");
    });
  });

  // Forgot password: update password if email matches stored user
  forgotBtn && forgotBtn.addEventListener("click", () => {
    const email = document.getElementById("forgotEmail").value.trim();
    const newPwd = document.getElementById("forgotNewPassword").value;
    const confirm = document.getElementById("forgotConfirmPassword").value;

    if (!email || !newPwd) {
      showToast("Please enter your email and new password.", "error");
      return;
    }
    if (newPwd !== confirm) {
      showToast("Passwords do not match.", "error");
      return;
    }

    chrome.storage.local.get("user", (res) => {
      const stored = res && res.user;
      if (!stored || stored.email !== email) {
        showToast("No account found with that email.", "error");
        return;
      }
      stored.password = newPwd;
      chrome.storage.local.set({ user: stored }, () => {
        showToast("Password reset successful. Please login.", "success");
        show("login");
      });
    });
  });

  // Login: accept either stored.username or stored.email in the username field
  loginBtn && loginBtn.addEventListener("click", () => {
    const email = usernameInput.value.trim(); // email only
    const pwd = passwordInput.value;

    chrome.storage.local.get("user", (res) => {
      const stored = res && res.user;
      if (!stored) {
        showToast("No account found. Please signup first.", "error");
        show("signup");
        return;
      }
      if (stored.email === email && stored.password === pwd) {
        passwordInput.value = "";
        showToast("Login successful.", "success");
        show("scan");
      } else {
        showToast("Invalid email or password.", "error");
      }
    });
  });

  // --- New: scan / export / filter handlers ---
  // Inject content script into active tab to run the scanner
  scanBtn && scanBtn.addEventListener("click", async () => {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = tabs && tabs[0];
      if (!tab || !tab.id) {
        showToast("No active tab found.", "error");
        return;
      }

      // create a new scan session and persist as activeSession
      const session = {
        id: Date.now().toString(),
        url: tab.url || "",
        startedAt: Date.now(),
        results: []
      };
      activeSessionId = session.id;
      await storageSet({ activeSessionId: activeSessionId, activeSession: session });

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["contentScript.js"]
      });
      showToast("Scan started on active tab.", "success");
    } catch (err) {
      console.error("Scan injection failed:", err);
      showToast("Failed to start scan.", "error");
    }
  });

  exportBtn && exportBtn.addEventListener("click", async () => {
    // collect results rows but skip detail rows
    const mainRows = Array.from(document.querySelectorAll("#resultsTable tbody tr"))
      .filter(r => !r.classList.contains("detail-row"));

    if (!mainRows.length) {
      showToast("No results to export.", "error");
      return;
    }

    const esc = (s) => String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

    // get stored user email (fallback to username input)
    const getUserEmail = () => new Promise((resolve) => {
      try {
        chrome.storage.local.get("user", (res) => {
          const u = (res && res.user) ? res.user.email : null;
          resolve(u || (document.getElementById("username") && document.getElementById("username").value.trim()) || "");
        });
      } catch (e) {
        resolve((document.getElementById("username") && document.getElementById("username").value.trim()) || "");
      }
    });

    // get active tab url
    const getActiveTabUrl = () => new Promise((resolve) => {
      try {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          resolve((tabs && tabs[0] && tabs[0].url) || "");
        });
      } catch (e) {
        resolve("");
      }
    });

    const [userEmail, activeUrl] = await Promise.all([ getUserEmail(), getActiveTabUrl() ]);
    const timestamp = new Date().toLocaleString();

    // Build HTML spreadsheet (Excel can open .xls files with HTML content)
    // Styled so labels/header are bold and URL is clickable
    const rowsHtml = [];

    // Metadata section (bold labels in first column)
    rowsHtml.push(`<tr><td style="font-weight:bold;padding:6px 8px;">Scan By:</td><td style="padding:6px 8px;">${esc(userEmail)}</td></tr>`);
    rowsHtml.push(`<tr><td style="font-weight:bold;padding:6px 8px;">Timestamp</td><td style="padding:6px 8px;">${esc(timestamp)}</td></tr>`);
    const urlCell = activeUrl ? `<a href="${esc(activeUrl)}" target="_blank" rel="noopener">${esc(activeUrl)}</a>` : "";
    rowsHtml.push(`<tr><td style="font-weight:bold;padding:6px 8px;">Scan Web URL</td><td style="padding:6px 8px;">${urlCell}</td></tr>`);

    // blank separator
    rowsHtml.push(`<tr><td colspan="2" style="height:8px;"></td></tr>`);

    // Table header (bold)
    rowsHtml.push(`<tr>
      <th style="font-weight:bold;text-align:left;padding:8px;border-bottom:1px solid #bbb;">Status</th>
      <th style="font-weight:bold;text-align:left;padding:8px;border-bottom:1px solid #bbb;">Type</th>
      <th style="font-weight:bold;text-align:left;padding:8px;border-bottom:1px solid #bbb;">Target</th>
      <th style="font-weight:bold;text-align:left;padding:8px;border-bottom:1px solid #bbb;">Payload</th>
      <th style="font-weight:bold;text-align:left;padding:8px;border-bottom:1px solid #bbb;">Exploitable (Y/N)</th>
    </tr>`);

    // Data rows
    mainRows.forEach(r => {
      const tds = Array.from(r.querySelectorAll("td"));
      if (!tds.length) return;
      const status = esc(tds[0] ? tds[0].innerText.trim() : "");
      const type = esc(tds[1] ? tds[1].innerText.trim() : "");
      const target = esc(tds[2] ? tds[2].innerText.trim() : "");
      const payload = esc(tds[3] ? (tds[3].innerText || tds[3].textContent || "").trim() : "");
      // Use pre-wrap styling so long payloads wrap in Excel cell
      rowsHtml.push(`<tr>
        <td style="padding:6px 8px;vertical-align:top;">${status}</td>
        <td style="padding:6px 8px;vertical-align:top;">${type}</td>
        <td style="padding:6px 8px;vertical-align:top;">${target}</td>
        <td style="padding:6px 8px;white-space:pre-wrap;vertical-align:top;font-family:monospace;">${payload}</td>
        <td style="padding:6px 8px;vertical-align:top;"></td>
      </tr>`);
    });

    const html = `<!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><title>SecuriScanX Results</title></head>
      <body>
        <table border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;font-size:12px;">
          ${rowsHtml.join("\n")}
        </table>
      </body>
      </html>`;

    // Create blob and download as .xls so Excel opens it and preserves formatting (bold/header/link)
    const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = "securiscanx-results.xls";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(downloadUrl);

    showToast("Results exported (opens in Excel).", "success", 3200);
  });

  // Logout: clear transient session UI, results and return to login view
  logoutBtn && logoutBtn.addEventListener("click", () => {
    // remove any transient session flag (if used)
    chrome.storage.local.remove("loggedIn", () => {});

    // clear results table rows
    const tbody = document.querySelector("#resultsTable tbody");
    if (tbody) tbody.innerHTML = "";

    // clear password field
    if (passwordInput) passwordInput.value = "";

    showToast("You have been logged out.", "success");
    show("login");
  });

  filterSelect && filterSelect.addEventListener("change", (e) => {
    const val = e.target.value;
    const rows = Array.from(document.querySelectorAll("#resultsTable tbody tr"));
    rows.forEach(r => {
      const status = r.getAttribute("data-status") || "";
      if (val === "ALL" || val === "" || val === "undefined") {
        r.style.display = "";
      } else {
        r.style.display = (status === val) ? "" : "none";
      }
    });
  });
  // --- end new handlers ---

  // history button navigates to history page and populates it
  historyBtn && historyBtn.addEventListener("click", (e) => {
    populateHistory();
    show("history");
  });
  // Back button from history returns to scan view
  historyBack && historyBack.addEventListener("click", () => {
    show("scan");
  });

  // --- History UI (replace populateHistory with accordion sessions) ---
  async function exportSessionAsXLS(session) {
    // reuse HTML-export approach used earlier but only for the provided session
    const esc = (s) => String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
    const rowsHtml = [];
    rowsHtml.push(`<tr><td style="font-weight:bold;padding:6px 8px;">Scan By:</td><td style="padding:6px 8px;">${esc((await storageGet(['user'])).user?.email || '')}</td></tr>`);
    rowsHtml.push(`<tr><td style="font-weight:bold;padding:6px 8px;">Started</td><td style="padding:6px 8px;">${esc(new Date(session.startedAt).toLocaleString())}</td></tr>`);
    rowsHtml.push(`<tr><td style="font-weight:bold;padding:6px 8px;">Finished</td><td style="padding:6px 8px;">${esc(session.finishedAt ? new Date(session.finishedAt).toLocaleString() : '')}</td></tr>`);
    const urlCell = session.url ? `<a href="${esc(session.url)}" target="_blank" rel="noopener">${esc(session.url)}</a>` : "";
    rowsHtml.push(`<tr><td style="font-weight:bold;padding:6px 8px;">Scan Web URL</td><td style="padding:6px 8px;">${urlCell}</td></tr>`);
    rowsHtml.push(`<tr><td colspan="2" style="height:8px;"></td></tr>`);
    rowsHtml.push(`<tr>
      <th style="font-weight:bold;text-align:left;padding:8px;border-bottom:1px solid #bbb;">Status</th>
      <th style="font-weight:bold;text-align:left;padding:8px;border-bottom:1px solid #bbb;">Type</th>
      <th style="font-weight:bold;text-align:left;padding:8px;border-bottom:1px solid #bbb;">Target</th>
      <th style="font-weight:bold;text-align:left;padding:8px;border-bottom:1px solid #bbb;">Payload</th>
      <th style="font-weight:bold;text-align:left;padding:8px;border-bottom:1px solid #bbb;">Exploitable (Y/N)</th>
    </tr>`);
    (session.results || []).forEach(it => {
      const status = esc(it.status || '');
      const type = esc(it.type || '');
      const target = esc(it.target || '');
      const payload = esc(it.payload || '');
      rowsHtml.push(`<tr>
        <td style="padding:6px 8px;vertical-align:top;">${status}</td>
        <td style="padding:6px 8px;vertical-align:top;">${type}</td>
        <td style="padding:6px 8px;vertical-align:top;">${target}</td>
        <td style="padding:6px 8px;white-space:pre-wrap;vertical-align:top;font-family:monospace;">${payload}</td>
        <td style="padding:6px 8px;vertical-align:top;"></td>
      </tr>`);
    });

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>SecuriScanX Results</title></head><body><table border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;font-size:12px;">${rowsHtml.join("\n")}</table></body></html>`;
    const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = downloadUrl;
    const stamp = session.finishedAt ? session.finishedAt : session.startedAt;
    a.download = `securiscanx-session-${stamp}.xls`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(downloadUrl);
    showToast("Exported session results.", "success", 2500);
  }

  async function deleteSessionById(id) {
    try {
      const res = await storageGet(["scanSessions"]);
      let sessions = res.scanSessions || [];
      sessions = sessions.filter(s => s.id !== id);
      await storageSet({ scanSessions: sessions });
      populateHistory();
      showToast("Scan deleted.", "success", 1800);
    } catch (e) { showToast("Failed to delete scan.", "error", 2200); }
  }

  // Render accordion cards for sessions (replaces previous populateHistory)
  async function populateHistory() {
    if (!historyPageList) return;
    historyPageList.innerHTML = "";

    const res = await storageGet(["scanSessions", "scanHistory"]);
    const sessions = res.scanSessions || [];
    const legacy = res.scanHistory || [];

    // If no sessions but legacy flat history exists, present a legacy card
    if (!sessions.length && legacy.length) {
      const legacyCard = document.createElement("div");
      legacyCard.className = "scan-card";
      legacyCard.innerHTML = `<div class="scan-card-header" role="button" tabindex="0">
        <div class="url">Legacy Scan Data</div>
        <div class="date">${new Date().toLocaleString()}</div>
        <div class="actions">
          <button class="download-btn" title="Download legacy results">⬇</button>
          <button class="delete-btn" title="Delete legacy results">🗑</button>
        </div>
      </div><div class="scan-card-body" style="display:none;"></div>`;
      const body = legacyCard.querySelector(".scan-card-body");
      legacy.forEach(item => {
        const r = document.createElement("div");
        r.className = "history-result-row";
        r.innerHTML = `<span class="badge ${item.status}">${item.status}</span>
                      <div class="result-meta">${escapeHtml(item.type||"")} — ${escapeHtml(item.target||"")}</div>
                      <pre class="result-payload">${escapeHtml((item.payload||"").slice(0,300))}</pre>`;
        body.appendChild(r);
      });
      // actions
      legacyCard.querySelector(".download-btn").addEventListener("click", async (ev) => {
        ev.stopPropagation();
        // export legacy as a session-like object
        await exportSessionAsXLS({ id: "legacy", url: "", startedAt: Date.now(), finishedAt: Date.now(), results: legacy.map(h=>({status:h.status,type:h.type,target:h.target,payload:h.payload})) });
      });
      legacyCard.querySelector(".delete-btn").addEventListener("click", async (ev) => {
        ev.stopPropagation();
        await storageSet({ scanHistory: [] });
        populateHistory();
        showToast("Legacy history cleared.", "success", 1600);
      });
      // toggle behavior
      legacyCard.querySelector(".scan-card-header").addEventListener("click", (ev) => {
        if (ev.target.closest(".download-btn") || ev.target.closest(".delete-btn")) return;
        const expanded = legacyCard.classList.toggle("expanded");
        legacyCard.querySelector(".scan-card-body").style.display = expanded ? "" : "none";
      });
      legacyCard.querySelector(".scan-card-header").addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); legacyCard.querySelector(".scan-card-header").click(); }
      });
      historyPageList.appendChild(legacyCard);
      return;
    }

    // render session cards
    sessions.forEach(session => {
      const card = document.createElement("div");
      card.className = "scan-card";
      card.setAttribute("data-session-id", session.id);

      const shortUrl = session.url ? (session.url.length > 48 ? session.url.slice(0,44) + "…" : session.url) : "(no url)";
      const timeLabel = session.finishedAt ? new Date(session.finishedAt).toLocaleString() : new Date(session.startedAt).toLocaleString();

      card.innerHTML = `<div class="scan-card-header" role="button" tabindex="0">
          <div class="url" title="${escapeHtml(session.url || "")}">${escapeHtml(shortUrl)}</div>
          <div class="date">${escapeHtml(timeLabel)}</div>
          <div class="actions">
            <button class="download-btn" title="Download session">⬇</button>
            <button class="delete-btn" title="Delete session">🗑</button>
          </div>
        </div>
        <div class="scan-card-body" style="display:none;"></div>`;

      const body = card.querySelector(".scan-card-body");
      (session.results || []).forEach(it => {
        const row = document.createElement("div");
        row.className = "history-result-row";
        const badge = document.createElement("span");
        const statusUp = String(it.status||"").toUpperCase();
        badge.className = "badge " + statusUp;
        badge.textContent = statusUp || "";
        const meta = document.createElement("div");
        meta.className = "result-meta";
        meta.textContent = `${it.type || "Unknown"} — ${it.target || ""}`;
        const pre = document.createElement("pre");
        pre.className = "result-payload";
        pre.textContent = (String(it.payload || "")).slice(0, 300);
        row.appendChild(badge);
        row.appendChild(meta);
        row.appendChild(pre);
        body.appendChild(row);
      });

      // click handlers
      const hdr = card.querySelector(".scan-card-header");
      hdr.addEventListener("click", (ev) => {
        if (ev.target.closest(".download-btn")) return;
        if (ev.target.closest(".delete-btn")) return;
        const expanded = card.classList.toggle("expanded");
        body.style.display = expanded ? "" : "none";
      });
      hdr.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          hdr.click();
        }
      });

      // download action
      card.querySelector(".download-btn").addEventListener("click", async (ev) => {
        ev.stopPropagation();
        await exportSessionAsXLS(session);
      });

      // delete action
      card.querySelector(".delete-btn").addEventListener("click", async (ev) => {
        ev.stopPropagation();
        // Immediate deletion without native confirm dialog; showToast will notify success/failure.
        await deleteSessionById(session.id);
      });

      historyPageList.appendChild(card);
    });
  }

  // Ensure initial view
  show("login");
});

// Helper to escape HTML
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

