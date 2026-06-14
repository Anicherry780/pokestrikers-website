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
  // video, upgrade to the newest upload via /api/latest-video. We render a plain
  // iframe (always shows the video) and attach the IFrame API only to detect when
  // the video finishes, so the player is never blank even if the API is slow.
  const FALLBACK_VIDEO = "cgPvGAPyzlA";
  const ytFrame = document.getElementById("yt-frame");
  let ytPlayer = null, currentVideoId = null, unlocking = false, apiLoading = false;

  const srcFor = (id) =>
    `https://www.youtube.com/embed/${id}?enablejsapi=1&rel=0&modestbranding=1&playsinline=1&origin=${encodeURIComponent(location.origin)}`;
  function setSrc(id) { currentVideoId = id; ytFrame.src = srcFor(id); }

  // Load the IFrame API once, then attach a player to the existing iframe for the
  // ENDED event. The video plays regardless of whether this succeeds.
  function attachApi() {
    const build = () => { if (!ytPlayer) ytPlayer = new YT.Player(ytFrame, {
      events: {
        onStateChange: (e) => { if (window.YT && e.data === YT.PlayerState.ENDED) onVideoEnded(); },
      },
    }); };
    if (window.YT && window.YT.Player) { build(); return; }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if (typeof prev === "function") prev(); build(); };
    if (!apiLoading) {
      apiLoading = true;
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    }
  }

  let embedSet = false;
  function setEmbed() {
    if (embedSet) return;
    embedSet = true;
    setSrc(FALLBACK_VIDEO);                             // show the video immediately
    fetch("/api/latest-video")                          // upgrade to the newest upload
      .then((r) => r.json())
      .then((d) => { if (d && d.videoId && d.videoId !== currentVideoId) setSrc(d.videoId); })
      .catch(() => {})
      .finally(() => attachApi());                      // attach end-detection last
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
      if (ytFrame) ytFrame.src = "";   // stop playback once unlocked
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
