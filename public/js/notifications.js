// Set subscriptions + the full notification list. Needs POKE_PACKS (packs.js).
if (PS.requireAuth()) {
  PS.mountHeader("notifications");

  const alertEl  = document.getElementById("alert");
  const listEl   = document.getElementById("sub-list");
  const notifEl  = document.getElementById("notif-list");
  const filterEl = document.getElementById("filter");

  const addBtn = document.getElementById("add-set");
  const me = PS.getUser();

  let subscribed = new Set();
  let customSets = [];        // admin-added, shown first
  let allSets = POKE_PACKS;

  // Admin-added sets sit above the built-ins; dedupe case-insensitively so an
  // accidental re-add of a built-in name doesn't show twice.
  function mergeSets() {
    const seen = new Set();
    allSets = [...customSets, ...POKE_PACKS].filter((p) => {
      const k = p.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  async function loadSets() {
    try {
      const d = await PS.api("/api/sets");
      customSets = d.sets || [];
    } catch { customSets = []; }
    mergeSets();
  }

  /* ---------- subscriptions ---------- */
  function renderSets() {
    const q = filterEl.value.trim().toLowerCase();
    const sets = allSets.filter((p) => !q || p.toLowerCase().includes(q));

    if (!sets.length) {
      listEl.innerHTML = `<p class="muted">No sets match "${PS.esc(filterEl.value)}".</p>`;
      return;
    }

    listEl.innerHTML = sets.map((p) => {
      const isOn = subscribed.has(p);
      const custom = customSets.some((c) => c.toLowerCase() === p.toLowerCase());
      return `
        <div class="sub-row">
          <span class="sub-name">${PS.esc(p)}</span>
          ${custom && me && me.is_admin
            ? `<button class="set-del" data-del="${PS.esc(p)}" title="Remove ${PS.esc(p)}">✕</button>` : ""}
          <button class="sub-bell${isOn ? " on" : ""}" data-pack="${PS.esc(p)}"
                  aria-pressed="${isOn}" title="${isOn ? "Unfollow" : "Follow"} ${PS.esc(p)}">
            ${isOn ? "🔔" : "🔕"}
          </button>
        </div>`;
    }).join("");

    listEl.querySelectorAll(".sub-bell").forEach((b) => {
      b.addEventListener("click", () => toggle(b.dataset.pack, b));
    });
    listEl.querySelectorAll(".set-del").forEach((b) => {
      b.addEventListener("click", () => removeSet(b.dataset.del));
    });
  }

  /* ---------- admin: add / remove sets ---------- */
  if (me && me.is_admin) addBtn.classList.remove("hidden");

  addBtn.addEventListener("click", async () => {
    const name = prompt("Name of the set to add:");
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed) return;

    PS.clearAlert(alertEl);
    try {
      await PS.api("/api/admin/sets", { method: "POST", body: { name: trimmed } });
      await loadSets();
      renderSets();
      PS.alert(alertEl, "success", `Added ${trimmed}. It's now available to everyone.`);
    } catch (e) { PS.alert(alertEl, "error", e.message); }
  });

  async function removeSet(name) {
    if (!confirm(`Remove "${name}" from the set list?`)) return;
    PS.clearAlert(alertEl);
    try {
      await PS.api("/api/admin/sets", { method: "DELETE", body: { name } });
      await loadSets();
      renderSets();
      PS.alert(alertEl, "success", `Removed ${name}.`);
    } catch (e) { PS.alert(alertEl, "error", e.message); }
  }

  async function toggle(pack, btn) {
    const wasOn = subscribed.has(pack);
    btn.disabled = true;
    try {
      await PS.api("/api/subscriptions", {
        method: wasOn ? "DELETE" : "POST",
        body: { pack_name: pack },
      });
      if (wasOn) subscribed.delete(pack); else subscribed.add(pack);
      PS.clearAlert(alertEl);
      PS.alert(alertEl, "success",
        wasOn ? `Unfollowed ${pack}.` : `Following ${pack} — we'll ping you when a code drops.`);
      renderSets();
    } catch (e) {
      PS.alert(alertEl, "error", e.message);
      btn.disabled = false;
    }
  }

  async function loadSubs() {
    await loadSets();
    try {
      const d = await PS.api("/api/subscriptions");
      subscribed = new Set(d.packs || []);
    } catch (e) {
      PS.alert(alertEl, "error", e.message);
    }
    renderSets();
  }

  /* ---------- notification history ---------- */
  async function loadNotifs() {
    try {
      const d = await PS.api("/api/notifications");
      notifEl.innerHTML = (d.notifications || []).map((n) => `
        <a class="notif-row${n.is_read ? "" : " unread"}" href="dashboard.html" data-id="${n.id}">
          <span>${PS.esc(n.message)}</span>
          <span class="muted">${PS.fmtAgo(n.created_at)}</span>
        </a>`).join("")
        || `<p class="muted">Nothing yet. Follow a set above and we'll let you know when codes land.</p>`;

      notifEl.querySelectorAll(".notif-row").forEach((row) => {
        row.addEventListener("click", async (e) => {
          e.preventDefault();
          try { await PS.api("/api/notifications/read", { method: "POST", body: { id: row.dataset.id } }); }
          catch {}
          location.href = "dashboard.html";
        });
      });
    } catch (e) {
      PS.alert(alertEl, "error", e.message);
    }
  }

  document.getElementById("mark-all").addEventListener("click", async () => {
    try {
      await PS.api("/api/notifications/read", { method: "POST" });
      loadNotifs();
    } catch (e) { PS.alert(alertEl, "error", e.message); }
  });

  filterEl.addEventListener("input", renderSets);

  loadSubs();
  loadNotifs();
}
