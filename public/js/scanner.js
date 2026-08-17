// Shared camera code scanner: QR via BarcodeDetector, OCR fallback via Tesseract.js.
// Runs entirely in the browser — nothing is uploaded. Requires PS (common.js).
PS.attachScanner = function ({ startBtn, stopBtn, flipBtn, video, status, targetInput, alertEl, onFound }) {
  if (!startBtn || !video || !targetInput) return;

  const setStatus = (t) => { if (status) status.textContent = t; };
  const CODE_RE = /[A-Z0-9]{3}-[A-Z0-9]{4}-[A-Z0-9]{3}-[A-Z0-9]{3}/;
  const FACING_KEY = "ps_cam_facing";

  let stream = null, rafId = null, scanning = false, busyOCR = false, lastOCR = 0;
  // Rear camera by default — that's the one pointed at the card. Remembered so a
  // phone that needs the other one doesn't have to be corrected every visit.
  let facing = localStorage.getItem(FACING_KEY) === "user" ? "user" : "environment";

  let barcodeDetector = null;
  if ("BarcodeDetector" in window) {
    try { barcodeDetector = new BarcodeDetector({ formats: ["qr_code"] }); } catch {}
  }

  function found(raw) {
    const m = String(raw).toUpperCase().match(CODE_RE);
    if (!m) return false;
    targetInput.value = m[0];
    targetInput.dispatchEvent(new Event("input", { bubbles: true })); // trigger auto-format
    setStatus(`✅ Detected ${m[0]}. Filled in above.`);
    stop();
    targetInput.scrollIntoView({ behavior: "smooth", block: "center" });
    if (typeof onFound === "function") onFound(m[0]);
    return true;
  }

  async function loop() {
    if (!scanning) return;
    if (barcodeDetector) {
      try {
        const codes = await barcodeDetector.detect(video);
        for (const c of codes) if (found(c.rawValue)) return;
      } catch {}
    }
    if (window.Tesseract && !busyOCR) {
      busyOCR = true;
      ocrFrame().finally(() => { busyOCR = false; });
    }
    rafId = requestAnimationFrame(loop);
  }

  async function ocrFrame() {
    const now = Date.now();
    if (now - lastOCR < 2500) return;   // Tesseract is heavy — throttle
    lastOCR = now;
    if (!video.videoWidth) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);

    setStatus("🔎 Reading text…");
    try {
      const { data } = await Tesseract.recognize(canvas, "eng", {
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-",
      });
      if (!found(data.text) && scanning) setStatus("Scanning… hold the code steady in view.");
    } catch {
      if (scanning) setStatus("Scanning…");
    }
  }

  // Plain `facingMode: "environment"` is only a preference — a phone that can't
  // satisfy it silently hands back the selfie camera instead, which is why the
  // scanner kept opening front-facing. `exact` makes it a hard requirement, and
  // we only fall back to the loose form (then to any camera at all) if that
  // genuinely isn't available.
  async function openStream(mode) {
    const attempts = [
      { video: { facingMode: { exact: mode } }, audio: false },
      { video: { facingMode: mode }, audio: false },
      { video: true, audio: false },
    ];
    let lastErr;
    for (const constraints of attempts) {
      try {
        return await navigator.mediaDevices.getUserMedia(constraints);
      } catch (e) { lastErr = e; }
    }
    throw lastErr;
  }

  function stopTracks() {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    // iOS Safari can hand back the very same track if the element still holds
    // the old stream when the next request goes out. Detaching first is what
    // makes switching cameras actually take effect there.
    video.srcObject = null;
  }

  // Mirror only the front lens, the way a selfie view does. Detection reads the
  // raw frame, so this is purely cosmetic.
  function applyMirror() {
    video.style.transform = facing === "user" ? "scaleX(-1)" : "";
  }

  /* ---------- camera list ---------- */
  // Toggling facingMode is not enough on phones with several rear lenses — an
  // iPhone Pro exposes wide, ultra-wide and telephoto as separate devices, and
  // asking for "environment" can keep returning the same one. Flip therefore
  // steps through the actual device list, so every lens is reachable.
  let cameras = [];

  // iOS WKWebView (Chrome, Edge, Firefox on iPhone) reports cameras with empty
  // deviceId strings. Requiring an id here dropped every camera on those
  // browsers, so the list came back empty and flip silently fell back to the
  // facingMode toggle. Keep them all; selection copes with missing ids below.
  async function refreshCameras() {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      cameras = all.filter((d) => d.kind === "videoinput");
    } catch {
      cameras = [];
    }
  }

  // Labels are the one reliable signal on iOS: "Front Camera", "Back Camera",
  // "Back Dual Wide Camera". facingMode is frequently absent from getSettings()
  // there, so it can't be trusted on its own.
  const FRONT_RE = /front|face[^b]|user|selfie/i;
  const BACK_RE = /back|rear|environment|world/i;

  const selectable = () => cameras.filter((c) => c.deviceId);
  const backCamera = () => selectable().find((c) => BACK_RE.test(c.label || ""));

  // Work out which way the live track actually points, preferring the reported
  // facingMode and falling back to the label.
  function inferFacing() {
    const s = activeSettings();
    if (s.facingMode === "user" || s.facingMode === "environment") return s.facingMode;
    const t = activeTrack();
    return FRONT_RE.test((t && t.label) || "") ? "user" : "environment";
  }

  const activeTrack = () => (stream ? stream.getVideoTracks()[0] : null);

  function activeSettings() {
    const t = activeTrack();
    try { return t && t.getSettings ? t.getSettings() : {}; } catch { return {}; }
  }

  // Prefer the label the browser gives the lens ("Back Ultra Wide Camera"), so
  // it is obvious the button did something.
  function activeLabel() {
    const t = activeTrack();
    if (t && t.label) return t.label;
    const s = activeSettings();
    return s.facingMode === "user" ? "front camera" : "rear camera";
  }

  function cameraPosition() {
    const list = selectable();
    if (list.length < 2) return "";
    const id = activeSettings().deviceId;
    const i = list.findIndex((c) => c.deviceId === id);
    return i >= 0 ? ` (${i + 1} of ${list.length})` : "";
  }

  // Shown whenever the camera is running. Gating this on enumerateDevices()
  // reporting two cameras was a mistake: several mobile browsers under-report
  // the count, which hid the control on exactly the phones that needed it. A
  // flip on a single-camera device simply reopens the same one, which is a far
  // better failure than the button never appearing.
  function showFlip() {
    if (flipBtn) flipBtn.classList.remove("hidden");
  }

  // Always names the lens in use, so tapping Flip visibly does something even
  // when several rear cameras look alike on screen.
  const readyMessage = () =>
    (barcodeDetector ? "Scanning… " : "Scanning via OCR… ") +
    `Using: ${activeLabel()}${cameraPosition()}. ` +
    "Tap 🔄 Flip camera to switch.";

  async function start() {
    if (alertEl) PS.clearAlert(alertEl);
    try {
      stream = await openStream(facing);
      video.srcObject = stream;
      applyMirror();
      // Reveal the element before play(): some mobile browsers refuse to start
      // a display:none video. play() is also not awaited — a browser that never
      // resolves it would otherwise leave the scanner looking dead, and the
      // frame grab works as soon as frames arrive regardless.
      video.style.display = "block";
      video.play().catch(() => {});
      startBtn.classList.add("hidden");
      if (stopBtn) stopBtn.classList.remove("hidden");
      showFlip();
      // Labels are only populated once permission has been granted, so the list
      // is read after the first successful open, not before.
      await refreshCameras();

      // Some browsers hand back the selfie camera even when the rear one was
      // requested with `exact`. If the list names a back-facing lens we can
      // select directly, correct it without waiting for the user to tap Flip.
      if (facing === "environment" && inferFacing() === "user") {
        const back = backCamera();
        if (back) {
          try {
            stopTracks();
            stream = await navigator.mediaDevices.getUserMedia({
              video: { deviceId: { exact: back.deviceId } }, audio: false,
            });
            video.srcObject = stream;
            video.play().catch(() => {});
          } catch { /* keep whatever we already had */ }
        }
      }

      facing = inferFacing();
      applyMirror();
      scanning = true;
      setStatus(readyMessage());
      loop();
    } catch (e) {
      const msg = "Couldn't access the camera: " + e.message;
      if (alertEl) PS.alert(alertEl, "error", msg); else setStatus(msg);
    }
  }

  // Step to the next camera. The scan loop keeps running against the same
  // <video>, which simply receives a new stream.
  //
  // Cycling the device list rather than toggling facingMode is what makes this
  // work on multi-lens phones: an iPhone Pro reports wide, ultra-wide and
  // telephoto separately, and repeatedly asking for "environment" can return
  // the same lens every time. Tapping Flip walks through all of them.
  async function flip() {
    if (!stream) return;
    if (flipBtn) flipBtn.disabled = true;
    setStatus("Switching camera…");

    const previous = activeSettings().deviceId;
    try {
      await refreshCameras();
      const pickable = selectable();

      // Only cycle by id when ids actually exist. On iOS WKWebView they are
      // empty strings, so the facingMode toggle below is the only option there.
      if (pickable.length > 1) {
        const at = pickable.findIndex((c) => c.deviceId === previous);
        const next = pickable[(at + 1) % pickable.length];   // at === -1 starts at 0

        stopTracks();
        stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: next.deviceId } }, audio: false,
        });
      } else {
        // No selectable ids: flip the facing hint, based on what is actually
        // live rather than a remembered value that may have drifted.
        facing = inferFacing() === "environment" ? "user" : "environment";
        stopTracks();
        stream = await openStream(facing);
      }

      // Record what actually opened. This previously read facingMode directly
      // and defaulted to "environment" whenever it was absent — which on iOS is
      // always — so the stored value reset every time and each tap re-opened
      // the front camera.
      facing = inferFacing();
      localStorage.setItem(FACING_KEY, facing);

      video.srcObject = stream;
      applyMirror();
      video.play().catch(() => {});
      setStatus(readyMessage());
    } catch (e) {
      // Whatever we tried refused to open — get *a* camera back rather than
      // leaving the user staring at a dead preview.
      try {
        stopTracks();
        stream = await openStream(facing);
        video.srcObject = stream;
        applyMirror();
        video.play().catch(() => {});
      } catch {}
      setStatus("Couldn't switch camera: " + e.message);
    } finally {
      if (flipBtn) flipBtn.disabled = false;
    }
  }

  function stop() {
    scanning = false;
    if (rafId) cancelAnimationFrame(rafId);
    stopTracks();
    video.style.display = "none";
    startBtn.classList.remove("hidden");
    if (stopBtn) stopBtn.classList.add("hidden");
    if (flipBtn) flipBtn.classList.add("hidden");
  }

  startBtn.addEventListener("click", start);
  if (stopBtn) stopBtn.addEventListener("click", () => { stop(); setStatus("Camera stopped."); });
  if (flipBtn) flipBtn.addEventListener("click", flip);
  window.addEventListener("beforeunload", stop);
};
