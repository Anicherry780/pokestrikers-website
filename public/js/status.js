// Public code status lookup — works logged in or out.
PS.mountHeader("status");

const alertEl = document.getElementById("alert");
const form    = document.getElementById("form");
const input   = document.getElementById("code");
const btn     = document.getElementById("submit");
const result  = document.getElementById("result");

PS.attachCodeFormatter(input);

const when = (iso) => (iso ? new Date(iso).toLocaleString() : "");

function render(d) {
  const code = `<div class="status-code">${PS.esc(d.code)}</div>`;
  let cls = "info", head = "", body = "";

  switch (d.status) {
    case "available":
      cls = "good";
      head = "✅ Available right now";
      body = `Set: <b>${PS.esc(d.pack_name)}</b><br />Added ${PS.esc(when(d.uploaded_at))}.
              <br /><a class="link" href="dashboard.html">Log in to claim it →</a>`;
      break;
    case "claimed":
      cls = "warn";
      head = "⏳ Claimed";
      body = `Set: <b>${PS.esc(d.pack_name)}</b><br />Claimed by
              <b>@${PS.esc(d.claimer || "someone")}</b> on ${PS.esc(when(d.claimed_at))}.`;
      break;
    case "expired":
      cls = "bad";
      head = "⌛ Expired";
      body = `Set: <b>${PS.esc(d.pack_name)}</b><br />This one was claimed but not redeemed in time.`;
      break;
    case "used":
      cls = "bad";
      head = "🚫 Already used";
      body = `This code has already been claimed or expired, so it can't be uploaded again.`;
      break;
    default:
      cls = "info";
      head = "🔍 Not found in the vault";
      body = `Nobody has shared this code on PokeStrikers.
              <a class="link" href="upload.html">Got it spare? Upload it →</a>`;
  }

  result.className = `status-result ${cls}`;
  result.innerHTML = `${code}<h3>${head}</h3><p class="muted">${body}</p>`;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  PS.clearAlert(alertEl);
  result.classList.add("hidden");

  const code = input.value.trim().toUpperCase();
  if (!/^[A-Z0-9]{3}-[A-Z0-9]{4}-[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(code)) {
    PS.alert(alertEl, "error", "Code must be in the format XXX-XXXX-XXX-XXX.");
    return;
  }

  btn.disabled = true; btn.textContent = "Checking…";
  try {
    const res = await fetch("/api/status?code=" + encodeURIComponent(code));
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "Couldn't check that code.");
    render(d);
  } catch (err) {
    PS.alert(alertEl, "error", err.message);
  } finally {
    btn.disabled = false; btn.textContent = "Check";
  }
});
