// Dashboard logic: daily limit, claim countdown, bonus video timer.
if (PS.requireAuth()) {
  PS.mountHeader("dashboard");

  const alertEl   = document.getElementById("alert");
  const remEl     = document.getElementById("remaining-today");
  const availEl   = document.getElementById("available");
  const claimBtn  = document.getElementById("claim-btn");
  const claimHelp = document.getElementById("claim-help");

  const reveal     = document.getElementById("reveal");
  const revealCode = document.getElementById("reveal-code");
  const revealPack = document.getElementById("reveal-pack");
  const copyBtn    = document.getElementById("copy-btn");
  const timerFill  = document.getElementById("timer-fill");
  const timerText  = document.getElementById("timer-text");

  // Embedded PokeStrikers videos. A YouTube @handle can't be embedded directly —
  // this uses the channel's uploads feed. If it doesn't load, paste your channel's
  // UPLOADS playlist id (starts "UU…") as `&list=UU...`, or a single video id:
  //   https://www.youtube.com/embed/VIDEO_ID?rel=0
  const YT_EMBED_URL = "https://www.youtube.com/embed?listType=user_uploads&list=PokeStrikers&rel=0&modestbranding=1";
  const bonusActive = document.getElementById("bonus-active");
  const ytFrame     = document.getElementById("yt-frame");
  const bonusDone   = document.getElementById("bonus-done");
  const bonusHelp   = document.getElementById("bonus-help");
  const bonusTimer  = document.getElementById("bonus-timer");
  const bonusFill   = document.getElementById("bonus-fill");

  let allowance = 1, used = 0;
  let claimInterval = null;
  let bonusInterval = null;

  function paintCounts() {
    remEl.textContent = Math.max(0, allowance - used);
  }

  async function refresh() {
    try {
      const data = await PS.api("/api/me");
      PS.setAuth(PS.getToken(), data.user);   // keep cached user fresh
      allowance = data.allowance;
      used = data.user.daily_codes_used;
      availEl.textContent = data.available_codes;
      paintCounts();
      paintClaim();
      paintBonus(data.user);
    } catch (e) {
      PS.alert(alertEl, "error", e.message);
    }
  }

  function paintClaim() {
    if (used >= allowance) {
      claimBtn.disabled = true;
      claimBtn.textContent = used >= 2 ? "Daily limit reached" : "Claim used, unlock bonus below";
      claimHelp.textContent = used >= 2
        ? "You've claimed your 2 codes today. Come back tomorrow!"
        : "You've used today's free code. Unlock a 2nd one below 👇";
    } else {
      claimBtn.disabled = false;
      claimBtn.textContent = "🎴 Claim a code";
    }
  }

  // ---------- CLAIM ----------
  claimBtn.addEventListener("click", async () => {
    PS.clearAlert(alertEl);
    claimBtn.disabled = true; claimBtn.textContent = "Claiming…";
    try {
      const data = await PS.api("/api/codes/claim");
      used = data.daily_codes_used;
      allowance = data.allowance;
      paintCounts();
      showCode(data);
      refresh();
    } catch (e) {
      PS.alert(alertEl, "error", e.message);
      paintClaim();
    }
  });

  function showCode(data) {
    revealCode.textContent = data.code;
    revealPack.textContent = data.pack_name;
    reveal.classList.remove("hidden");
    claimBtn.classList.add("hidden");
    copyBtn.textContent = "📋 Copy code";

    const total = data.window_ms;
    const end = new Date(data.expires_at).getTime();
    if (claimInterval) clearInterval(claimInterval);

    const tick = () => {
      const left = end - Date.now();
      if (left <= 0) {
        clearInterval(claimInterval);
        reveal.classList.add("hidden");
        claimBtn.classList.remove("hidden");
        PS.alert(alertEl, "info", "That code expired. Hope you copied it in time!");
        paintClaim();
        return;
      }
      timerText.textContent = PS.fmtTime(left);
      timerFill.style.width = Math.max(0, (left / total) * 100) + "%";
      timerText.classList.toggle("danger", left < 60000);
    };
    tick();
    claimInterval = setInterval(tick, 250);
  }

  copyBtn.addEventListener("click", async () => {
    const text = revealCode.textContent;
    try {
      await navigator.clipboard.writeText(text);
      copyBtn.textContent = "✅ Copied!";
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); copyBtn.textContent = "✅ Copied!"; }
      catch { copyBtn.textContent = "Copy failed, select manually"; }
      ta.remove();
    }
  });

  // ---------- BONUS ----------
  let bonusStarted = false;

  function paintBonus(user) {
    if (user.bonus_unlocked_today) {
      bonusActive.classList.add("hidden");
      bonusDone.classList.remove("hidden");
      bonusHelp.textContent = "You've unlocked your bonus code for today.";
      if (ytFrame.src) ytFrame.src = "";   // stop playback once unlocked
      if (bonusInterval) clearInterval(bonusInterval);
      return;
    }
    // Not unlocked: show the embedded player and run the 10-min timer on this page.
    bonusDone.classList.add("hidden");
    bonusActive.classList.remove("hidden");
    if (!ytFrame.src) ytFrame.src = YT_EMBED_URL;
    beginBonus();
  }

  async function beginBonus() {
    if (bonusStarted) return;            // idempotent — only start once per load
    bonusStarted = true;
    try {
      await PS.api("/api/bonus/start-timer", { method: "POST" });
    } catch (e) {
      PS.alert(alertEl, "error", e.message);
    }
    startBonusCountdown();
  }

  function startBonusCountdown() {
    if (bonusInterval) clearInterval(bonusInterval);

    const poll = async () => {
      try {
        const r = await PS.api("/api/bonus/check-timer");
        if (r.unlocked) {
          clearInterval(bonusInterval);
          bonusActive.classList.add("hidden");
          bonusDone.classList.remove("hidden");
          ytFrame.src = "";
          PS.alert(alertEl, "success", "🎉 Bonus code unlocked! Claim it above.");
          refresh();
          return;
        }
        const total = 10 * 60 * 1000;
        bonusTimer.textContent = PS.fmtTime(r.remaining_ms);
        bonusFill.style.width = (100 - (r.remaining_ms / total) * 100) + "%";
      } catch (e) {
        // keep trying; show error once
      }
    };
    poll();
    bonusInterval = setInterval(poll, 2000);
  }

  refresh();
  // keep available-count fresh
  setInterval(() => {
    PS.api("/api/me").then(d => { availEl.textContent = d.available_codes; }).catch(()=>{});
  }, 30000);
}
