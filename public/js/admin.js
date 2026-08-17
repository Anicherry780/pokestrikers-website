if (PS.requireAuth()) {
  PS.mountHeader("admin");

  const user = PS.getUser();
  const gate  = document.getElementById("gate");
  const panel = document.getElementById("panel");

  // Cosmetic only — the API enforces this independently via requireAdmin.
  const isAdmin = user && user.is_admin;
  if (!isAdmin) {
    // Non-admins are redirected straight to their dashboard.
    location.href = "dashboard.html";
  } else {
    panel.classList.remove("hidden");
    initAdmin();
  }

  function initAdmin() {
    const alertEl = document.getElementById("alert");

    /* ---------- tabs ---------- */
    document.querySelectorAll(".tab").forEach((t) => {
      t.addEventListener("click", () => {
        document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
        document.querySelectorAll(".tab-panel").forEach((x) => x.classList.remove("active"));
        t.classList.add("active");
        document.querySelector(`.tab-panel[data-panel="${t.dataset.tab}"]`).classList.add("active");
      });
    });

    /* ---------- codes table ---------- */
    const codesBody = document.querySelector("#codes-table tbody");
    const countsPill = document.getElementById("counts-pill");

    async function loadCodes() {
      try {
        const data = await PS.api("/api/admin/codes");
        const c = data.counts || {};
        countsPill.textContent = `${c.available||0} available · ${c.claimed||0} claimed · ${c.expired||0} expired`;
        codesBody.innerHTML = data.codes.map((row) => `
          <tr>
            <td>${row.id}</td>
            <td style="font-family:ui-monospace,monospace;">${esc(row.code)}</td>
            <td>${esc(row.pack_name || "Random Pack")}</td>
            <td><span class="badge ${row.status}">${row.status}</span></td>
            <td>${esc(row.uploader || "")}</td>
            <td>${row.claimer ? esc(row.claimer) : '<span class="muted">None</span>'}</td>
            <td><button class="btn danger small" data-del="${row.id}">Delete</button></td>
          </tr>`).join("") || `<tr><td colspan="7" class="muted">No codes yet.</td></tr>`;

        codesBody.querySelectorAll("[data-del]").forEach((b) => {
          b.addEventListener("click", () => deleteCode(b.dataset.del));
        });
      } catch (e) { PS.alert(alertEl, "error", e.message); }
    }

    async function deleteCode(id) {
      if (!confirm("Delete this code permanently?")) return;
      try {
        await PS.api(`/api/admin/codes/${id}`, { method: "DELETE" });
        loadCodes();
      } catch (e) { PS.alert(alertEl, "error", e.message); }
    }

    document.getElementById("refresh-codes").addEventListener("click", loadCodes);

    /* ---------- users table ---------- */
    const usersBody = document.querySelector("#users-table tbody");

    // How many accounts share each IP — the giveaway for one person running many.
    function ipCounts(users) {
      const counts = new Map();
      for (const u of users) {
        if (!u.ip_address) continue;
        counts.set(u.ip_address, (counts.get(u.ip_address) || 0) + 1);
      }
      return counts;
    }

    async function loadUsers() {
      try {
        const data = await PS.api("/api/admin/users");
        const shared = ipCounts(data.users);

        usersBody.innerHTML = data.users.map((u) => {
          const dupes = u.ip_address ? shared.get(u.ip_address) : 0;
          const ipCell = u.ip_address
            ? `${esc(u.ip_address)}${dupes > 1 ? ` <span class="ip-flag" title="${dupes} accounts from this IP">×${dupes}</span>` : ""}`
            : `<span class="muted">—</span>`;

          const actions = u.is_admin
            ? `<span class="muted">protected</span>`
            : `${u.is_banned
                  ? `<button class="btn ghost small" data-unban="${u.id}">Unban</button>`
                  : `<button class="btn danger small" data-ban="${u.id}">Ban</button>`}
               <button class="btn danger small" data-deluser="${u.id}" data-name="${esc(u.username)}">Delete</button>`;

          return `
            <tr class="${u.is_banned ? "row-banned" : ""}">
              <td>${u.id}</td>
              <td>${esc(u.username)}${u.is_banned ? ' <span class="badge expired">banned</span>' : ""}</td>
              <td>${u.is_admin ? "✔" : ""}</td>
              <td style="font-family:ui-monospace,monospace;font-size:.82rem;">${ipCell}</td>
              <td>${(u.created_at||"").slice(0,10)}</td>
              <td>${u.daily_codes_used}</td>
              <td>${u.bonus_unlocked_today ? "✔" : ""}</td>
              <td>${u.uploaded}</td>
              <td>${u.claimed}</td>
              <td style="white-space:nowrap;">${actions}</td>
            </tr>`;
        }).join("") || `<tr><td colspan="10" class="muted">No users yet.</td></tr>`;

        usersBody.querySelectorAll("[data-ban]").forEach((b) =>
          b.addEventListener("click", () => setBanned(b.dataset.ban, true)));
        usersBody.querySelectorAll("[data-unban]").forEach((b) =>
          b.addEventListener("click", () => setBanned(b.dataset.unban, false)));
        usersBody.querySelectorAll("[data-deluser]").forEach((b) =>
          b.addEventListener("click", () => deleteUser(b.dataset.deluser, b.dataset.name)));
      } catch (e) { PS.alert(alertEl, "error", e.message); }
    }

    async function setBanned(id, banned) {
      PS.clearAlert(alertEl);
      try {
        const r = await PS.api(`/api/admin/${banned ? "ban" : "unban"}`, {
          method: "POST", body: { id: parseInt(id, 10) },
        });
        PS.alert(alertEl, "success",
          banned ? `Banned ${r.username}. Their sessions are dead immediately.`
                 : `Unbanned ${r.username}.`);
        loadUsers();
      } catch (e) { PS.alert(alertEl, "error", e.message); }
    }

    async function deleteUser(id, name) {
      if (!confirm(`Permanently delete "${name}"?\n\nTheir account, chat messages, follows and notifications go. Codes they uploaded stay in the vault for other trainers.`)) return;
      PS.clearAlert(alertEl);
      try {
        const r = await PS.api("/api/admin/users", { method: "DELETE", body: { id: parseInt(id, 10) } });
        PS.alert(alertEl, "success", `Deleted ${r.username}.`);
        loadUsers();
        loadCodes();
      } catch (e) { PS.alert(alertEl, "error", e.message); }
    }

    document.getElementById("refresh-users").addEventListener("click", loadUsers);

    /* ---------- single add ---------- */
    document.getElementById("single-add").addEventListener("click", async () => {
      const code = document.getElementById("single-code").value.trim().toUpperCase();
      const pack = document.getElementById("single-pack").value.trim();
      PS.clearAlert(alertEl);
      try {
        await PS.api("/api/codes/upload", { method: "POST", body: { code, pack_name: pack } });
        PS.alert(alertEl, "success", `Added ${code}.`);
        document.getElementById("single-code").value = "";
        document.getElementById("single-pack").value = "";
        loadCodes();
      } catch (e) { PS.alert(alertEl, "error", e.message); }
    });

    /* ---------- bulk add ---------- */
    document.getElementById("bulk-add").addEventListener("click", async () => {
      const text = document.getElementById("bulk-text").value;
      if (!text.trim()) return;
      PS.clearAlert(alertEl);
      try {
        const data = await PS.api("/api/admin/codes", { method: "POST", body: { text } });
        const skipped = data.skipped.length ? ` (${data.skipped.length} skipped)` : "";
        PS.alert(alertEl, "success", `Added ${data.added} code(s)${skipped}.`);
        document.getElementById("bulk-text").value = "";
        loadCodes();
      } catch (e) { PS.alert(alertEl, "error", e.message); }
    });

    /* ---------- bonus video ---------- */
    const bonusInput   = document.getElementById("bonus-video");
    const bonusCurrent = document.getElementById("bonus-current");
    const previewWrap  = document.getElementById("bonus-preview-wrap");
    const preview      = document.getElementById("bonus-preview");

    function showBonus(id, updatedAt) {
      if (id) {
        bonusCurrent.innerHTML = `Currently pinned: <b>${esc(id)}</b>` +
          (updatedAt ? ` <span class="muted">(set ${esc(new Date(updatedAt).toLocaleString())})</span>` : "");
        preview.src = `https://www.youtube.com/embed/${encodeURIComponent(id)}?rel=0&modestbranding=1`;
        previewWrap.classList.remove("hidden");
      } else {
        bonusCurrent.textContent = "Nothing pinned — the newest non-live video from the channel is used.";
        preview.src = "";
        previewWrap.classList.add("hidden");
      }
    }

    async function loadBonus() {
      try {
        const d = await PS.api("/api/admin/settings");
        bonusInput.value = d.bonus_video_id || "";
        showBonus(d.bonus_video_id, d.updated_at);
      } catch (e) {
        bonusCurrent.textContent = "Couldn't load the current setting.";
        PS.alert(alertEl, "error", e.message);
      }
    }

    document.getElementById("bonus-save").addEventListener("click", async () => {
      PS.clearAlert(alertEl);
      try {
        const d = await PS.api("/api/admin/settings", {
          method: "POST",
          body: { bonus_video_id: bonusInput.value },
        });
        showBonus(d.bonus_video_id, new Date().toISOString());
        bonusInput.value = d.bonus_video_id || "";
        PS.alert(alertEl, "success", d.bonus_video_id
          ? `Bonus video pinned to ${d.bonus_video_id}.`
          : "Cleared — the newest non-live video will be used.");
      } catch (e) { PS.alert(alertEl, "error", e.message); }
    });

    document.getElementById("bonus-clear").addEventListener("click", async () => {
      PS.clearAlert(alertEl);
      try {
        await PS.api("/api/admin/settings", { method: "POST", body: { bonus_video_id: "" } });
        bonusInput.value = "";
        showBonus(null);
        PS.alert(alertEl, "success", "Cleared — the newest non-live video will be used.");
      } catch (e) { PS.alert(alertEl, "error", e.message); }
    });

    loadBonus();

    /* ---------- auto-format the single-code input ---------- */
    PS.attachCodeFormatter(document.getElementById("single-code"));

    /* ---------- camera scanner ---------- */
    PS.attachScanner({
      startBtn:    document.getElementById("scan-start"),
      stopBtn:     document.getElementById("scan-stop"),
      flipBtn:     document.getElementById("scan-flip"),
      video:       document.getElementById("scanner-video"),
      status:      document.getElementById("scan-status"),
      targetInput: document.getElementById("single-code"),
      alertEl,
    });

    // Housekeeping: drop expired codes older than 24h, then show the fresh list.
    PS.api("/api/admin/cleanup")
      .then((r) => { if (r.deleted) PS.alert(alertEl, "info", `Cleaned up ${r.deleted} expired code(s).`); })
      .catch(() => {})
      .finally(() => { loadCodes(); loadUsers(); });
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  }
}
