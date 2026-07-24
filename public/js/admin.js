if (PS.requireAuth()) {
  PS.mountHeader("admin");

  const user = PS.getUser();
  const gate  = document.getElementById("gate");
  const panel = document.getElementById("panel");

  const isAdmin = user && user.username && user.username.toLowerCase() === "pokestrikers";
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
    async function loadUsers() {
      try {
        const data = await PS.api("/api/admin/users");
        usersBody.innerHTML = data.users.map((u) => `
          <tr>
            <td>${u.id}</td>
            <td>${esc(u.username)}</td>
            <td>${u.is_admin ? "✔" : ""}</td>
            <td>${(u.created_at||"").slice(0,10)}</td>
            <td>${u.daily_codes_used}</td>
            <td>${u.bonus_unlocked_today ? "✔" : ""}</td>
            <td>${u.uploaded}</td>
            <td>${u.claimed}</td>
          </tr>`).join("") || `<tr><td colspan="8" class="muted">No users yet.</td></tr>`;
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
