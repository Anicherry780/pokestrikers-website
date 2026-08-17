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
  }

  // The front camera is shown mirrored, the way every selfie view does, so
  // moving the card left moves it left on screen. Detection reads the raw frame,
  // so this is purely cosmetic.
  function applyMirror() {
    video.style.transform = facing === "user" ? "scaleX(-1)" : "";
  }

  // Shown whenever the camera is running. Gating this on enumerateDevices()
  // reporting two cameras was a mistake: several mobile browsers under-report
  // the count, which hid the control on exactly the phones that needed it. A
  // flip on a single-camera device simply reopens the same one, which is a far
  // better failure than the button never appearing.
  function showFlip() {
    if (flipBtn) flipBtn.classList.remove("hidden");
  }

  const readyMessage = () =>
    (barcodeDetector
      ? "Scanning… point at the QR code or the printed code."
      : "Scanning via OCR… point at the printed code.") +
    (facing === "user" ? " Using the front camera — tap 🔄 Flip camera to switch." : "");

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
      scanning = true;
      setStatus(readyMessage());
      loop();
    } catch (e) {
      const msg = "Couldn't access the camera: " + e.message;
      if (alertEl) PS.alert(alertEl, "error", msg); else setStatus(msg);
    }
  }

  // Swap cameras without tearing the scan loop down — the loop keeps reading the
  // same <video>, which simply gets a new stream.
  async function flip() {
    if (!stream) return;
    facing = facing === "environment" ? "user" : "environment";
    localStorage.setItem(FACING_KEY, facing);

    if (flipBtn) flipBtn.disabled = true;
    setStatus("Switching camera…");
    try {
      stopTracks();
      stream = await openStream(facing);
      video.srcObject = stream;
      applyMirror();
      video.play().catch(() => {});
      setStatus(readyMessage());
    } catch (e) {
      // Put it back if the other camera refused to open.
      facing = facing === "environment" ? "user" : "environment";
      localStorage.setItem(FACING_KEY, facing);
      try {
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
