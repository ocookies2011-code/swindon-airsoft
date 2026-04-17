// pages/GiftVoucherPage.jsx — buy & redeem gift vouchers
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "../supabaseClient";
import * as api from "../api";
import { SquareCheckoutButton, loadSquareConfig, useMobile, fmtDate } from "../utils";

function GiftVoucherPage({ cu, showToast, setAuthModal }) {
  const PRESET_AMOUNTS = [10, 20, 25, 50];

  const [forSelf, setForSelf]               = useState(true);
  const [amount, setAmount]                 = useState(25);
  const [customAmount, setCustomAmount]     = useState('');
  const [useCustom, setUseCustom]           = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientName, setRecipientName]   = useState('');
  const [message, setMessage]               = useState('');
  const [busy, setBusy]                     = useState(false);
  const [voucherError, setVoucherError]     = useState(null);
  const [done, setDone]                     = useState(null);

  // Balance checker
  const [balanceInput, setBalanceInput]     = useState('');
  const [balanceResult, setBalanceResult]   = useState(null); // { balance, amount } | null
  const [balanceError, setBalanceError]     = useState('');
  const [balanceChecking, setBalanceChecking] = useState(false);

  const checkBalance = async () => {
    if (!balanceInput.trim()) return;
    setBalanceChecking(true);
    setBalanceError('');
    setBalanceResult(null);
    try {
      const result = await api.giftVouchers.validate(balanceInput.trim());
      setBalanceResult(result);
    } catch (e) {
      setBalanceError(e.message);
    } finally {
      setBalanceChecking(false);
    }
  };

  const finalAmount = useCustom
    ? Math.round(Math.max(1, Math.min(500, Number(customAmount) || 0)) * 100) / 100
    : amount;

  const recipientEmailFinal = forSelf ? (cu?.email || '') : recipientEmail.trim().toLowerCase();
  const recipientNameFinal  = forSelf ? (cu?.name  || '') : recipientName.trim();
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmailFinal);
  const canPay = cu && finalAmount >= 1 && emailValid;

  const handleSuccess = async (squarePayment) => {
    if (!cu) return;
    setBusy(true);
    setVoucherError(null);
    try {
      // Ensure the Supabase session is still alive after the Square payment flow —
      // the payment iframe can take long enough that the JWT needs a refresh,
      // which would cause the RLS insert policy (auth.uid() IS NOT NULL) to fail.
      await supabase.auth.refreshSession().catch(() => {});

      const voucher = await api.giftVouchers.purchase({
        amount:         finalAmount,
        purchaserId:    cu.id,
        purchaserName:  cu.name,
        purchaserEmail: cu.email,
        recipientEmail: recipientEmailFinal,
        recipientName:  recipientNameFinal || null,
        message:        message.trim() || null,
        squarePaymentId: squarePayment.id,
      });

      const isForSelf = forSelf || recipientEmailFinal === (cu.email || '').toLowerCase();

      // Email to recipient
      sendEmail({
        toEmail:     recipientEmailFinal,
        toName:      recipientNameFinal || recipientEmailFinal,
        subject:     isForSelf
          ? `🎟️ Your Swindon Airsoft Gift Voucher — £${finalAmount.toFixed(2)}`
          : `🎁 You've received a £${finalAmount.toFixed(2)} Swindon Airsoft Gift Voucher!`,
        htmlContent: `
          <div style="font-family:sans-serif;max-width:600px;background:#111;color:#ddd;padding:32px;border-radius:8px;border:1px solid #2a2a2a">
            <div style="text-align:center;margin-bottom:28px">
              <div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:28px;letter-spacing:.18em;color:#e8f0d8;text-transform:uppercase">
                SWINDON <span style="color:#c8ff00">AIRSOFT</span>
              </div>
              <div style="font-size:11px;letter-spacing:.2em;color:#3a5010;margin-top:4px;text-transform:uppercase">Gift Voucher</div>
            </div>
            ${!isForSelf ? `<p style="font-size:14px;color:#aaa;margin-bottom:20px"><strong style="color:#fff">${cu.name}</strong> has sent you a gift voucher!</p>` : ''}
            ${message.trim() ? `<div style="background:#1a1a1a;border-left:3px solid #c8ff00;padding:14px 16px;margin-bottom:20px;font-style:italic;color:#bbb;font-size:14px">"${message.trim()}"</div>` : ''}
            <div style="background:#0d0d0d;border:1px solid #2a2a2a;border-radius:6px;padding:24px;text-align:center;margin-bottom:20px">
              <div style="font-size:11px;letter-spacing:.15em;color:#555;text-transform:uppercase;margin-bottom:8px">Voucher Value</div>
              <div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:60px;color:#c8ff00;line-height:1">£${finalAmount.toFixed(2)}</div>
              <div style="font-size:11px;color:#555;margin-top:8px">Valid on events &amp; shop orders · Unused balance carries forward</div>
            </div>
            <div style="background:#0d0d0d;border:1px solid #2a3a10;border-radius:6px;padding:20px;text-align:center;margin-bottom:24px">
              <div style="font-size:11px;letter-spacing:.15em;color:#3a5010;text-transform:uppercase;margin-bottom:10px">Your Voucher Code</div>
              <div style="font-family:'Share Tech Mono',monospace;font-size:22px;color:#c8ff00;letter-spacing:.18em;word-break:break-all">${voucher.code}</div>
            </div>
            <div style="font-size:13px;color:#888;line-height:1.7">
              <strong style="color:#aaa">How to use:</strong> Enter this code in the discount / voucher field at checkout when booking an event or placing a shop order. Any unused balance carries forward automatically.
            </div>
          </div>
        `,
      }).catch(() => {});

      // Confirmation email to buyer if gifting to someone else
      if (!isForSelf) {
        sendEmail({
          toEmail:     cu.email,
          toName:      cu.name,
          subject:     `✅ Gift voucher sent to ${recipientNameFinal || recipientEmailFinal} — £${finalAmount.toFixed(2)}`,
          htmlContent: `
            <div style="font-family:sans-serif;max-width:600px;background:#111;color:#ddd;padding:32px;border-radius:8px">
              <div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:24px;color:#e8f0d8;margin-bottom:16px">Voucher Sent!</div>
              <p style="font-size:14px;color:#aaa;margin-bottom:16px">Your <strong style="color:#c8ff00">£${finalAmount.toFixed(2)}</strong> gift voucher has been sent to <strong style="color:#fff">${recipientEmailFinal}</strong>.</p>
              <p style="font-size:13px;color:#666">Voucher code: <span style="font-family:monospace;color:#c8ff00">${voucher.code}</span></p>
              <p style="font-size:12px;color:#555;margin-top:12px">If the recipient has any trouble redeeming it, they can contact us and quote the code above.</p>
            </div>
          `,
        }).catch(() => {});
      }

      setDone({ code: voucher.code, amount: finalAmount, recipientEmail: recipientEmailFinal });
      showToast('🎟️ Gift voucher purchased!');
    } catch (e) {
      console.error('Gift voucher creation error:', e?.message || e);
      const actualError = e?.message || String(e) || 'Unknown error';
      const errMsg = 'Payment succeeded but voucher creation failed — please contact us with your Square ref: ' + squarePayment.id + ' | Error: ' + actualError;
      setVoucherError(errMsg);
      supabase.from('failed_payments').insert({
        customer_name:     cu?.name || 'Unknown',
        customer_email:    cu?.email || '',
        user_id:           cu?.id || null,
        items:             [{ name: 'Gift Voucher', price: finalAmount, qty: 1 }],
        total:             finalAmount,
        payment_method:    'square_gift_voucher',
        error_message:     actualError,
        square_payment_id: squarePayment?.id || null,
        recorded_by:       null,
      }).then(({ error }) => { if (error) console.warn('Failed to log payment error:', error.message); });
    } finally {
      setBusy(false);
    }
  };

  // ── Success screen ─────────────────────────────────────────
  if (done) {
    return (
      <div className="page-content" style={{ maxWidth: 520, textAlign: 'center', paddingTop: 60 }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>🎟️</div>
        <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 32, letterSpacing: '.1em', textTransform: 'uppercase', color: '#e8f0d8', marginBottom: 8 }}>Voucher Sent!</div>
        <p style={{ color: '#aaa', fontSize: 14, marginBottom: 24 }}>
          A <strong style={{ color: '#c8ff00' }}>£{done.amount.toFixed(2)}</strong> gift voucher has been emailed to <strong style={{ color: '#fff' }}>{done.recipientEmail}</strong>.
        </p>
        <div style={{ background: '#0d0d0d', border: '1px solid #2a3a10', borderRadius: 6, padding: '20px 24px', marginBottom: 32 }}>
          <div style={{ fontSize: 11, letterSpacing: '.15em', color: '#3a5010', textTransform: 'uppercase', marginBottom: 8 }}>Voucher Code</div>
          <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 20, color: '#c8ff00', letterSpacing: '.15em' }}>{done.code}</div>
        </div>
        <button className="btn btn-primary" onClick={() => { setDone(null); setRecipientEmail(''); setRecipientName(''); setMessage(''); setCustomAmount(''); setUseCustom(false); setAmount(25); setForSelf(true); }}>
          Buy Another
        </button>
      </div>
    );
  }

  // ── Main form ──────────────────────────────────────────────
  return (
    <div>
      {/* Hero */}
      <div style={{ position: 'relative', overflow: 'hidden', background: 'linear-gradient(180deg,#0c1009 0%,#080a06 100%)', borderBottom: '2px solid #2a3a10', padding: '52px 24px 44px' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.1) 3px,rgba(0,0,0,.1) 4px)', pointerEvents: 'none' }} />
        {[['top','left'],['top','right'],['bottom','left'],['bottom','right']].map(([v,h]) => (
          <div key={v+h} style={{ position: 'absolute', width: 28, height: 28, zIndex: 2,
            top: v==='top' ? 14 : 'auto', bottom: v==='bottom' ? 14 : 'auto',
            left: h==='left' ? 14 : 'auto', right: h==='right' ? 14 : 'auto',
            borderTop: v==='top' ? '2px solid #c8a000' : 'none', borderBottom: v==='bottom' ? '2px solid #c8a000' : 'none',
            borderLeft: h==='left' ? '2px solid #c8a000' : 'none', borderRight: h==='right' ? '2px solid #c8a000' : 'none',
          }} />
        ))}
        <div style={{ maxWidth: 700, margin: '0 auto', textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 10, letterSpacing: '.35em', color: '#3a5010', marginBottom: 14, textTransform: 'uppercase' }}>◈ — SWINDON AIRSOFT — ◈</div>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 'clamp(30px,6vw,52px)', letterSpacing: '.18em', textTransform: 'uppercase', color: '#e8f0d8', lineHeight: 1, marginBottom: 6 }}>
            GIFT <span style={{ color: '#c8a000' }}>VOUCHERS</span>
          </div>
          <div style={{ fontSize: 14, color: '#aaa', marginTop: 14, maxWidth: 420, margin: '14px auto 0' }}>
            The perfect gift for any airsofter — redeemable on game day bookings and shop orders.
          </div>
        </div>
      </div>

      <div className="page-content" style={{ maxWidth: 640 }}>

        {!cu && (
          <div className="alert alert-blue mb-3" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontSize: 14 }}>Log in to purchase a gift voucher.</span>
            <button className="btn btn-sm btn-primary" onClick={() => setAuthModal(true)}>Log In</button>
          </div>
        )}

        <div style={{ background: '#111', border: '1px solid #2a2a2a', padding: '28px 24px', marginBottom: 20 }}>

          {/* Who is this for? */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12 }}>Who is this for?</div>
            <div style={{ display: 'flex', gap: 10 }}>
              {[['For myself', true], ['For someone else', false]].map(([label, val]) => (
                <button key={label} onClick={() => setForSelf(val)} style={{
                  flex: 1, padding: '10px 0',
                  fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: '.08em', textTransform: 'uppercase',
                  cursor: 'pointer', transition: 'all .15s',
                  background: forSelf === val ? 'rgba(200,255,0,.12)' : 'transparent',
                  border:     forSelf === val ? '1px solid var(--accent)' : '1px solid #2a2a2a',
                  color:      forSelf === val ? 'var(--accent)' : 'var(--muted)',
                }}>
                  {forSelf === val ? '◉' : '○'} {label}
                </button>
              ))}
            </div>
          </div>

          {/* Recipient details — only when gifting to someone else */}
          {!forSelf && (
            <div style={{ marginBottom: 28, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: -2 }}>Recipient details</div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 5 }}>Their email address *</label>
                <input
                  type="email"
                  className="input"
                  placeholder="their@email.com"
                  value={recipientEmail}
                  onChange={e => setRecipientEmail(e.target.value)}
                  style={{ width: '100%' }}
                />
                {recipientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail) && (
                  <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>⚠ Please enter a valid email address</div>
                )}
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>The voucher code will be emailed directly to this address.</div>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 5 }}>Their name (optional)</label>
                <input
                  type="text"
                  className="input"
                  placeholder="Their name"
                  value={recipientName}
                  onChange={e => setRecipientName(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 5 }}>Personal message (optional)</label>
                <textarea
                  className="input"
                  placeholder="Add a message to include in the email…"
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  rows={3}
                  style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', fontSize: 13 }}
                />
              </div>
            </div>
          )}

          {/* Amount selector */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12 }}>Choose amount</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 10 }}>
              {PRESET_AMOUNTS.map(v => (
                <button key={v} onClick={() => { setAmount(v); setUseCustom(false); }} style={{
                  padding: '14px 0',
                  fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 22,
                  cursor: 'pointer', transition: 'all .15s',
                  background: !useCustom && amount === v ? 'rgba(200,255,0,.12)' : 'transparent',
                  border:     !useCustom && amount === v ? '1px solid var(--accent)' : '1px solid #2a2a2a',
                  color:      !useCustom && amount === v ? 'var(--accent)' : '#ccc',
                }}>
                  £{v}
                </button>
              ))}
            </div>
            <button onClick={() => setUseCustom(true)} style={{
              width: '100%', padding: '10px 0',
              fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 13, letterSpacing: '.08em', textTransform: 'uppercase',
              cursor: 'pointer', transition: 'all .15s',
              background: useCustom ? 'rgba(200,255,0,.12)' : 'transparent',
              border:     useCustom ? '1px solid var(--accent)' : '1px solid #2a2a2a',
              color:      useCustom ? 'var(--accent)' : 'var(--muted)',
              marginBottom: useCustom ? 10 : 0,
            }}>
              ◉ Custom amount
            </button>
            {useCustom && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: 'var(--muted)', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 24 }}>£</span>
                <input
                  type="number"
                  min="1" max="500" step="1"
                  className="input"
                  placeholder="Enter amount (£1–£500)"
                  value={customAmount}
                  onChange={e => setCustomAmount(e.target.value)}
                  style={{ flex: 1, fontSize: 18, fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700 }}
                  autoFocus
                />
              </div>
            )}
          </div>

          {/* Summary + pay */}
          <div style={{ background: '#0d0d0d', border: '1px solid #2a2a2a', padding: '16px 20px', marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: !forSelf && recipientEmailFinal && emailValid ? 8 : 0 }}>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>Gift voucher value</span>
              <span style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 24, color: finalAmount >= 1 ? '#c8ff00' : 'var(--muted)' }}>
                {finalAmount >= 1 ? `£${finalAmount.toFixed(2)}` : '—'}
              </span>
            </div>
            {!forSelf && recipientEmailFinal && emailValid && (
              <div style={{ fontSize: 12, color: 'var(--muted)', borderTop: '1px solid #2a2a2a', paddingTop: 8 }}>
                Will be emailed to: <span style={{ color: '#aaa' }}>{recipientEmailFinal}</span>
              </div>
            )}
          </div>

          {voucherError && (
            <div className="alert alert-red mb-2" style={{ fontSize: 13 }}>⚠ {voucherError}</div>
          )}

          {cu && canPay && (
            <SquareCheckoutButton
              amount={finalAmount}
              label={`Pay £${finalAmount.toFixed(2)}`}
              onSuccess={handleSuccess}
              disabled={busy}
            />
          )}

          {cu && !canPay && (
            <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)', padding: '10px 0' }}>
              {!forSelf && !emailValid ? 'Enter a valid recipient email to continue.' : finalAmount < 1 ? 'Enter an amount of at least £1 to continue.' : ''}
            </div>
          )}
        </div>

        {/* How it works */}
        <div style={{ background: '#111', border: '1px solid #2a2a2a', padding: '24px', marginBottom: 20 }}>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 16 }}>How it works</div>
          {[
            ['🎟️', 'Purchase a voucher', 'Choose a value and pay by card. The code is generated and emailed instantly.'],
            ['📧', 'Code sent by email', forSelf ? 'The voucher code is sent to your email address.' : "The code is sent directly to the recipient's email address, along with your personal message."],
            ['✅', 'Redeem at checkout', 'Enter the code in the discount / voucher field at any event booking or shop order. Any unused balance carries forward automatically.'],
          ].map(([icon, title, desc]) => (
            <div key={title} style={{ display: 'flex', gap: 14, padding: '10px 0', borderBottom: '1px solid #1a1a1a' }}>
              <span style={{ fontSize: 18, flexShrink: 0, width: 26 }}>{icon}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#ccc', marginBottom: 2 }}>{title}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Balance checker */}
        <div style={{ background: '#111', border: '1px solid #2a2a2a', padding: '24px' }}>
          <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 700, fontSize: 11, letterSpacing: '.15em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 16 }}>Check voucher balance</div>
          <div style={{ display: 'flex', gap: 0, marginBottom: 10 }}>
            <input
              value={balanceInput}
              onChange={e => { setBalanceInput(e.target.value.toUpperCase()); setBalanceError(''); setBalanceResult(null); }}
              onKeyDown={e => e.key === 'Enter' && checkBalance()}
              placeholder="GV-XXXX-XXXX-XXXX"
              style={{ flex: 1, background: '#0c1009', border: '1px solid #2a3a10', borderRight: 'none', color: '#c8e878', fontFamily: "'Share Tech Mono',monospace", fontSize: 13, letterSpacing: '.1em', padding: '9px 12px', outline: 'none', textTransform: 'uppercase' }}
              onFocus={e => e.target.style.borderColor = '#4a6820'}
              onBlur={e => e.target.style.borderColor = '#2a3a10'}
            />
            <button
              onClick={checkBalance}
              disabled={balanceChecking || !balanceInput.trim()}
              style={{ background: balanceInput.trim() ? 'rgba(200,255,0,.15)' : 'rgba(200,255,0,.04)', border: '1px solid #2a3a10', color: balanceInput.trim() ? '#c8ff00' : '#3a5010', fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 800, fontSize: 12, letterSpacing: '.1em', padding: '9px 16px', cursor: balanceInput.trim() ? 'pointer' : 'default', whiteSpace: 'nowrap', transition: 'all .15s' }}>
              {balanceChecking ? '⏳' : 'CHECK'}
            </button>
          </div>
          {balanceError && (
            <div style={{ fontSize: 12, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 4 }}>⚠ {balanceError}</div>
          )}
          {balanceResult && (
            <div style={{ background: '#0d0d0d', border: '1px solid #2a3a10', borderLeft: '3px solid #c8ff00', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontFamily: "'Share Tech Mono',monospace", fontSize: 13, color: '#c8ff00', letterSpacing: '.1em', marginBottom: 4 }}>{balanceResult.code}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>Original value: £{Number(balanceResult.amount).toFixed(2)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, letterSpacing: '.1em', color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 2 }}>Remaining balance</div>
                <div style={{ fontFamily: "'Barlow Condensed',sans-serif", fontWeight: 900, fontSize: 32, color: '#c8ff00', lineHeight: 1 }}>£{Number(balanceResult.balance).toFixed(2)}</div>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// ── Shop Closed Page ──────────────────────────────────────────

export { GiftVoucherPage };
