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

  // build the standard header; pass current page name to mark nav
  mountHeader(active) {
    const user = this.getUser();
    const header = document.createElement("header");
    header.className = "site-header";
    const links = [];
    if (this.isLoggedIn()) {
      links.push(`<a href="dashboard.html"${active==="dashboard"?' style="color:var(--blue)"':''}>Dashboard</a>`);
      links.push(`<a href="upload.html"${active==="upload"?' style="color:var(--blue)"':''}>Upload</a>`);
      if (user && user.is_admin)
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
