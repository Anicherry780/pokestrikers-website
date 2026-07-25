if (PS.requireAuth()) {
  PS.mountHeader("profile");

  const alertEl = document.getElementById("alert");
  const claimedBody  = document.querySelector("#claimed-table tbody");
  const uploadedBody = document.querySelector("#uploaded-table tbody");

  const day = (iso) => (iso ? new Date(iso).toLocaleDateString() : "—");

  /* ---------- delete account ---------- */
  const zone      = document.getElementById("danger-zone");
  const startBtn  = document.getElementById("delete-start");
  const confirmEl = document.getElementById("delete-confirm");
  const pwEl      = document.getElementById("delete-password");
  const goBtn     = document.getElementById("delete-confirm-btn");

  // The admin account can't be deleted (the server refuses too) — hide the whole
  // section rather than offer something that will only ever fail.
  const me = PS.getUser();
  if (me && me.is_admin) zone.classList.add("hidden");

  startBtn.addEventListener("click", () => {
    startBtn.classList.add("hidden");
    confirmEl.classList.remove("hidden");
    pwEl.focus();
  });

  document.getElementById("delete-cancel").addEventListener("click", () => {
    confirmEl.classList.add("hidden");
    startBtn.classList.remove("hidden");
    pwEl.value = "";
    PS.clearAlert(alertEl);
  });

  goBtn.addEventListener("click", async () => {
    if (!pwEl.value) { pwEl.focus(); return; }
    if (!confirm("Delete your account permanently? This cannot be undone.")) return;

    PS.clearAlert(alertEl);
    goBtn.disabled = true; goBtn.textContent = "Deleting…";
    try {
      await PS.api("/api/account/delete", { method: "POST", body: { password: pwEl.value } });
      // Clear the local session directly: PS.logout() would also work, but this
      // keeps the farewell visible instead of bouncing instantly.
      localStorage.removeItem(PS.TOKEN_KEY);
      localStorage.removeItem(PS.USER_KEY);
      document.querySelector(".wrap").innerHTML =
        `<div class="card center"><h1 class="title-glow">Account deleted</h1>
         <p class="muted">Your account and messages are gone. Thanks for sharing codes while you were here.</p>
         <a class="btn" href="index.html">Back to PokeStrikers</a></div>`;
    } catch (e) {
      PS.alert(alertEl, "error", e.message);
      goBtn.disabled = false; goBtn.textContent = "Permanently delete";
    }
  });

  (async () => {
    try {
      const d = await PS.api("/api/profile");

      document.getElementById("p-username").textContent = "@" + d.username;
      document.getElementById("p-since").textContent = "Member since " + day(d.member_since);
      document.getElementById("p-uploaded").textContent = d.totals.uploaded;
      document.getElementById("p-claimed").textContent = d.totals.claimed;

      claimedBody.innerHTML = d.recent_claimed.map((r) => `
        <tr>
          <td style="font-family:ui-monospace,monospace;">${PS.esc(r.code)}</td>
          <td>${PS.esc(r.pack_name)}</td>
          <td>${PS.esc(day(r.claimed_at))}</td>
        </tr>`).join("")
        || `<tr><td colspan="3" class="muted">No codes claimed yet.</td></tr>`;

      uploadedBody.innerHTML = d.recent_uploaded.map((r) => `
        <tr>
          <td>${PS.esc(r.pack_name)}</td>
          <td><span class="badge ${PS.esc(r.status)}">${PS.esc(r.status)}</span></td>
          <td>${PS.esc(day(r.uploaded_at))}</td>
        </tr>`).join("")
        || `<tr><td colspan="3" class="muted">Nothing shared yet. <a class="link" href="upload.html">Upload a code →</a></td></tr>`;
    } catch (e) {
      PS.alert(alertEl, "error", e.message);
    }
  })();
}
