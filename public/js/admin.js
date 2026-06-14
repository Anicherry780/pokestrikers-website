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

    /* ---------- camera scanner ---------- */
    setupScanner(alertEl);

    loadCodes();
    loadUsers();
  }

  /* ============ SCANNER ============ */
  function setupScanner(alertEl) {
    const startBtn = document.getElementById("scan-start");
    const stopBtn  = document.getElementById("scan-stop");
    const video    = document.getElementById("scanner-video");
    const status   = document.getElementById("scan-status");
    const codeField = document.getElementById("single-code");

    const CODE_RE = /[A-Z0-9]{3}-[A-Z0-9]{4}-[A-Z0-9]{3}-[A-Z0-9]{3}/;
    let stream = null, rafId = null, scanning = false, busyOCR = false;
    let barcodeDetector = null;
    if ("BarcodeDetector" in window) {
      try { barcodeDetector = new BarcodeDetector({ formats: ["qr_code"] }); } catch {}
    }

    function found(raw) {
      const m = String(raw).toUpperCase().match(CODE_RE);
      if (!m) return false;
      codeField.value = m[0];
      status.textContent = `✅ Detected ${m[0]}. Filled in above.`;
      stop();
      codeField.scrollIntoView({ behavior: "smooth", block: "center" });
      return true;
    }

    async function loop() {
      if (!scanning) return;

      // 1) Try QR via BarcodeDetector
      if (barcodeDetector) {
        try {
          const codes = await barcodeDetector.detect(video);
          for (const c of codes) if (found(c.rawValue)) return;
        } catch {}
      }

      // 2) Fallback to OCR roughly every 2.5s (Tesseract is heavy)
      if (window.Tesseract && !busyOCR) {
        busyOCR = true;
        ocrFrame().finally(() => { busyOCR = false; });
      }

      rafId = requestAnimationFrame(loop);
    }

    let lastOCR = 0;
    async function ocrFrame() {
      const now = Date.now();
      if (now - lastOCR < 2500) return;
      lastOCR = now;
      if (!video.videoWidth) return;

      const canvas = document.createElement("canvas");
      // capture lower-third of the frame where the printed code usually sits, scaled up
      const cw = video.videoWidth, ch = video.videoHeight;
      canvas.width = cw; canvas.height = ch;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, cw, ch);

      status.textContent = "🔎 Reading text…";
      try {
        const { data } = await Tesseract.recognize(canvas, "eng", {
          tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-",
        });
        if (!found(data.text) && scanning) status.textContent = "Scanning… hold the code steady in view.";
      } catch {
        if (scanning) status.textContent = "Scanning…";
      }
    }

    async function start() {
      PS.clearAlert(alertEl);
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" }, audio: false,
        });
        video.srcObject = stream;
        await video.play();
        video.style.display = "block";
        startBtn.classList.add("hidden");
        stopBtn.classList.remove("hidden");
        scanning = true;
        status.textContent = barcodeDetector
          ? "Scanning… point at the QR code or the printed code."
          : "Scanning via OCR… point at the printed code (QR scanner not supported on this browser).";
        loop();
      } catch (e) {
        PS.alert(alertEl, "error", "Couldn't access the camera: " + e.message);
      }
    }

    function stop() {
      scanning = false;
      if (rafId) cancelAnimationFrame(rafId);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      stream = null;
      video.style.display = "none";
      startBtn.classList.remove("hidden");
      stopBtn.classList.add("hidden");
    }

    startBtn.addEventListener("click", start);
    stopBtn.addEventListener("click", () => { stop(); status.textContent = "Camera stopped."; });
    window.addEventListener("beforeunload", stop);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  }
}
