// Set subscriptions + the full notification list. Needs POKE_PACKS (packs.js).
if (PS.requireAuth()) {
  PS.mountHeader("notifications");

  const alertEl  = document.getElementById("alert");
  const listEl   = document.getElementById("sub-list");
  const notifEl  = document.getElementById("notif-list");
  const filterEl = document.getElementById("filter");

  let subscribed = new Set();

  /* ---------- subscriptions ---------- */
  function renderSets() {
    const q = filterEl.value.trim().toLowerCase();
    const sets = POKE_PACKS.filter((p) => !q || p.toLowerCase().includes(q));

    if (!sets.length) {
      listEl.innerHTML = `<p class="muted">No sets match "${PS.esc(filterEl.value)}".</p>`;
      return;
    }

    listEl.innerHTML = sets.map((p) => {
      const isOn = subscribed.has(p);
      return `
        <div class="sub-row">
          <span class="sub-name">${PS.esc(p)}</span>
          <button class="sub-bell${isOn ? " on" : ""}" data-pack="${PS.esc(p)}"
                  aria-pressed="${isOn}" title="${isOn ? "Unfollow" : "Follow"} ${PS.esc(p)}">
            ${isOn ? "🔔" : "🔕"}
          </button>
        </div>`;
    }).join("");

    listEl.querySelectorAll(".sub-bell").forEach((b) => {
      b.addEventListener("click", () => toggle(b.dataset.pack, b));
    });
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
