// Shared client helpers for PokeStrikers.
const PS = {
  TOKEN_KEY: "ps_token",
  USER_KEY: "ps_user",

  getToken() { return localStorage.getItem(this.TOKEN_KEY); },
  getUser() {
    try { return JSON.parse(localStorage.getItem(this.USER_KEY) || "null"); }
    catch { return null; }
  },
  setAuth(token, user) {
    localStorage.setItem(this.TOKEN_KEY, token);
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
  },
  logout() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    location.href = "index.html";
  },
  isLoggedIn() { return !!this.getToken(); },

  // fetch wrapper that attaches the bearer token and parses JSON
  async api(path, { method = "GET", body } = {}) {
    const headers = { "Content-Type": "application/json" };
    const token = this.getToken();
    if (token) headers.Authorization = "Bearer " + token;
    const res = await fetch(path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = {};
    try { data = await res.json(); } catch {}
    if (res.status === 401) {
      // token invalid/expired — bounce to login
      this.logout();
      throw new Error(data.error || "Session expired. Please log in again.");
    }
    if (!res.ok) throw new Error(data.error || "Something went wrong.");
    return data;
  },

  // require login or redirect
  requireAuth() {
    if (!this.isLoggedIn()) { location.href = "login.html"; return false; }
    return true;
  },

  // ----- UI helpers -----
  alert(el, type, msg) {
    el.className = "alert show " + type;
    el.textContent = msg;
  },
  clearAlert(el) { el.className = "alert"; el.textContent = ""; },

  fmtTime(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, "0")}`;
  },

  // HH:MM:SS, for the 24h claim cooldown.
  fmtClock(ms) {
    let s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600); s %= 3600;
    const m = Math.floor(s / 60); const r = s % 60;
    return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  },

  // Format a raw promo code into XXX-XXXX-XXX-XXX (groups of 3,4,3,3).
  formatCode(raw) {
    const clean = String(raw).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 13);
    const groups = [3, 4, 3, 3];
    let out = "", i = 0;
    for (const g of groups) {
      if (i >= clean.length) break;
      out += (out ? "-" : "") + clean.slice(i, i + g);
      i += g;
    }
    return out;
  },

  // Attach live auto-formatting (dashes insert themselves as the user types).
  attachCodeFormatter(input) {
    if (!input) return;
    input.setAttribute("maxlength", "16");          // 13 chars + 3 dashes
    input.setAttribute("autocapitalize", "characters");
    input.setAttribute("autocomplete", "off");
    input.setAttribute("spellcheck", "false");
    input.addEventListener("input", () => {
      const atEnd = input.selectionStart === input.value.length;
      input.value = this.formatCode(input.value);
      if (atEnd) input.setSelectionRange(input.value.length, input.value.length);
    });
  },

  // escape untrusted text before putting it in innerHTML
  esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  },

  // "3m ago" / "2h ago" / "5d ago" — for notifications and the vault table.
  fmtAgo(iso) {
    const t = new Date(iso).getTime();
    if (isNaN(t)) return "";
    const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  },

  // build the standard header; pass current page name to mark nav
  mountHeader(active) {
    const user = this.getUser();
    const header = document.createElement("header");
    header.className = "site-header";
    const on = (p) => (active === p ? ' style="color:var(--blue)"' : "");
    const links = [];
    if (this.isLoggedIn()) {
      links.push(`<a href="dashboard.html"${on("dashboard")}>Dashboard</a>`);
      links.push(`<a href="upload.html"${on("upload")}>Upload</a>`);
      links.push(`<a href="status.html"${on("status")}>Check Code</a>`);
      links.push(`<a href="notifications.html"${on("notifications")}>Notifications</a>`);
      if (user && user.username && user.username.toLowerCase() === "pokestrikers")
        links.push(`<a href="admin.html"${on("admin")}>Admin</a>`);
      links.push(`
        <span class="bell-wrap">
          <button class="bell" id="ps-bell" aria-label="Notifications" aria-expanded="false">
            🔔<span class="bell-badge hidden" id="ps-bell-badge">0</span>
          </button>
          <div class="bell-menu hidden" id="ps-bell-menu"></div>
        </span>`);
      links.push(`<a class="pill" href="profile.html"${on("profile")}>@${this.esc(user ? user.username : "")}</a>`);
      links.push(`<a href="#" id="ps-logout">Log out</a>`);
    } else {
      links.push(`<a href="status.html"${on("status")}>Check Code</a>`);
      links.push(`<a href="login.html">Log in</a>`);
      links.push(`<a class="btn small" href="register.html">Sign up</a>`);
    }
    header.innerHTML = `
      <a class="brand" href="${this.isLoggedIn() ? "dashboard.html" : "index.html"}">
        <span class="logo">P</span>
        <span class="name">Poke<b>Strikers</b></span>
      </a>
      <nav class="nav">${links.join("")}</nav>`;
    document.body.prepend(header);
    const lo = document.getElementById("ps-logout");
    if (lo) lo.addEventListener("click", (e) => { e.preventDefault(); this.logout(); });
    if (this.isLoggedIn()) this.initBell();
  },

  // ----- notification bell -----
  initBell() {
    const bell  = document.getElementById("ps-bell");
    const badge = document.getElementById("ps-bell-badge");
    const menu  = document.getElementById("ps-bell-menu");
    if (!bell || !menu) return;

    const render = (list) => {
      if (!list.length) {
        menu.innerHTML = `<div class="bell-empty muted">No notifications yet. Follow a set on the
          <a class="link" href="notifications.html">Notifications</a> page to get alerts.</div>`;
        return;
      }
      menu.innerHTML = list.map((n) => `
        <button class="bell-item${n.is_read ? "" : " unread"}" data-id="${n.id}">
          <span class="bell-msg">${this.esc(n.message)}</span>
          <span class="bell-time muted">${this.fmtAgo(n.created_at)}</span>
        </button>`).join("");

      menu.querySelectorAll(".bell-item").forEach((b) => {
        b.addEventListener("click", async () => {
          try { await this.api("/api/notifications/read", { method: "POST", body: { id: b.dataset.id } }); }
          catch {}
          location.href = "dashboard.html";
        });
      });
    };

    const load = async () => {
      try {
        const d = await this.api("/api/notifications");
        badge.textContent = d.unread > 9 ? "9+" : d.unread;
        badge.classList.toggle("hidden", !d.unread);
        render(d.notifications || []);
      } catch { /* stay quiet in the navbar */ }
    };

    bell.addEventListener("click", async (e) => {
      e.stopPropagation();
      const open = menu.classList.toggle("hidden") === false;
      bell.setAttribute("aria-expanded", String(open));
      if (open) {
        await load();
        // Opening the bell clears the badge; individual rows stay styled unread
        // until the list is reloaded.
        try {
          await this.api("/api/notifications/read", { method: "POST" });
          badge.classList.add("hidden");
        } catch {}
      }
    });
    document.addEventListener("click", () => {
      menu.classList.add("hidden");
      bell.setAttribute("aria-expanded", "false");
    });
    menu.addEventListener("click", (e) => e.stopPropagation());

    load();
    setInterval(load, 60000);
  },
};
