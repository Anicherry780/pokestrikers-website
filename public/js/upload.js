if (PS.requireAuth()) {
  PS.mountHeader("upload");

  const alertEl    = document.getElementById("alert");
  const form       = document.getElementById("form");
  const codeInput  = document.getElementById("code");
  const packSelect = document.getElementById("pack");
  const customWrap = document.getElementById("custom-wrap");
  const customPack = document.getElementById("custom-pack");
  const btn        = document.getElementById("submit");

  // Build dropdown: admin-added sets first, then the built-ins.
  function buildOptions(custom) {
    const seen = new Set();
    const merged = [...(custom || []), ...POKE_PACKS].filter((p) => {
      const k = p.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const opts = ['<option value="">Random Pack (leave blank)</option>'];
    for (const p of merged) opts.push(`<option value="${PS.esc(p)}">${PS.esc(p)}</option>`);
    opts.push('<option value="__other__">Other (type my own)…</option>');
    packSelect.innerHTML = opts.join("");
  }

  buildOptions([]);                                   // render immediately
  PS.api("/api/sets")                                 // then fold in added sets
    .then((d) => buildOptions(d.sets))
    .catch(() => {});

  // auto-insert dashes as the user types
  PS.attachCodeFormatter(codeInput);

  // camera scanner fills the code field
  PS.attachScanner({
    startBtn:    document.getElementById("scan-start"),
    stopBtn:     document.getElementById("scan-stop"),
    video:       document.getElementById("scanner-video"),
    status:      document.getElementById("scan-status"),
    targetInput: codeInput,
    alertEl,
  });

  packSelect.addEventListener("change", () => {
    customWrap.classList.toggle("hidden", packSelect.value !== "__other__");
  });

  function resolvePack() {
    if (packSelect.value === "__other__") return customPack.value.trim();
    return packSelect.value; // "" => server defaults to "Random Pack"
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    PS.clearAlert(alertEl);
    const code = codeInput.value.trim().toUpperCase();
    if (!/^[A-Z0-9]{3}-[A-Z0-9]{4}-[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(code)) {
      PS.alert(alertEl, "error", "Code must be in the format XXX-XXXX-XXX-XXX.");
      return;
    }
    btn.disabled = true; btn.textContent = "Uploading…";
    try {
      const data = await PS.api("/api/codes/upload", {
        method: "POST",
        body: { code, pack_name: resolvePack() },
      });
      PS.alert(alertEl, "success", `✅ Uploaded! "${data.code}" (${data.pack_name}) is now in the vault.`);
      form.reset();
      customWrap.classList.add("hidden");
    } catch (err) {
      PS.alert(alertEl, "error", err.message);
    } finally {
      btn.disabled = false; btn.textContent = "Upload code";
    }
  });
}
