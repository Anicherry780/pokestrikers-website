// Shared camera code scanner: QR via BarcodeDetector, OCR fallback via Tesseract.js.
// Runs entirely in the browser — nothing is uploaded. Requires PS (common.js).
PS.attachScanner = function ({ startBtn, stopBtn, video, status, targetInput, alertEl, onFound }) {
  if (!startBtn || !video || !targetInput) return;

  const setStatus = (t) => { if (status) status.textContent = t; };
  const CODE_RE = /[A-Z0-9]{3}-[A-Z0-9]{4}-[A-Z0-9]{3}-[A-Z0-9]{3}/;
  let stream = null, rafId = null, scanning = false, busyOCR = false, lastOCR = 0;

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

  async function start() {
    if (alertEl) PS.clearAlert(alertEl);
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      video.srcObject = stream;
      await video.play();
      video.style.display = "block";
      startBtn.classList.add("hidden");
      if (stopBtn) stopBtn.classList.remove("hidden");
      scanning = true;
      setStatus(barcodeDetector
        ? "Scanning… point at the QR code or the printed code."
        : "Scanning via OCR… point at the printed code.");
      loop();
    } catch (e) {
      const msg = "Couldn't access the camera: " + e.message;
      if (alertEl) PS.alert(alertEl, "error", msg); else setStatus(msg);
    }
  }

  function stop() {
    scanning = false;
    if (rafId) cancelAnimationFrame(rafId);
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    video.style.display = "none";
    startBtn.classList.remove("hidden");
    if (stopBtn) stopBtn.classList.add("hidden");
  }

  startBtn.addEventListener("click", start);
  if (stopBtn) stopBtn.addEventListener("click", () => { stop(); setStatus("Camera stopped."); });
  window.addEventListener("beforeunload", stop);
};
