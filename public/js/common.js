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

  // build the standard header; pass current page name to mark nav
  mountHeader(active) {
    const user = this.getUser();
    const header = document.createElement("header");
    header.className = "site-header";
    const links = [];
    if (this.isLoggedIn()) {
      links.push(`<a href="dashboard.html"${active==="dashboard"?' style="color:var(--blue)"':''}>Dashboard</a>`);
      links.push(`<a href="upload.html"${active==="upload"?' style="color:var(--blue)"':''}>Upload</a>`);
      if (user && user.username && user.username.toLowerCase() === "pokestrikers")
        links.push(`<a href="admin.html"${active==="admin"?' style="color:var(--blue)"':''}>Admin</a>`);
      links.push(`<span class="pill">@${user ? user.username : ""}</span>`);
      links.push(`<a href="#" id="ps-logout">Log out</a>`);
    } else {
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
  },
};
