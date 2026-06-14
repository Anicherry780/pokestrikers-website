// Dashboard logic: claim flow + 24h cooldown, plus watch-to-unlock bonus video.
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

  const cooldownWrap  = document.getElementById("cooldown-wrap");
  const cooldownTimer = document.getElementById("cooldown-timer");

  const bonusActive  = document.getElementById("bonus-active");
  const bonusDone    = document.getElementById("bonus-done");
  const bonusHelp    = document.getElementById("bonus-help");
  const bonusStatus  = document.getElementById("bonus-watch-status");

  let allowance = 1, used = 0, cooldownEndIso = null;
  let claimInterval = null, cooldownInterval = null;

  /* ================= state painting ================= */
  function paintCounts() {
    remEl.textContent = Math.max(0, allowance - used);
  }

  async function refresh() {
    try {
      const data = await PS.api("/api/me");
      PS.setAuth(PS.getToken(), data.user);   // keep cached user fresh
      allowance = data.allowance;
      used = data.user.daily_codes_used;
      cooldownEndIso = data.user.reset_at;
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
      if (used >= 2) {
        claimBtn.textContent = "Daily limit reached";
        claimHelp.textContent = "You've claimed your 2 codes. Your next codes unlock when the 24h cooldown ends.";
        startCooldownCountdown();
      } else {
        claimBtn.textContent = "Free code used — unlock bonus below";
        claimHelp.textContent = "You've used your free code. Watch the full video below to unlock a 2nd one 👇";
        stopCooldownCountdown();
      }
    } else {
      claimBtn.disabled = false;
      claimBtn.textContent = "🎴 Claim a code";
      stopCooldownCountdown();
    }
  }

  /* ================= 24h cooldown countdown ================= */
  function startCooldownCountdown() {
    stopCooldownCountdown();
    if (!cooldownEndIso) { cooldownWrap.classList.add("hidden"); return; }
    const end = new Date(cooldownEndIso).getTime();
    const tick = () => {
      const left = end - Date.now();
      if (left <= 0) {
        stopCooldownCountdown();
        refresh();   // window has reset — reload fresh state
        return;
      }
      cooldownWrap.classList.remove("hidden");
      cooldownTimer.textContent = PS.fmtClock(left);
    };
    tick();
    cooldownInterval = setInterval(tick, 1000);
  }
  function stopCooldownCountdown() {
    if (cooldownInterval) clearInterval(cooldownInterval);
    cooldownInterval = null;
    cooldownWrap.classList.add("hidden");
  }

  /* ================= CLAIM ================= */
  claimBtn.addEventListener("click", async () => {
    PS.clearAlert(alertEl);
    claimBtn.disabled = true; claimBtn.textContent = "Claiming…";
    try {
      const data = await PS.api("/api/codes/claim");
      used = data.daily_codes_used;
      allowance = data.allowance;
      cooldownEndIso = data.reset_at || cooldownEndIso;
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
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); copyBtn.textContent = "✅ Copied!"; }
      catch { copyBtn.textContent = "Copy failed, select manually"; }
      ta.remove();
    }
  });

  /* ================= BONUS: watch the full video to unlock ================= */
  // Channel @PokeStrikers (UCGJnR3Eky-tBz4TPGUs-S-A). Start from a known recent
  // video, upgrade to the newest upload via /api/latest-video.
  const FALLBACK_VIDEO = "cgPvGAPyzlA";
  let ytPlayer = null, ytApiReady = false, playerBuilt = false, pendingVideoId = null;
  let unlocking = false;

  // Load the YouTube IFrame Player API once.
  (function loadYouTubeAPI() {
    if (window.YT && window.YT.Player) { ytApiReady = true; return; }
    window.onYouTubeIframeAPIReady = () => {
      ytApiReady = true;
      if (pendingVideoId) buildPlayer(pendingVideoId);
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  })();

  function buildPlayer(videoId) {
    if (playerBuilt) {
      if (ytPlayer && ytPlayer.cueVideoById) ytPlayer.cueVideoById(videoId);
      return;
    }
    if (!ytApiReady) { pendingVideoId = videoId; return; }
    playerBuilt = true;
    ytPlayer = new YT.Player("yt-frame", {
      videoId,
      playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
      events: {
        onStateChange: (e) => {
          if (window.YT && e.data === YT.PlayerState.ENDED) onVideoEnded();
        },
      },
    });
  }

  let embedSet = false;
  function setEmbed() {
    if (embedSet) return;
    embedSet = true;
    buildPlayer(FALLBACK_VIDEO);                       // show something immediately
    fetch("/api/latest-video")                         // upgrade to the newest upload
      .then((r) => r.json())
      .then((d) => {
        if (!d || !d.videoId || d.videoId === FALLBACK_VIDEO) return;
        if (ytPlayer && ytPlayer.cueVideoById) ytPlayer.cueVideoById(d.videoId);
        else pendingVideoId = d.videoId;
      })
      .catch(() => {});
  }

  async function onVideoEnded() {
    if (unlocking) return;
    unlocking = true;
    if (bonusStatus) bonusStatus.textContent = "Unlocking your bonus code…";
    try {
      await PS.api("/api/bonus/unlock", { method: "POST" });
      bonusActive.classList.add("hidden");
      bonusDone.classList.remove("hidden");
      PS.alert(alertEl, "success", "🎉 Bonus code unlocked! Claim it above.");
      refresh();
    } catch (e) {
      unlocking = false;
      PS.alert(alertEl, "error", e.message);
    }
  }

  function paintBonus(user) {
    if (user && user.bonus_unlocked_today) {
      bonusActive.classList.add("hidden");
      bonusDone.classList.remove("hidden");
      bonusHelp.textContent = "You've unlocked your bonus code for this cycle.";
      if (ytPlayer && ytPlayer.stopVideo) ytPlayer.stopVideo();
      return;
    }
    bonusDone.classList.add("hidden");
    bonusActive.classList.remove("hidden");
    bonusHelp.textContent = "Watch the full PokeStrikers video below to unlock a 2nd code.";
    setEmbed();
  }

  /* ================= init ================= */
  // Render bonus + claim immediately from cached state so the page isn't blank
  // while /api/me loads; refresh() then corrects with the authoritative state.
  paintBonus(PS.getUser());
  refresh();
  setInterval(() => {
    PS.api("/api/me").then((d) => { availEl.textContent = d.available_codes; }).catch(() => {});
  }, 30000);
}
