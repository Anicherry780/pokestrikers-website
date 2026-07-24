if (PS.requireAuth()) {
  PS.mountHeader("profile");

  const alertEl = document.getElementById("alert");
  const claimedBody  = document.querySelector("#claimed-table tbody");
  const uploadedBody = document.querySelector("#uploaded-table tbody");

  const day = (iso) => (iso ? new Date(iso).toLocaleDateString() : "—");

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
