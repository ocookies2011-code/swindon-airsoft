// utils/qrComponents.jsx — QRCode (display) + QRScanner (camera)
import React, { useEffect, useRef, useState } from "react";

function QRCode({ value, size = 120 }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !value) return;
    // Load QRCode library dynamically from CDN
    const loadQR = async () => {
      if (!window.QRCode) {
        await new Promise((resolve, reject) => {
          const scriptEl = document.createElement('script');
          scriptEl.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
          scriptEl.onload = resolve; scriptEl.onerror = reject;
          document.head.appendChild(scriptEl);
        });
      }
      if (ref.current) {
        ref.current.innerHTML = '';
        new window.QRCode(ref.current, {
          text: value, width: size, height: size,
          colorDark: '#000000', colorLight: '#ffffff',
          correctLevel: window.QRCode.CorrectLevel.M
        });
      }
    };
    loadQR().catch(console.error);
  }, [value, size]);
  return <div ref={ref} style={{ background: '#fff', padding: 8, borderRadius: 6, display: 'inline-block' }} />;
}

function QRScanner({ onScan, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const detectorRef = useRef(null);
  const [error, setError] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [method, setMethod] = useState("loading");

  useEffect(() => {
    let active = true;

    // Load jsQR from CDN if not already loaded
    const ensureJsQR = () => new Promise((resolve) => {
      if (window.jsQR) { resolve(true); return; }
      const qrScriptEl = document.createElement('script');
      qrScriptEl.src = 'https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js';
      qrScriptEl.onload = () => resolve(true);
      qrScriptEl.onerror = () => resolve(false);
      document.head.appendChild(qrScriptEl);
    });

    (async () => {
      try {
        // Try BarcodeDetector first (native, works great on mobile)
        if ('BarcodeDetector' in window) {
          const formats = await BarcodeDetector.getSupportedFormats().catch(() => ['qr_code']);
          if (formats.includes('qr_code')) {
            detectorRef.current = new BarcodeDetector({ formats: ['qr_code'] });
            setMethod("native");
          }
        }
        if (!detectorRef.current) {
          await ensureJsQR();
          setMethod(window.jsQR ? "jsqr" : "none");
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          setScanning(true);
        }
      } catch (e) {
        setError("Camera access denied. Please allow camera access and try again.");
      }
    })();

    return () => {
      active = false;
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    if (!scanning) return;
    const tick = async () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) { rafRef.current = requestAnimationFrame(tick); return; }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0);
      try {
        if (detectorRef.current) {
          // Native BarcodeDetector
          const codes = await detectorRef.current.detect(video);
          if (codes.length > 0) { onScan(codes[0].rawValue); return; }
        } else if (window.jsQR) {
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = window.jsQR(imgData.data, imgData.width, imgData.height, { inversionAttempts: "attemptBoth" });
          if (code?.data) { onScan(code.data); return; }
        }
      } catch {}
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [scanning, onScan]);

  return (
    <div className="overlay" onClick={onClose} style={{ alignItems: "flex-start" }}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ position: "sticky", top: 0 }}>
        <div className="modal-title">📷 Scan QR Code</div>
        {error ? (
          <div className="alert alert-red">{error}</div>
        ) : (
          <div className="qr-scanner-wrap">
            <video ref={videoRef} muted playsInline style={{ width: "100%", borderRadius: 8 }} />
            <div className="qr-overlay">
              <div className="qr-corner tl" /><div className="qr-corner tr" />
              <div className="qr-corner bl" /><div className="qr-corner br" />
            </div>
            <canvas ref={canvasRef} style={{ display: "none" }} />
          </div>
        )}
        <p className="text-muted" style={{ fontSize: 12, marginTop: 12, textAlign: "center" }}>
          Point camera at player's booking QR code
        </p>
        <button className="btn btn-ghost mt-2" style={{ width: "100%" }} onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}


export { QRCode, QRScanner };
