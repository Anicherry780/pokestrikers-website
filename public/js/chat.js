// Public chat: anyone can read, logged-in users can post. Polls for new
// messages rather than holding a socket open.
PS.mountHeader("chat");

const POLL_MS = 5000;

const alertEl   = document.getElementById("alert");
const log       = document.getElementById("chat-log");
const form      = document.getElementById("form");
const input     = document.getElementById("body");
const sendBtn   = document.getElementById("send");
const counter   = document.getElementById("counter");
const statusEl  = document.getElementById("chat-status");
const composer  = document.getElementById("composer");
const loginCta  = document.getElementById("login-cta");

const me = PS.getUser();
let lastId = 0;
let firstLoad = true;

if (!PS.isLoggedIn()) {
  composer.classList.add("hidden");
  loginCta.classList.remove("hidden");
}

const when = (iso) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};

// Only autoscroll if the reader is already at the bottom, so polling doesn't
// yank them away from something they're reading further up.
const atBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 60;

function render(messages, wasAtBottom) {
  if (firstLoad) log.innerHTML = "";

  for (const m of messages) {
    const mine = me && m.username === me.username;
    const row = document.createElement("div");
    row.className = "chat-msg" + (mine ? " mine" : "");
    row.innerHTML = `
      <div class="chat-meta">
        <span class="chat-user${m.is_admin ? " admin" : ""}">@${PS.esc(m.username)}</span>
        ${m.is_admin ? '<span class="chat-badge">admin</span>' : ""}
        <span class="chat-time muted">${PS.esc(when(m.created_at))}</span>
        ${me && me.is_admin ? `<button class="chat-del" data-id="${m.id}" title="Delete message">✕</button>` : ""}
      </div>
      <div class="chat-body">${PS.esc(m.body)}</div>`;
    log.appendChild(row);
    lastId = Math.max(lastId, m.id);
  }

  if (me && me.is_admin) {
    log.querySelectorAll(".chat-del:not([data-wired])").forEach((b) => {
      b.setAttribute("data-wired", "1");
      b.addEventListener("click", () => remove(b.dataset.id, b));
    });
  }

  if (wasAtBottom || firstLoad) log.scrollTop = log.scrollHeight;
}

async function remove(id, btn) {
  if (!confirm("Delete this message?")) return;
  btn.disabled = true;
  try {
    await PS.api(`/api/chat/${id}`, { method: "DELETE" });
    const row = btn.closest(".chat-msg");
    if (row) row.remove();
  } catch (e) {
    PS.alert(alertEl, "error", e.message);
    btn.disabled = false;
  }
}

async function poll() {
  const wasAtBottom = atBottom();
  try {
    const res = await fetch(`/api/chat${lastId ? "?since=" + lastId : ""}`, { cache: "no-store" });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "Couldn't load the chat.");

    if (firstLoad && !(d.messages || []).length) {
      log.innerHTML = `<p class="muted center">No messages yet. Say hello!</p>`;
      firstLoad = false;
    } else if ((d.messages || []).length) {
      render(d.messages, wasAtBottom);
      firstLoad = false;
    }
    statusEl.textContent = "live";
  } catch (e) {
    statusEl.textContent = "reconnecting…";
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  PS.clearAlert(alertEl);
  const body = input.value.trim();
  if (!body) return;

  sendBtn.disabled = true;
  try {
    await PS.api("/api/chat", { method: "POST", body: { body } });
    input.value = "";
    counter.textContent = "0";
    await poll();
    log.scrollTop = log.scrollHeight;
  } catch (err) {
    PS.alert(alertEl, "error", err.message);
  } finally {
    sendBtn.disabled = false;
    input.focus();
  }
});

input.addEventListener("input", () => { counter.textContent = input.value.length; });

poll();
setInterval(poll, POLL_MS);
