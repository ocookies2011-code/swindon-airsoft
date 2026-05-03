// utils/squareConfig.jsx — Square Web Payments SDK config + SquareCheckoutButton
import React, { useEffect, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import * as api from "../api";

let _squareAppId = "";
let _squareLocationId = "";
let _squareEnv = "sandbox"; // "sandbox" | "production"
let _squareConfigLoaded = false;

async function loadSquareConfig() {
  if (_squareConfigLoaded) return;
  try {
    const [appId, locationId, env] = await Promise.all([
      api.settings.get("square_app_id"),
      api.settings.get("square_location_id"),
      api.settings.get("square_env"),
    ]);
    if (appId) _squareAppId = appId;
    if (locationId) _squareLocationId = locationId;
    if (env === "production" || env === "sandbox") _squareEnv = env;
  } catch {}
  _squareConfigLoaded = true;
}

function resetSquareConfig() {
  _squareConfigLoaded = false;
}

function SquareCheckoutButton({ amount, description, onSuccess, disabled, onOpen }) {
  const [sqReady, setSqReady] = useState(false);
  const [sqError, setSqError] = useState(null);
  const [isLive, setIsLive] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [paying, setPaying] = useState(false);
  // "idle" | "tokenising" | "verifying" | "charging"
  const [payStage, setPayStage] = useState("idle");
  const cardRef = useRef(null);
  const cardInstance = useRef(null);
  const paymentsRef = useRef(null);

  // Load config from Supabase on mount
  useEffect(() => {
    loadSquareConfig().then(() => {
      setIsLive(_squareEnv === "production");
      setConfigLoaded(true);
    });
  }, []);

  // Load Square Web Payments SDK and mount card field
  useEffect(() => {
    if (!configLoaded || !isLive || !_squareAppId || !_squareLocationId) return;
    let cancelled = false;

    const initSquare = async () => {
      try {
        // Load SDK if not already present
        if (!window.Square) {
          await new Promise((resolve, reject) => {
            const old = document.getElementById("square-sdk");
            if (old) old.remove();
            const s = document.createElement("script");
            s.id = "square-sdk";
            s.src = "https://web.squarecdn.com/v1/square.js";
            s.onload = resolve;
            s.onerror = () => reject(new Error("Square SDK failed to load."));
            document.head.appendChild(s);
          });
        }
        if (cancelled) return;
        const payments = window.Square.payments(_squareAppId, _squareLocationId);
        paymentsRef.current = payments;
        // Destroy any stale card instance before creating a new one.
        // Skipping this causes Square to throw "ID already deployed" on re-renders.
        if (cardInstance.current) {
          try { cardInstance.current.destroy(); } catch {}
          cardInstance.current = null;
        }
        const card = await payments.card();
        if (cancelled) return;
        cardInstance.current = card;
        if (cardRef.current) await card.attach(cardRef.current);
        if (!cancelled) setSqReady(true);
      } catch (e) {
        if (!cancelled) setSqError(e.message || "Square failed to initialise.");
      }
    };

    initSquare();
    return () => {
      cancelled = true;
      if (cardInstance.current) { try { cardInstance.current.destroy(); } catch {} }
    };
  }, [configLoaded, isLive]);

  const handlePay = async () => {
    if (!cardInstance.current || !paymentsRef.current) return;
    if (onOpen) onOpen();
    setPaying(true);
    setSqError(null);
    setPayStage("tokenising");

    try {
      // ── Step 1: Tokenise the card ──────────────────────────────
      const result = await cardInstance.current.tokenize();
      if (result.status !== "OK") {
        const msg = result.errors?.map(e => e.message).join(", ") || "Card tokenisation failed.";
        setSqError(msg);
        setPaying(false);
        setPayStage("idle");
        return;
      }
      let sourceId = result.token;
      let verificationToken = null;

      // ── Step 2: 3D Secure / SCA buyer verification ─────────────
      // This is what fixes CARD_DECLINED_VERIFICATION_REQUIRED.
      // verifyBuyer() triggers the bank's 3DS challenge (popup or redirect
      // in the customer's banking app). Square handles the entire flow and
      // returns a verificationToken we pass to the Edge Function.
      setPayStage("verifying");
      try {
        const verificationDetails = {
          amount: String(Number(amount).toFixed(2)),  // verifyBuyer needs pounds as string, NOT pence
          currencyCode: "GBP",
          intent: "CHARGE",
          billingContact: {},
        };
        const verifyResult = await paymentsRef.current.verifyBuyer(sourceId, verificationDetails);
        if (verifyResult?.token) {
          verificationToken = verifyResult.token;
        }
      } catch (verifyErr) {
        // The customer cancelled 3DS or their bank rejected verification.
        // Distinguish between a user cancellation and a hard failure.
        const msg = verifyErr?.message || "";
        const isCancelled =
          msg.toLowerCase().includes("cancel") ||
          msg.toLowerCase().includes("closed") ||
          msg.toLowerCase().includes("aborted");
        setSqError(
          isCancelled
            ? "Verification was cancelled. Please try again and complete the security check in your banking app."
            : "Your bank requires additional verification but it failed. Please try a different card or contact your bank."
        );
        setPaying(false);
        setPayStage("idle");
        return;
      }

      // ── Step 3: Charge via Edge Function ───────────────────────
      // We pass both sourceId (card token) and verificationToken (3DS token).
      // The Edge Function forwards verificationToken to Square's Payments API
      // so the charge is treated as SCA-compliant.
      setPayStage("charging");
      const amountPence = Math.round(Number(amount) * 100);
      const { data: payData, error: payError } = await supabase.functions.invoke("square-payment", {
        body: {
          sourceId,
          verificationToken,   // <── new field — pass to Square API
          amount: amountPence,
          currency: "GBP",
          note: description,
          env: _squareEnv,
        },
      });

      if (payError) {
        let msg = payError.message || "Payment failed — please try again.";
        try {
          const parsed = typeof payError.context?.json === "function"
            ? await payError.context.json()
            : null;
          if (parsed?.error) msg = parsed.error;
        } catch {}
        throw new Error(msg);
      }
      if (!payData || payData.error) {
        throw new Error(payData?.error || "Payment failed — please try again.");
      }

      setPayStage("idle");
      onSuccess({ id: payData.paymentId, status: "COMPLETED", receiptUrl: payData.receiptUrl || null, receiptNumber: payData.receiptNumber || null });

    } catch (e) {
      const errMsg = e.message || "Payment failed. Please try again.";
      setSqError(errMsg);
      setPayStage("idle");
      // Log failed payment — fire and forget, never blocks UI
      supabase.from("failed_payments").insert({
        customer_name:     "Online customer",
        customer_email:    "",
        user_id:           null,
        items:             [],
        total:             Number(amount) || 0,
        payment_method:    "square_online",
        error_message:     errMsg,
        square_payment_id: null,
        recorded_by:       null,
      }).then(({ error }) => {
        if (error) console.warn("Failed to log payment error:", error.message);
      });
    } finally {
      setPaying(false);
    }
  };

  // Human-readable label for each stage shown on the button
  const stageLabel = {
    idle:       `PAY · £${Number(amount).toFixed(2)}`,
    tokenising: "⏳ Reading card…",
    verifying:  "🔐 Verifying with your bank…",
    charging:   "⏳ Processing payment…",
  };

  if (!configLoaded) {
    return <div style={{ color: "var(--muted)", fontSize: 12, padding: 8, marginTop: 12 }}>Loading payment options...</div>;
  }

  if (!isLive) {
    return (
      <div style={{ marginTop: 12 }}>
        <div style={{ background: "#0d1a0d", border: "1px solid #1e3a1e", padding: "8px 14px", marginBottom: 10, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ background: "#2d7a2d", color: "#fff", fontSize: 9, fontWeight: 800, padding: "2px 7px", letterSpacing: ".15em", fontFamily: "'Oswald','Barlow Condensed',sans-serif", flexShrink: 0 }}>TEST MODE</span>
          <span style={{ fontSize: 11, color: "#5aab5a", fontFamily: "'Share Tech Mono',monospace" }}>Mock payments — no real money taken. Set Square to Production in Admin → Settings.</span>
        </div>
        <div style={{ background: "#111", border: "1px solid #1e2e12", padding: "10px 14px", marginBottom: 8, fontFamily: "'Share Tech Mono',monospace", fontSize: 11, color: "var(--muted)", display: "flex", justifyContent: "space-between" }}>
          <span>{description}</span>
          <span style={{ color: "var(--accent)", fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontSize: 16 }}>£{Number(amount).toFixed(2)}</span>
        </div>
        <button className="btn btn-primary" style={{ width: "100%", padding: "13px", fontSize: 14, letterSpacing: ".15em", opacity: disabled ? .5 : 1 }}
          disabled={disabled} onClick={() => onSuccess({ id: "MOCK-" + Date.now(), status: "COMPLETED", mock: true })}>
          ✓ CONFIRM TEST PAYMENT · £{Number(amount).toFixed(2)}
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12 }}>
      {sqError && (
        <div className="alert alert-red" style={{ marginBottom: 8 }}>
          {sqError}
        </div>
      )}

      {/* 3DS in-progress notice — shown while verifyBuyer popup is open */}
      {payStage === "verifying" && (
        <div style={{ background: "rgba(79,195,247,.08)", border: "1px solid rgba(79,195,247,.3)", padding: "10px 14px", marginBottom: 10, fontSize: 12, color: "#4fc3f7", fontFamily: "'Share Tech Mono',monospace", lineHeight: 1.6 }}>
          🔐 Your bank is requesting identity verification. Please check your banking app or complete the pop-up security step.
        </div>
      )}

      <div style={{ background: "#0a0f05", border: "1px solid #2a3a10", padding: "14px 16px", marginBottom: 10 }}>
        <div style={{ fontSize: 10, letterSpacing: ".15em", color: "var(--muted)", fontFamily: "'Share Tech Mono',monospace", marginBottom: 10, textTransform: "uppercase" }}>Card Details</div>
        <div ref={cardRef} style={{ minHeight: 48 }} />
      </div>
      <div style={{ background: "#111", border: "1px solid #111a0a", padding: "10px 14px", marginBottom: 10, fontFamily: "'Share Tech Mono',monospace", fontSize: 11, color: "var(--muted)", display: "flex", justifyContent: "space-between" }}>
        <span>{description}</span>
        <span style={{ color: "var(--accent)", fontFamily: "'Oswald','Barlow Condensed',sans-serif", fontSize: 16 }}>£{Number(amount).toFixed(2)}</span>
      </div>
      {!sqReady && !sqError && (
        <div style={{ color: "var(--muted)", fontSize: 12, padding: 8 }}>Loading card form…</div>
      )}
      {sqReady && (
        <button
          className="btn btn-primary"
          style={{ width: "100%", padding: "13px", fontSize: 14, letterSpacing: ".15em", opacity: (disabled || paying) ? .6 : 1 }}
          disabled={disabled || paying}
          onClick={handlePay}
        >
          {paying ? stageLabel[payStage] || "⏳ Processing…" : stageLabel.idle}
        </button>
      )}
    </div>
  );
}

export { loadSquareConfig, resetSquareConfig, SquareCheckoutButton };
