// utils/email.js — EmailJS constants + all send*Email functions
import { fmtDate } from "./helpers";
// ── Send Ticket Email ────────────────────────────────────────
// ── EmailJS shared helper ────────────────────────────────────
// Keys must be set in .env as VITE_EMAILJS_SERVICE_ID, VITE_EMAILJS_TEMPLATE_ID, VITE_EMAILJS_PUBLIC_KEY
const EMAILJS_SERVICE_ID  = import.meta.env.VITE_EMAILJS_SERVICE_ID  || "";
const EMAILJS_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID || "";
const EMAILJS_PUBLIC_KEY  = import.meta.env.VITE_EMAILJS_PUBLIC_KEY  || "";
async function sendEmail({ toEmail, toName, subject, htmlContent }) {
  if (!toEmail) throw new Error("No email address");
  if (!window.emailjs) {
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js";
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  window.emailjs.init({ publicKey: EMAILJS_PUBLIC_KEY });
  await window.emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
    to_email:     toEmail,
    to_name:      toName || "",
    subject:      subject,
    html_content: htmlContent,
  });
}

async function sendTicketEmail({ cu, ev, bookings, extras }) {
  const extrasText = Object.entries(extras || {}).filter(([,v])=>v>0).map(([k,v])=>`${k} ×${v}`).join(", ") || "None";
  const dateStr = new Date(ev.date).toLocaleDateString("en-GB", { weekday:"long", day:"numeric", month:"long", year:"numeric" });
  const totalPaid = bookings.reduce((s, b) => s + (b.total || 0), 0);

  const ticketRows = bookings.map(b => {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(b.id||'ticket')}&bgcolor=0a0a0a&color=c8ff00&qzone=1`;
    return `<div style="background:#0a1005;border:1px solid #1a2808;border-left:3px solid #c8ff00;padding:20px 24px;margin-bottom:12px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="vertical-align:top;">
            <div style="font-size:8px;letter-spacing:.3em;color:#3a5010;font-weight:700;text-transform:uppercase;margin-bottom:6px;">▸ FIELD PASS</div>
            <div style="font-size:24px;font-weight:900;color:#c8ff00;text-transform:uppercase;letter-spacing:.06em;line-height:1;">${b.type === "walkOn" ? "Walk-On" : "Rental"}</div>
            <div style="font-size:13px;color:#8aaa60;margin-top:6px;">Qty: ${b.qty} &middot; ${b.total > 0 ? `<span style="color:#c8ff00;font-weight:700;">£${(b.total||0).toFixed(2)}</span>` : '<span style="color:#4fc3f7;">Complimentary</span>'}</div>
            <div style="font-size:10px;color:#2a3a10;margin-top:10px;font-family:monospace;letter-spacing:.12em;border-top:1px solid #1a2808;padding-top:8px;">REF: ${(b.id||"").slice(0,8).toUpperCase()}</div>
          </td>
          <td style="vertical-align:top;text-align:right;width:160px;padding-left:16px;">
            <div style="background:#0a0a0a;padding:6px;border:1px solid #c8ff00;display:inline-block;">
              <img src="${qrUrl}" width="140" height="140" alt="QR Code" style="display:block;" />
            </div>
            <div style="font-size:9px;color:#3a5010;margin-top:5px;letter-spacing:.12em;text-transform:uppercase;text-align:center;">Scan on arrival</div>
          </td>
        </tr>
      </table>
    </div>`;
  }).join("");

  const htmlContent = `<div style="max-width:600px;margin:0 auto;background:#080e04;font-family:Arial,sans-serif;color:#e8f0d8;line-height:1;">
    <div style="height:3px;background:linear-gradient(90deg,#c8ff00,#8aaa60);"></div>
    <div style="background:#0d0d0d;padding:16px 24px;text-align:center;border-left:1px solid #1a2808;border-right:1px solid #1a2808;">
      <img src="https://bnlndgjbcthxyodgstaa.supabase.co/storage/v1/object/public/email-templates/logo_transparent.png" alt="Swindon Airsoft" width="180" style="display:block;margin:0 auto 10px;height:auto;" />
      <div style="font-size:9px;letter-spacing:.35em;color:#3a5010;text-transform:uppercase;font-weight:700;">◈ BOOKING CONFIRMATION</div>
    </div>
    <div style="background:#0a1005;border-left:1px solid #1a2808;border-right:1px solid #1a2808;padding:16px 24px;border-top:none;">
      <div style="font-size:8px;letter-spacing:.3em;color:#3a5010;text-transform:uppercase;font-weight:700;margin-bottom:8px;">MISSION BRIEFING</div>
      <div style="font-size:28px;font-weight:900;color:#e8f0d8;text-transform:uppercase;letter-spacing:.04em;line-height:1.1;margin-bottom:20px;">${ev.title}</div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <tr>
          <td style="padding:10px 14px;background:#080e04;border:1px solid #1a2808;width:50%;vertical-align:top;">
            <div style="font-size:8px;letter-spacing:.25em;color:#3a5010;text-transform:uppercase;margin-bottom:4px;">DATE</div>
            <div style="font-size:13px;font-weight:700;color:#c8ff00;">${dateStr}</div>
          </td>
          <td style="padding:10px 14px;background:#080e04;border:1px solid #1a2808;border-left:none;width:50%;vertical-align:top;">
            <div style="font-size:8px;letter-spacing:.25em;color:#3a5010;text-transform:uppercase;margin-bottom:4px;">TIME</div>
            <div style="font-size:13px;font-weight:700;color:#4fc3f7;">${ev.time || "TBC"} GMT</div>
          </td>
        </tr>
        <tr>
          <td style="padding:10px 14px;background:#080e04;border:1px solid #1a2808;border-top:none;vertical-align:top;" colspan="2">
            <div style="font-size:8px;letter-spacing:.25em;color:#3a5010;text-transform:uppercase;margin-bottom:4px;">LOCATION</div>
            <div style="font-size:13px;font-weight:700;color:#ce93d8;">${ev.location || "Swindon Airsoft Field"}</div>
          </td>
        </tr>
      </table>
      <div style="font-size:8px;letter-spacing:.3em;color:#3a5010;text-transform:uppercase;font-weight:700;margin-bottom:10px;">YOUR FIELD PASSES</div>
      ${ticketRows}
      ${extrasText !== "None" ? `
      <div style="background:#080e04;border:1px solid #1a2808;border-left:3px solid #4fc3f7;padding:14px 18px;margin-top:12px;">
        <div style="font-size:8px;letter-spacing:.25em;color:#3a5010;text-transform:uppercase;margin-bottom:6px;font-weight:700;">GAME DAY EXTRAS</div>
        <div style="font-size:13px;color:#8aaa60;">${extrasText}</div>
      </div>` : ""}
      ${totalPaid > 0 ? `
      <div style="background:#0d1f0a;border:1px solid #c8ff00;padding:14px 18px;margin-top:12px;display:flex;justify-content:space-between;align-items:center;">
        <div style="font-size:10px;letter-spacing:.2em;color:#3a5010;text-transform:uppercase;font-weight:700;">Total Paid</div>
        <div style="font-size:26px;font-weight:900;color:#c8ff00;">£${totalPaid.toFixed(2)}</div>
      </div>` : ""}
    </div>
    <div style="background:#060d02;border:1px solid #1a2808;border-top:none;padding:14px 24px;">
      <div style="font-size:8px;letter-spacing:.25em;color:#2a3a10;text-transform:uppercase;margin-bottom:10px;font-weight:700;">PRE-GAME CHECKLIST</div>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:5px 0;font-size:12px;color:#c8ff00;line-height:1.6;">▸ All players must check-in with a marshal on arrival</td></tr>
        <tr><td style="padding:5px 0;font-size:12px;color:#c8ff00;line-height:1.6;">▸ Show your QR code on arrival for check-in</td></tr>
        <tr><td style="padding:5px 0;font-size:12px;color:#8aaa60;line-height:1.6;">▸ Under 18s must have signed parental consent</td></tr>
      </table>
    </div>
    <div style="background:#0a0f06;border-left:1px solid #1a2808;border-right:1px solid #1a2808;border-top:none;padding:12px 24px;text-align:center;">
      <a href="https://swindon-airsoft.com/#profile/bookings" style="display:inline-block;background:#c8ff00;color:#0a0a0a;font-size:12px;font-weight:900;letter-spacing:.18em;text-transform:uppercase;padding:12px 30px;text-decoration:none;">VIEW MY BOOKING &rarr;</a>
    </div>
    <div style="background:#0a0f06;border-top:2px solid #c8ff00;padding:18px 32px;text-align:center;border-left:1px solid #1a2808;border-right:1px solid #1a2808;">
      <a href="https://swindon-airsoft.com" style="font-size:11px;color:#c8ff00;letter-spacing:.25em;text-transform:uppercase;text-decoration:none;font-weight:700;font-family:Arial,sans-serif;">swindon-airsoft.com</a>
      <div style="font-size:10px;color:#2a3a10;margin-top:5px;letter-spacing:.1em;">&copy; 2026 Swindon Airsoft. All rights reserved.</div>
    </div>
    <div style="height:3px;background:linear-gradient(90deg,#1a2808,#c8ff00,#1a2808);"></div>
  </div>`;

  await sendEmail({
    toEmail:     cu.email || "",
    toName:      cu.name || "Player",
    subject:     `🎯 Booking Confirmed — ${ev.title.replace(/\//g, '-')}`,
    htmlContent,
  });
}


// ── Send Welcome/Registration Email ──────────────────────────
// ── Send Event Reminder Email ────────────────────────────────
async function sendEventReminderEmail({ ev, bookedUsers }) {
  const dateStr = new Date(ev.date).toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });
  const timeStr = ev.endTime ? `${ev.time}–${ev.endTime} GMT` : ev.time ? `${ev.time} GMT` : "TBC";
  const hoursUntil = Math.round((new Date(ev.date + "T" + (ev.time || "09:00")) - new Date()) / 3600000);
  const urgency = hoursUntil <= 24 ? "TOMORROW" : hoursUntil <= 48 ? "IN 48 HOURS" : `IN ${Math.round(hoursUntil/24)} DAYS`;

  let sent = 0, failed = 0;

  for (const user of bookedUsers) {
    if (!user.email) { failed++; continue; }
    const htmlContent = `<div style="max-width:600px;margin:0 auto;background:#0a0a0a;padding:0;font-family:Arial,sans-serif;color:#e0e0e0;">
    <div style="height:3px;background:#c8ff00;"></div>
    <div style="background:#0d0d0d;border-left:1px solid #1a1a1a;border-right:1px solid #1a1a1a;padding:24px 32px;text-align:center;">
      <div style="font-size:10px;letter-spacing:.3em;color:#c8ff00;font-weight:700;text-transform:uppercase;margin-bottom:8px;">⚠ MISSION REMINDER — ${urgency}</div>
      <img src="https://bnlndgjbcthxyodgstaa.supabase.co/storage/v1/object/public/email-templates/logo_transparent.png" alt="Swindon Airsoft" width="200" style="display:block;margin:0 auto 12px;height:auto;" />
    </div>
    <div style="background:#0d1300;border:1px solid #1a2808;border-top:none;padding:16px 24px;">
      <div style="font-size:9px;letter-spacing:.3em;color:#3a5010;text-transform:uppercase;margin-bottom:8px;font-weight:700;">YOUR UPCOMING GAME</div>
      <div style="font-size:28px;font-weight:900;color:#e8f0d8;text-transform:uppercase;letter-spacing:.05em;line-height:1.1;margin-bottom:20px;">${ev.title}</div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <tr>
          <td style="padding:10px 14px;background:#0a0f06;border:1px solid #1a2808;width:50%;vertical-align:top;">
            <div style="font-size:8px;letter-spacing:.25em;color:#3a5010;text-transform:uppercase;margin-bottom:4px;">DATE</div>
            <div style="font-size:14px;font-weight:700;color:#c8ff00;">${dateStr}</div>
          </td>
          <td style="padding:10px 14px;background:#0a0f06;border:1px solid #1a2808;border-left:none;width:50%;vertical-align:top;">
            <div style="font-size:8px;letter-spacing:.25em;color:#3a5010;text-transform:uppercase;margin-bottom:4px;">TIME</div>
            <div style="font-size:14px;font-weight:700;color:#4fc3f7;">${timeStr}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:10px 14px;background:#0a0f06;border:1px solid #1a2808;border-top:none;vertical-align:top;" colspan="2">
            <div style="font-size:8px;letter-spacing:.25em;color:#3a5010;text-transform:uppercase;margin-bottom:4px;">LOCATION</div>
            <div style="font-size:14px;font-weight:700;color:#ce93d8;">${ev.location || "Swindon Airsoft Field"}</div>
          </td>
        </tr>
      </table>
      <div style="background:#060d02;border:1px solid #1a2808;border-left:3px solid #c8ff00;padding:16px 20px;margin-bottom:20px;">
        <div style="font-size:8px;letter-spacing:.25em;color:#3a5010;text-transform:uppercase;margin-bottom:10px;font-weight:700;">PRE-GAME CHECKLIST</div>
        <table style="width:100%;border-collapse:collapse;">
          ${[
            ["Bring your QR code ticket (check your booking confirmation email)", "#c8ff00"],
            ["Arrive at least 15 minutes before start time for sign-in", "#8aaa60"],
            ["Approved eye protection is mandatory at all times", "#8aaa60"],
            ["Wear appropriate clothing for the weather and terrain", "#8aaa60"],
            ["All personal RIFs will be chronographed before play", "#8aaa60"],
          ].map(([item, col]) => `
          <tr>
            <td style="padding:5px 0;font-size:12px;color:${col};line-height:1.6;">▸ ${item}</td>
          </tr>`).join("")}
        </table>
      </div>
      ${user.bookingType === "rental" ? `
      <div style="background:#0a0f06;border:1px solid rgba(200,150,0,.3);padding:14px 20px;margin-bottom:20px;">
        <div style="font-size:8px;letter-spacing:.25em;color:#7a5010;text-transform:uppercase;margin-bottom:6px;font-weight:700;">🪖 YOUR RENTAL PACKAGE</div>
        <div style="font-size:12px;color:#8a7040;line-height:1.7;">Your rental kit will be prepared and waiting. Please collect from the marshal station on arrival. Do not modify or disassemble any equipment.</div>
      </div>` : ""}
      <div style="text-align:center;margin-top:8px;">
        <a href="https://swindon-airsoft.com/#profile/bookings" style="display:inline-block;background:#c8ff00;color:#0a0a0a;font-size:12px;font-weight:900;letter-spacing:.15em;text-transform:uppercase;padding:12px 32px;text-decoration:none;">VIEW MY BOOKING →</a>
      </div>
    </div>
    <div style="background:#060d02;border:1px solid #1a2808;border-top:none;padding:14px 32px;font-size:11px;color:#2a3a10;text-align:center;letter-spacing:.08em;">
      Need to cancel? Log in and visit Profile &rarr; Bookings. Cancellations within 48h receive game credits.
    </div>
    <div style="background:#0a0f06;border-top:2px solid #c8ff00;padding:18px 32px;text-align:center;border-left:1px solid #1a2808;border-right:1px solid #1a2808;">
      <a href="https://swindon-airsoft.com" style="font-size:11px;color:#c8ff00;letter-spacing:.25em;text-transform:uppercase;text-decoration:none;font-weight:700;font-family:Arial,sans-serif;">swindon-airsoft.com</a>
      <div style="font-size:10px;color:#2a3a10;margin-top:5px;letter-spacing:.1em;">&copy; 2026 Swindon Airsoft. All rights reserved.</div>
    </div>
    <div style="height:3px;background:linear-gradient(90deg,#1a2808,#c8ff00,#1a2808);"></div>
  </div>`;
    try {
      await sendEmail({ toEmail: user.email, toName: user.name || "Player", subject: `⚠ Reminder: ${ev.title} is ${urgency.toLowerCase()}`, htmlContent });
      sent++;
    } catch { failed++; }
  }
  return { sent, failed };
}

// ── Waitlist Slot Available Email ────────────────────────────
async function sendWaitlistNotifyEmail({ toEmail, toName, ev, ticketType }) {
  const dateStr = new Date(ev.date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const typeLabel = ticketType === "walkOn" ? "Walk-On" : "Rental Package";
  const htmlContent = `<div style="max-width:600px;margin:0 auto;background:#0a0a0a;font-family:Arial,sans-serif;color:#e0e0e0;">
    <div style="height:3px;background:#c8ff00;"></div>
    <div style="background:#0d0d0d;padding:24px 32px;text-align:center;border-left:1px solid #1a1a1a;border-right:1px solid #1a1a1a;">
      <div style="font-size:10px;letter-spacing:.3em;color:#c8ff00;font-weight:700;text-transform:uppercase;margin-bottom:8px;">🎯 SLOT AVAILABLE — ACT FAST</div>
      <img src="https://bnlndgjbcthxyodgstaa.supabase.co/storage/v1/object/public/email-templates/logo_transparent.png" alt="Swindon Airsoft" width="200" style="display:block;margin:0 auto 12px;height:auto;" />
    </div>
    <div style="background:#0d1300;border:1px solid #1a2808;border-top:none;padding:16px 24px;">
      <p style="font-size:14px;color:#8aaa60;line-height:1.8;margin-bottom:20px;">Good news, ${toName}! A <strong style="color:#c8ff00;">${typeLabel}</strong> slot has just opened up for the event you were waitlisted for:</p>
      <div style="background:#060d02;border:1px solid #1a2808;border-left:3px solid #c8ff00;padding:16px 20px;margin-bottom:20px;">
        <div style="font-size:22px;font-weight:900;color:#e8f0d8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">${ev.title}</div>
        <div style="font-size:13px;color:#8aaa60;">${dateStr}</div>
        <div style="font-size:13px;color:#4fc3f7;margin-top:4px;">${ev.time ? ev.time + " GMT" : ""}</div>
        <div style="font-size:13px;color:#ce93d8;margin-top:4px;">${ev.location || "Swindon Airsoft Field"}</div>
      </div>
      <div style="background:rgba(200,150,0,.1);border:1px solid rgba(200,150,0,.3);padding:14px 20px;margin-bottom:24px;">
        <div style="font-size:12px;color:var(--gold,#d4a017);font-weight:700;">⚠ Slots fill fast — book now before it's gone again.</div>
        <div style="font-size:11px;color:#8aaa60;margin-top:4px;">You will not be notified again if this slot fills up.</div>
      </div>
      <div style="text-align:center;">
        <a href="https://swindon-airsoft.com/#events" style="display:inline-block;background:#c8ff00;color:#0a0a0a;font-size:13px;font-weight:900;letter-spacing:.15em;text-transform:uppercase;padding:14px 36px;text-decoration:none;">BOOK NOW →</a>
      </div>
    </div>
    <div style="background:#060d02;border:1px solid #1a2808;border-top:none;padding:14px 32px;font-size:11px;color:#2a3a10;text-align:center;letter-spacing:.08em;">
      You received this because you joined the waitlist for this event.
    </div>
    <div style="background:#0a0f06;border-top:2px solid #c8ff00;padding:18px 32px;text-align:center;border-left:1px solid #1a2808;border-right:1px solid #1a2808;">
      <a href="https://swindon-airsoft.com" style="font-size:11px;color:#c8ff00;letter-spacing:.25em;text-transform:uppercase;text-decoration:none;font-weight:700;font-family:Arial,sans-serif;">swindon-airsoft.com</a>
      <div style="font-size:10px;color:#2a3a10;margin-top:5px;letter-spacing:.1em;">&copy; 2026 Swindon Airsoft. All rights reserved.</div>
    </div>
    <div style="height:3px;background:linear-gradient(90deg,#1a2808,#c8ff00,#1a2808);"></div>
  </div>`;
  await sendEmail({ toEmail, toName, subject: `🎯 A slot just opened — ${ev.title}`, htmlContent });
}

async function sendCancellationEmail({ cu, eventTitle, eventDate, ticketType, refundAmount, isCredits, isRental }) {
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-GB", { weekday:"long", day:"numeric", month:"long", year:"numeric" }) : "—";
  const refundLine = isCredits
    ? `£${refundAmount.toFixed(2)} has been added to your game credits and will automatically apply at your next checkout.`
    : `£${refundAmount.toFixed(2)} has been refunded to your original payment method. Please allow 3–5 working days.`;
  const rentalNote = isRental ? `<p style="margin:8px 0 0;font-size:12px;color:#888;">A 10% rental preparation fee has been applied to this cancellation.</p>` : "";
  const htmlContent = `<div style="background:#0a0a0a;font-family:'Barlow Condensed',Arial,sans-serif;max-width:560px;margin:0 auto;border:1px solid #1a1a1a;">
    <div style="height:3px;background:linear-gradient(90deg,#c8ff00,#8aaa60);margin:-32px -32px 24px;"></div>
    <div style="text-align:center;margin-bottom:24px;padding-bottom:20px;border-bottom:1px solid #1a2808;">
      <img src="https://bnlndgjbcthxyodgstaa.supabase.co/storage/v1/object/public/email-templates/logo_transparent.png" alt="Swindon Airsoft" width="160" style="display:block;margin:0 auto 10px;height:auto;" />
      <div style="font-size:9px;letter-spacing:.35em;color:#3a5010;text-transform:uppercase;font-weight:700;margin-bottom:6px;">◈ BOOKING UPDATE</div>
      <div style="font-size:24px;font-weight:900;color:#e8f0d8;letter-spacing:.06em;text-transform:uppercase;">Booking Cancelled</div>
    </div>
    <p style="color:#8a9a70;font-size:14px;line-height:1.6;margin:0 0 20px;">Hi ${cu.name || "Operative"},</p>
    <p style="color:#8a9a70;font-size:14px;line-height:1.6;margin:0 0 24px;">Your booking has been successfully cancelled. Here's a summary:</p>
    <div style="background:#111;border:1px solid #1e2a10;padding:16px 20px;margin-bottom:20px;">
      ${[
        ["Event", eventTitle || "—"],
        ["Date", fmtDate(eventDate)],
        ["Ticket", ticketType === "rental" ? "Rental Package" : "Walk-On"],
        ["Refund", `£${refundAmount.toFixed(2)} ${isCredits ? "(game credits)" : "(to original payment)"}`],
      ].map(([k, v]) => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #1a2808;font-size:13px;"><span style="color:#3a5010;letter-spacing:.08em;text-transform:uppercase;">${k}</span><span style="color:#c8e878;font-weight:700;">${v}</span></div>`).join("")}
    </div>
    <p style="color:#8a9a70;font-size:13px;line-height:1.6;margin:0 0 8px;">${refundLine}</p>
    ${rentalNote}
    <div style="margin-top:28px;text-align:center;">
      <a href="https://swindon-airsoft.com/#events" style="display:inline-block;background:#c8ff00;color:#0a0a0a;font-size:13px;font-weight:900;letter-spacing:.15em;text-transform:uppercase;padding:14px 36px;text-decoration:none;">BOOK ANOTHER GAME →</a>
    </div>
    <div style="background:#0a0f06;border-top:2px solid #c8ff00;padding:14px 24px;text-align:center;">
      <a href="https://swindon-airsoft.com" style="font-size:11px;color:#c8ff00;letter-spacing:.2em;text-transform:uppercase;text-decoration:none;font-family:Arial,sans-serif;font-weight:700;">swindon-airsoft.com</a>
      <div style="font-size:10px;color:#3a5010;margin-top:4px;letter-spacing:.1em;">© 2026 Swindon Airsoft. All rights reserved.</div>
    </div>
  </div>`;
  await sendEmail({ toEmail: cu.email, toName: cu.name, subject: `Booking Cancelled — ${eventTitle}`, htmlContent });
}

async function sendWelcomeEmail({ name, email }) {
  const htmlContent = `<div style="max-width:600px;margin:0 auto;background:#080e04;font-family:Arial,sans-serif;color:#e8f0d8;line-height:1;">
    <div style="height:3px;background:linear-gradient(90deg,#c8ff00,#8aaa60);"></div>
    <div style="background:#0d0d0d;padding:16px 24px;text-align:center;border-left:1px solid #1a2808;border-right:1px solid #1a2808;">
      <img src="https://bnlndgjbcthxyodgstaa.supabase.co/storage/v1/object/public/email-templates/logo_transparent.png" alt="Swindon Airsoft" width="180" style="display:block;margin:0 auto 10px;height:auto;" />
      <div style="font-size:9px;letter-spacing:.35em;color:#3a5010;text-transform:uppercase;font-weight:700;">◈ WELCOME TO THE TEAM</div>
    </div>
    <div style="background:#0a1005;border:1px solid #1a2808;border-top:none;padding:16px 24px;">
      <div style="font-size:8px;letter-spacing:.3em;color:#3a5010;text-transform:uppercase;font-weight:700;margin-bottom:10px;">OPERATIVE ONBOARDING</div>
      <div style="font-size:24px;font-weight:900;color:#c8ff00;letter-spacing:.04em;margin-bottom:16px;">Welcome, ${name}.</div>
      <p style="font-size:14px;color:#8aaa60;line-height:1.8;margin:0 0 20px;">Your account has been created. You are now part of the Swindon Airsoft community — run by airsofters, for airsofters.</p>
      <div style="background:#060d02;border:1px solid #1a2808;border-left:3px solid #c8ff00;padding:16px 20px;margin-bottom:20px;">
        <div style="font-size:8px;letter-spacing:.25em;color:#3a5010;text-transform:uppercase;margin-bottom:10px;font-weight:700;">NEXT STEPS</div>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:6px 0;font-size:13px;color:#c8ff00;line-height:1.6;">▸ Sign your liability waiver in your profile</td></tr>
          <tr><td style="padding:6px 0;font-size:13px;color:#8aaa60;line-height:1.6;">▸ Browse upcoming events and book your slot</td></tr>
          <tr><td style="padding:6px 0;font-size:13px;color:#8aaa60;line-height:1.6;">▸ Attend 3 games to qualify for VIP membership</td></tr>
        </table>
      </div>
      <div style="background:#0d1f0a;border:1px solid #c8ff00;padding:16px 20px;text-align:center;">
        <div style="font-size:13px;font-weight:700;color:#c8ff00;letter-spacing:.05em;">See you on the field, soldier. 🎯</div>
      </div>
    </div>
    <div style="background:#0a0f06;border-left:1px solid #1a2808;border-right:1px solid #1a2808;border-top:none;padding:12px 24px;text-align:center;">
      <a href="https://swindon-airsoft.com/#events" style="display:inline-block;background:#c8ff00;color:#0a0a0a;font-size:12px;font-weight:900;letter-spacing:.18em;text-transform:uppercase;padding:12px 30px;text-decoration:none;">BOOK YOUR FIRST GAME &rarr;</a>
    </div>
    <div style="background:#0a0f06;border-top:2px solid #c8ff00;padding:18px 32px;text-align:center;border-left:1px solid #1a2808;border-right:1px solid #1a2808;">
      <a href="https://swindon-airsoft.com" style="font-size:11px;color:#c8ff00;letter-spacing:.25em;text-transform:uppercase;text-decoration:none;font-weight:700;font-family:Arial,sans-serif;">swindon-airsoft.com</a>
      <div style="font-size:10px;color:#2a3a10;margin-top:5px;letter-spacing:.1em;">&copy; 2026 Swindon Airsoft. All rights reserved.</div>
    </div>
    <div style="height:3px;background:linear-gradient(90deg,#1a2808,#c8ff00,#1a2808);"></div>
  </div>`;

  await sendEmail({
    toEmail:     email,
    toName:      name,
    subject:     "Welcome to Swindon Airsoft! 🎯",
    htmlContent,
  });
}

// ── Send Order Confirmation Email ─────────────────────────────
async function sendOrderEmail({ cu, order, items, postageName }) {
  const itemRows = (items || []).map(i => `
    <tr>
      <td style="padding:10px 14px;border:1px solid #1a2808;background:#0a1005;font-size:13px;color:#e8f0d8;">${i.name}${i.variant ? ` &mdash; ${i.variant}` : ""}</td>
      <td style="padding:10px 14px;border:1px solid #1a2808;border-left:none;background:#0a1005;font-size:13px;color:#8aaa60;text-align:center;">${i.qty}</td>
      <td style="padding:10px 14px;border:1px solid #1a2808;border-left:none;background:#0a1005;font-size:13px;color:#c8ff00;font-weight:700;text-align:right;">£${(Number(i.price)*i.qty).toFixed(2)}</td>
    </tr>`).join("");

  const htmlContent = `<div style="max-width:600px;margin:0 auto;background:#080e04;font-family:Arial,sans-serif;color:#e8f0d8;line-height:1;">
    <div style="height:3px;background:linear-gradient(90deg,#c8ff00,#8aaa60);"></div>
    <div style="background:#0d0d0d;padding:16px 24px;text-align:center;border-left:1px solid #1a2808;border-right:1px solid #1a2808;">
      <img src="https://bnlndgjbcthxyodgstaa.supabase.co/storage/v1/object/public/email-templates/logo_transparent.png" alt="Swindon Airsoft" width="180" style="display:block;margin:0 auto 10px;height:auto;" />
      <div style="font-size:9px;letter-spacing:.35em;color:#3a5010;text-transform:uppercase;font-weight:700;">◈ ORDER CONFIRMATION</div>
    </div>
    <div style="background:#0a1005;border:1px solid #1a2808;border-top:none;padding:16px 24px;">
      <div style="font-size:8px;letter-spacing:.3em;color:#3a5010;text-transform:uppercase;font-weight:700;margin-bottom:6px;">ORDER REFERENCE</div>
      <div style="font-size:22px;font-weight:900;color:#c8ff00;letter-spacing:.08em;margin-bottom:20px;">#${(order.id||"").slice(0,8).toUpperCase()}</div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:4px;">
        <tr style="background:#060d02;">
          <th style="padding:8px 14px;text-align:left;font-size:8px;letter-spacing:.2em;color:#3a5010;text-transform:uppercase;border:1px solid #1a2808;">Item</th>
          <th style="padding:8px 14px;text-align:center;font-size:8px;letter-spacing:.2em;color:#3a5010;text-transform:uppercase;border:1px solid #1a2808;border-left:none;">Qty</th>
          <th style="padding:8px 14px;text-align:right;font-size:8px;letter-spacing:.2em;color:#3a5010;text-transform:uppercase;border:1px solid #1a2808;border-left:none;">Total</th>
        </tr>
        ${itemRows}
        <tr>
          <td colspan="2" style="padding:10px 14px;border:1px solid #1a2808;border-top:none;background:#060d02;font-size:12px;color:#3a5010;">Postage (${postageName || "Standard"})</td>
          <td style="padding:10px 14px;border:1px solid #1a2808;border-top:none;border-left:none;background:#060d02;font-size:12px;color:#8aaa60;text-align:right;">£${Number(order.postage||0).toFixed(2)}</td>
        </tr>
        <tr>
          <td colspan="2" style="padding:12px 14px;border:1px solid #1a2808;border-top:none;background:#0d1f0a;font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#8aaa60;">Total Paid</td>
          <td style="padding:12px 14px;border:1px solid #1a2808;border-top:none;border-left:none;background:#0d1f0a;font-size:20px;font-weight:900;color:#c8ff00;text-align:right;">£${Number(order.total||0).toFixed(2)}</td>
        </tr>
      </table>
      ${order.customerAddress ? `
      <div style="background:#060d02;border:1px solid #1a2808;border-left:3px solid #4fc3f7;padding:14px 18px;margin-top:16px;">
        <div style="font-size:8px;letter-spacing:.25em;color:#3a5010;text-transform:uppercase;margin-bottom:6px;font-weight:700;">SHIPPING TO</div>
        <div style="font-size:13px;color:#8aaa60;white-space:pre-line;">${order.customerAddress}</div>
      </div>` : ""}
      <div style="background:#060d02;border:1px solid #1a2808;border-left:3px solid #c8ff00;padding:14px 18px;margin-top:16px;font-size:12px;color:#3a5010;line-height:1.7;">
        ▸ We'll notify you when your order is dispatched. Allow 3&ndash;5 working days for delivery.
      </div>
    </div>
    <div style="background:#0a0f06;border-top:2px solid #c8ff00;padding:18px 32px;text-align:center;border-left:1px solid #1a2808;border-right:1px solid #1a2808;">
      <a href="https://swindon-airsoft.com" style="font-size:11px;color:#c8ff00;letter-spacing:.25em;text-transform:uppercase;text-decoration:none;font-weight:700;font-family:Arial,sans-serif;">swindon-airsoft.com</a>
      <div style="font-size:10px;color:#2a3a10;margin-top:5px;letter-spacing:.1em;">&copy; 2026 Swindon Airsoft. All rights reserved.</div>
    </div>
    <div style="height:3px;background:linear-gradient(90deg,#1a2808,#c8ff00,#1a2808);"></div>
  </div>`;

  await sendEmail({
    toEmail,
    toName:      cu.name || "Customer",
    subject:     `✅ Order Confirmed #${(order.id||"").slice(0,8).toUpperCase()}`,
    htmlContent,
  });
}

// ── Send Order Dispatch Email ─────────────────────────────────
async function sendDispatchEmail({ toEmail, toName, order, items, tracking }) {
  const itemRows = (items || []).map(i => `
    <tr>
      <td style="padding:9px 14px;border:1px solid #1a2808;background:#0a1005;font-size:13px;color:#e8f0d8;">${i.name}${i.variant ? ` &mdash; ${i.variant}` : ""}</td>
      <td style="padding:9px 14px;border:1px solid #1a2808;border-left:none;background:#0a1005;font-size:13px;color:#8aaa60;text-align:center;">${i.qty}</td>
    </tr>`).join("");

  const htmlContent = `<div style="max-width:600px;margin:0 auto;background:#080e04;font-family:Arial,sans-serif;color:#e8f0d8;line-height:1;">
    <div style="height:3px;background:linear-gradient(90deg,#c8ff00,#8aaa60);"></div>
    <div style="background:#0d0d0d;padding:16px 24px;text-align:center;border-left:1px solid #1a2808;border-right:1px solid #1a2808;">
      <img src="https://bnlndgjbcthxyodgstaa.supabase.co/storage/v1/object/public/email-templates/logo_transparent.png" alt="Swindon Airsoft" width="180" style="display:block;margin:0 auto 10px;height:auto;" />
      <div style="font-size:9px;letter-spacing:.35em;color:#3a5010;text-transform:uppercase;font-weight:700;">◈ ORDER DISPATCHED</div>
    </div>
    <div style="background:#0a1005;border:1px solid #1a2808;border-top:none;padding:16px 24px;">
      <div style="background:#0d1f0a;border:1px solid #c8ff00;padding:18px 20px;text-align:center;margin-bottom:20px;">
        <div style="font-size:11px;letter-spacing:.2em;color:#3a5010;text-transform:uppercase;margin-bottom:6px;">STATUS UPDATE</div>
        <div style="font-size:22px;font-weight:900;color:#c8ff00;letter-spacing:.05em;text-transform:uppercase;">📦 Your order is on its way!</div>
        <div style="font-size:12px;color:#3a5010;margin-top:6px;font-family:monospace;letter-spacing:.12em;">REF: #${(order.id||"").slice(0,8).toUpperCase()}</div>
      </div>
      ${itemRows ? `
      <div style="margin-bottom:16px;">
        <div style="font-size:8px;letter-spacing:.25em;color:#3a5010;text-transform:uppercase;font-weight:700;margin-bottom:8px;">ITEMS DISPATCHED</div>
        <table style="width:100%;border-collapse:collapse;">
          <tr style="background:#060d02;">
            <th style="padding:8px 14px;text-align:left;font-size:8px;letter-spacing:.2em;color:#3a5010;text-transform:uppercase;border:1px solid #1a2808;">Item</th>
            <th style="padding:8px 14px;text-align:center;font-size:8px;letter-spacing:.2em;color:#3a5010;text-transform:uppercase;border:1px solid #1a2808;border-left:none;">Qty</th>
          </tr>
          ${itemRows}
        </table>
      </div>` : ""}
      ${order.customerAddress ? `
      <div style="background:#060d02;border:1px solid #1a2808;border-left:3px solid #4fc3f7;padding:14px 18px;margin-bottom:16px;">
        <div style="font-size:8px;letter-spacing:.25em;color:#3a5010;text-transform:uppercase;margin-bottom:6px;font-weight:700;">SHIPPING TO</div>
        <div style="font-size:13px;color:#8aaa60;white-space:pre-line;">${order.customerAddress}</div>
      </div>` : ""}
      ${tracking ? `
      <div style="background:#060d02;border:1px solid #1a2808;border-left:3px solid #c8ff00;padding:14px 18px;margin-bottom:16px;">
        <div style="font-size:8px;letter-spacing:.25em;color:#3a5010;text-transform:uppercase;margin-bottom:6px;font-weight:700;">📮 TRACKING NUMBER</div>
        <div style="font-size:20px;font-weight:900;color:#c8ff00;font-family:monospace;letter-spacing:.1em;">${tracking}</div>
      </div>` : ""}
      <div style="background:#060d02;border:1px solid #1a2808;border-left:3px solid #8aaa60;padding:14px 18px;font-size:12px;color:#3a5010;line-height:1.7;">
        ▸ Allow 3&ndash;5 working days for delivery. Any questions? Reply to this email or visit the website.
      </div>
    </div>
    <div style="background:#0a0f06;border-top:2px solid #c8ff00;padding:18px 32px;text-align:center;border-left:1px solid #1a2808;border-right:1px solid #1a2808;">
      <a href="https://swindon-airsoft.com" style="font-size:11px;color:#c8ff00;letter-spacing:.25em;text-transform:uppercase;text-decoration:none;font-weight:700;font-family:Arial,sans-serif;">swindon-airsoft.com</a>
      <div style="font-size:10px;color:#2a3a10;margin-top:5px;letter-spacing:.1em;">&copy; 2026 Swindon Airsoft. All rights reserved.</div>
    </div>
    <div style="height:3px;background:linear-gradient(90deg,#1a2808,#c8ff00,#1a2808);"></div>
  </div>`;

  await sendEmail({
    toEmail,
    toName:      toName || "Customer",
    subject:     `📦 Your Order Has Been Dispatched — #${(order.id||"").slice(0,8).toUpperCase()}`,
    htmlContent,
  });
}

// ── Send New Event Announcement Email ────────────────────────
async function sendNewEventEmail({ ev, users }) {
  const dateStr = new Date(ev.date).toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });
  const timeStr = ev.endTime ? `${ev.time}–${ev.endTime} GMT` : ev.time ? `${ev.time} GMT` : "";
  const lowestPrice = Math.min(
    Number(ev.walkOnPrice) || 0,
    Number(ev.rentalPrice) || 0
  );

  const htmlContent = `<div style="max-width:600px;margin:0 auto;background:#0a0a0a;padding:0;font-family:Arial,sans-serif;color:#e0e0e0;">

    <!-- Top accent bar -->
    <div style="height:3px;background:#c8ff00;"></div>

    <!-- Header -->
    <div style="background:#0d0d0d;border-left:1px solid #1a1a1a;border-right:1px solid #1a1a1a;padding:28px 32px;text-align:center;">
      <div style="font-size:11px;letter-spacing:.3em;color:#c8ff00;text-transform:uppercase;margin-bottom:10px;font-weight:700;">◈ NEW EVENT</div>
      <img src="https://bnlndgjbcthxyodgstaa.supabase.co/storage/v1/object/public/email-templates/logo_transparent.png" alt="Swindon Airsoft" width="200" style="display:block;margin:0 auto 12px;height:auto;" />
      <div style="font-size:10px;color:#3a3a3a;letter-spacing:.25em;margin-top:6px;text-transform:uppercase;">FIELD INTELLIGENCE</div>
    </div>

    <!-- Banner / title block -->
    ${ev.banner ? `<div style="background:#111;border-left:1px solid #1a1a1a;border-right:1px solid #1a1a1a;"><img src="${ev.banner}" style="width:100%;display:block;max-height:260px;object-fit:cover;opacity:.85;" alt="${ev.title}" /></div>` : ""}

    <!-- Event title -->
    <div style="background:#0d1300;border:1px solid #1a2808;border-top:none;padding:16px 24px;">
      <div style="font-size:9px;letter-spacing:.3em;color:#3a5010;text-transform:uppercase;margin-bottom:10px;font-weight:700;">MISSION BRIEFING</div>
      <div style="font-size:30px;font-weight:900;letter-spacing:.05em;color:#e8f0d8;text-transform:uppercase;line-height:1.1;margin-bottom:20px;">${ev.title}</div>

      <!-- Key details grid -->
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <tr>
          <td style="padding:10px 14px;background:#0a0f06;border:1px solid #1a2808;width:50%;vertical-align:top;">
            <div style="font-size:8px;letter-spacing:.25em;color:#3a5010;text-transform:uppercase;margin-bottom:4px;">DATE</div>
            <div style="font-size:14px;font-weight:700;color:#c8ff00;">${dateStr}</div>
          </td>
          <td style="padding:10px 14px;background:#0a0f06;border:1px solid #1a2808;border-left:none;width:50%;vertical-align:top;">
            <div style="font-size:8px;letter-spacing:.25em;color:#3a5010;text-transform:uppercase;margin-bottom:4px;">TIME</div>
            <div style="font-size:14px;font-weight:700;color:#4fc3f7;">${timeStr || "TBC"}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:10px 14px;background:#0a0f06;border:1px solid #1a2808;border-top:none;vertical-align:top;">
            <div style="font-size:8px;letter-spacing:.25em;color:#3a5010;text-transform:uppercase;margin-bottom:4px;">LOCATION</div>
            <div style="font-size:14px;font-weight:700;color:#ce93d8;">${ev.location || "Swindon Airsoft Field"}</div>
          </td>
          <td style="padding:10px 14px;background:#0a0f06;border:1px solid #1a2808;border-top:none;border-left:none;vertical-align:top;">
            <div style="font-size:8px;letter-spacing:.25em;color:#3a5010;text-transform:uppercase;margin-bottom:4px;">FROM</div>
            <div style="font-size:22px;font-weight:900;color:#c8ff00;line-height:1;">£${lowestPrice.toFixed(2)}</div>
          </td>
        </tr>
      </table>

      <!-- Description -->
      ${ev.description ? `
      <div style="background:#060d02;border:1px solid #1a2808;border-left:3px solid #c8ff00;padding:16px 20px;margin-bottom:20px;">
        <div style="font-size:8px;letter-spacing:.25em;color:#3a5010;text-transform:uppercase;margin-bottom:8px;font-weight:700;">BRIEFING NOTES</div>
        <div style="font-size:13px;color:#8aaa60;line-height:1.8;">${ev.description.replace(/\n/g, "<br>")}</div>
      </div>` : ""}

      <!-- Pricing breakdown -->
      <div style="background:#0a0f06;border:1px solid #1a2808;padding:16px 20px;margin-bottom:20px;">
        <div style="font-size:8px;letter-spacing:.25em;color:#3a5010;text-transform:uppercase;margin-bottom:12px;font-weight:700;">TICKET PRICES</div>
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:8px 0;border-bottom:1px solid #1a2808;font-size:13px;color:#b0c090;">🎯 Walk-On</td>
            <td style="padding:8px 0;border-bottom:1px solid #1a2808;font-size:16px;font-weight:900;color:#c8ff00;text-align:right;">£${Number(ev.walkOnPrice||0).toFixed(2)}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;font-size:13px;color:#b0c090;">🪖 Rental Package</td>
            <td style="padding:8px 0;font-size:16px;font-weight:900;color:#c8ff00;text-align:right;">£${Number(ev.rentalPrice||0).toFixed(2)}</td>
          </tr>
        </table>
      </div>

      <!-- Max players -->
      ${(ev.walkOnSlots || ev.rentalSlots) ? `<div style="font-size:11px;color:#3a5010;text-align:center;margin-bottom:20px;letter-spacing:.1em;">⚠ LIMITED TO ${(Number(ev.walkOnSlots || 0) + Number(ev.rentalSlots || 0))} PLAYERS — BOOK EARLY</div>` : ""}

      <!-- CTA -->
      <div style="text-align:center;margin-top:8px;">
        <a href="https://swindon-airsoft.com/#events" style="display:inline-block;background:#c8ff00;color:#0a0a0a;font-size:13px;font-weight:900;letter-spacing:.15em;text-transform:uppercase;padding:14px 36px;text-decoration:none;">BOOK YOUR SLOT →</a>
      </div>
    </div>

    <!-- Rules reminder -->
    <div style="background:#0a0a0a;border:1px solid #1a1a1a;border-top:none;padding:20px 32px;">
      <div style="font-size:8px;letter-spacing:.25em;color:#2a2a2a;text-transform:uppercase;margin-bottom:10px;">FIELD RULES</div>
      <table style="width:100%;border-collapse:collapse;">
        ${["Full-seal eye protection mandatory at all times","Arrive 30 minutes before start time","Under 18s require signed parental consent","All players must have a valid waiver on file"].map(rule => `
        <tr><td style="padding:5px 0;font-size:12px;color:#3a3a3a;"><span style="color:#c8ff00;margin-right:8px;">▸</span>${rule}</td></tr>`).join("")}
      </table>
    </div>

    <!-- Bottom bar -->
    <div style="height:1px;background:#1a1a1a;"></div>
    <div style="background:#060d02;border:1px solid #1a2808;border-top:none;padding:14px 32px;text-align:center;">
      <div style="font-size:9px;color:#2a3a10;letter-spacing:.1em;">You're receiving this because you have a Swindon Airsoft account.</div>
    </div>
    <div style="background:#0a0f06;border-top:2px solid #c8ff00;padding:18px 32px;text-align:center;border-left:1px solid #1a2808;border-right:1px solid #1a2808;">
      <a href="https://swindon-airsoft.com" style="font-size:11px;color:#c8ff00;letter-spacing:.25em;text-transform:uppercase;text-decoration:none;font-weight:700;font-family:Arial,sans-serif;">swindon-airsoft.com</a>
      <div style="font-size:10px;color:#2a3a10;margin-top:5px;letter-spacing:.1em;">&copy; 2026 Swindon Airsoft. All rights reserved.</div>
    </div>
    <div style="height:3px;background:linear-gradient(90deg,#1a2808,#c8ff00,#1a2808);"></div>
  </div>`;

  const recipients = (users || []).filter(u => u.email && u.role !== "admin");
  const results = { sent: 0, failed: 0, errors: [] };
  for (const u of recipients) {
    try {
      await sendEmail({
        toEmail:     u.email,
        toName:      u.name || "Player",
        subject:     `🎯 New Event: ${ev.title} — ${dateStr}`,
        htmlContent,
      });
      results.sent++;
      // Small delay to avoid rate-limiting
      await new Promise(r => setTimeout(r, 200));
    } catch (e) {
      results.failed++;
      results.errors.push(`${u.email}: ${e.message}`);
    }
  }
  return results;
}

// ── Admin notification: new booking ─────────────────────────
// Fired after a player successfully books. Sends to the site contact_email.
async function sendAdminBookingNotification({ adminEmail, cu, ev, bookings, total }) {
  if (!adminEmail) return;
  const dateStr = new Date(ev.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const rows = (bookings || []).map(b =>
    `<tr>
      <td style="padding:7px 12px;border:1px solid #1a2808;color:#ccc;font-size:13px;">${b.type === "walkOn" ? "Walk-On" : "Rental"}</td>
      <td style="padding:7px 12px;border:1px solid #1a2808;color:#ccc;font-size:13px;text-align:center;">${b.qty}</td>
      <td style="padding:7px 12px;border:1px solid #1a2808;color:#c8ff00;font-size:13px;font-weight:700;">£${Number(b.total).toFixed(2)}</td>
    </tr>`
  ).join("");
  const htmlContent = `<div style="background:#0a0a0a;font-family:'Arial',sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#0d1300;border:1px solid #1a2808;border-radius:4px;overflow:hidden;">
      <div style="background:#0a0f06;padding:16px 24px;border-bottom:1px solid #1a2808;">
        <img src="https://bnlndgjbcthxyodgstaa.supabase.co/storage/v1/object/public/email-templates/logo_transparent.png" alt="Swindon Airsoft" width="200" style="display:block;margin:0 auto 12px;height:auto;" />
        <div style="font-size:9px;letter-spacing:.3em;color:#3a5010;text-transform:uppercase;margin-bottom:4px;">Swindon Airsoft · Admin Alert</div>
        <div style="font-size:22px;font-weight:900;color:#c8ff00;letter-spacing:.04em;">NEW BOOKING</div>
      </div>
      <div style="padding:20px 24px;">
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
          <tr><td style="padding:7px 12px;border:1px solid #1a2808;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:.1em;width:30%;">Player</td><td style="padding:7px 12px;border:1px solid #1a2808;color:#fff;font-size:13px;">${cu.name}</td></tr>
          <tr><td style="padding:7px 12px;border:1px solid #1a2808;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:.1em;">Email</td><td style="padding:7px 12px;border:1px solid #1a2808;color:#4fc3f7;font-size:13px;">${cu.email}</td></tr>
          <tr><td style="padding:7px 12px;border:1px solid #1a2808;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:.1em;">Event</td><td style="padding:7px 12px;border:1px solid #1a2808;color:#fff;font-size:13px;">${ev.title}</td></tr>
          <tr><td style="padding:7px 12px;border:1px solid #1a2808;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:.1em;">Date</td><td style="padding:7px 12px;border:1px solid #1a2808;color:#fff;font-size:13px;">${dateStr}</td></tr>
          <tr><td style="padding:7px 12px;border:1px solid #1a2808;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:.1em;">Total Paid</td><td style="padding:7px 12px;border:1px solid #1a2808;color:#c8ff00;font-size:15px;font-weight:900;">£${Number(total).toFixed(2)}</td></tr>
        </table>
        <table style="width:100%;border-collapse:collapse;">
          <tr style="background:#0a0f06;"><th style="padding:7px 12px;text-align:left;font-size:9px;letter-spacing:.2em;color:#3a5010;text-transform:uppercase;">Ticket Type</th><th style="padding:7px 12px;text-align:center;font-size:9px;letter-spacing:.2em;color:#3a5010;text-transform:uppercase;">Qty</th><th style="padding:7px 12px;text-align:left;font-size:9px;letter-spacing:.2em;color:#3a5010;text-transform:uppercase;">Total</th></tr>
          ${rows}
        </table>
      </div>
      <div style="background:#0a0f06;border-top:2px solid #c8ff00;padding:12px 24px;text-align:center;">
      <a href="https://swindon-airsoft.com" style="font-size:11px;color:#c8ff00;letter-spacing:.2em;text-transform:uppercase;text-decoration:none;font-family:Arial,sans-serif;font-weight:700;">swindon-airsoft.com</a>
      <div style="font-size:9px;color:#3a5010;letter-spacing:.15em;text-transform:uppercase;margin-top:3px;">Admin · Auto-generated notification</div>
    </div>
    </div>
  </div>`;
  await sendEmail({ toEmail: adminEmail, toName: "Swindon Airsoft Admin", subject: `📋 New Booking: ${cu.name} — ${ev.title} (£${Number(total).toFixed(2)})`, htmlContent });
}

// ── Admin notification: new shop order ──────────────────────
async function sendAdminOrderNotification({ adminEmail, cu, order, items }) {
  if (!adminEmail) return;
  const rows = (items || []).map(i =>
    `<tr>
      <td style="padding:7px 12px;border:1px solid #1a2808;color:#ccc;font-size:13px;">${i.name}${i.variant ? ` <span style="color:#888;font-size:11px;">(${i.variant})</span>` : ""}</td>
      <td style="padding:7px 12px;border:1px solid #1a2808;color:#ccc;font-size:13px;text-align:center;">${i.qty}</td>
      <td style="padding:7px 12px;border:1px solid #1a2808;color:#c8ff00;font-size:13px;font-weight:700;">£${Number(i.price * i.qty).toFixed(2)}</td>
    </tr>`
  ).join("");
  const htmlContent = `<div style="background:#0a0a0a;font-family:'Arial',sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#0d1300;border:1px solid #1a2808;border-radius:4px;overflow:hidden;">
      <div style="background:#0a0f06;padding:16px 24px;border-bottom:1px solid #1a2808;">
        <img src="https://bnlndgjbcthxyodgstaa.supabase.co/storage/v1/object/public/email-templates/logo_transparent.png" alt="Swindon Airsoft" width="200" style="display:block;margin:0 auto 12px;height:auto;" />
        <div style="font-size:9px;letter-spacing:.3em;color:#3a5010;text-transform:uppercase;margin-bottom:4px;">Swindon Airsoft · Admin Alert</div>
        <div style="font-size:22px;font-weight:900;color:#c8ff00;letter-spacing:.04em;">NEW SHOP ORDER</div>
      </div>
      <div style="padding:20px 24px;">
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
          <tr><td style="padding:7px 12px;border:1px solid #1a2808;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:.1em;width:30%;">Customer</td><td style="padding:7px 12px;border:1px solid #1a2808;color:#fff;font-size:13px;">${cu?.name || order.customerName}</td></tr>
          <tr><td style="padding:7px 12px;border:1px solid #1a2808;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:.1em;">Email</td><td style="padding:7px 12px;border:1px solid #1a2808;color:#4fc3f7;font-size:13px;">${cu?.email || order.customerEmail}</td></tr>
          <tr><td style="padding:7px 12px;border:1px solid #1a2808;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:.1em;">Ship To</td><td style="padding:7px 12px;border:1px solid #1a2808;color:#fff;font-size:13px;">${order.customerAddress || "—"}</td></tr>
          <tr><td style="padding:7px 12px;border:1px solid #1a2808;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:.1em;">Postage</td><td style="padding:7px 12px;border:1px solid #1a2808;color:#fff;font-size:13px;">${order.postageName || "N/A"} · £${Number(order.postage || 0).toFixed(2)}</td></tr>
          <tr><td style="padding:7px 12px;border:1px solid #1a2808;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:.1em;">Total</td><td style="padding:7px 12px;border:1px solid #1a2808;color:#c8ff00;font-size:15px;font-weight:900;">£${Number(order.total).toFixed(2)}</td></tr>
        </table>
        <table style="width:100%;border-collapse:collapse;">
          <tr style="background:#0a0f06;"><th style="padding:7px 12px;text-align:left;font-size:9px;letter-spacing:.2em;color:#3a5010;text-transform:uppercase;">Item</th><th style="padding:7px 12px;text-align:center;font-size:9px;letter-spacing:.2em;color:#3a5010;text-transform:uppercase;">Qty</th><th style="padding:7px 12px;text-align:left;font-size:9px;letter-spacing:.2em;color:#3a5010;text-transform:uppercase;">Total</th></tr>
          ${rows}
        </table>
      </div>
      <div style="background:#0a0f06;border-top:2px solid #c8ff00;padding:12px 24px;text-align:center;">
      <a href="https://swindon-airsoft.com" style="font-size:11px;color:#c8ff00;letter-spacing:.2em;text-transform:uppercase;text-decoration:none;font-family:Arial,sans-serif;font-weight:700;">swindon-airsoft.com</a>
      <div style="font-size:9px;color:#3a5010;letter-spacing:.15em;text-transform:uppercase;margin-top:3px;">Admin · Auto-generated notification</div>
    </div>
    </div>
  </div>`;
  await sendEmail({ toEmail: adminEmail, toName: "Swindon Airsoft Admin", subject: `🛒 New Order: ${cu?.name || order.customerName} — £${Number(order.total).toFixed(2)}`, htmlContent });
}

// ── Admin: Return Request Notification ───────────────────────
async function sendAdminReturnNotification({ adminEmail, order }) {
  if (!adminEmail) return;
  const htmlContent = `<div style="background:#0a0a0a;font-family:'Arial',sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#0d1300;border:1px solid #1a2808;border-radius:4px;overflow:hidden;">
      <div style="background:#0a0f06;padding:16px 24px;border-bottom:1px solid #1a2808;">
        <img src="https://bnlndgjbcthxyodgstaa.supabase.co/storage/v1/object/public/email-templates/logo_transparent.png" alt="Swindon Airsoft" width="200" style="display:block;margin:0 auto 12px;height:auto;" />
        <div style="font-size:9px;letter-spacing:.3em;color:#3a5010;text-transform:uppercase;margin-bottom:4px;">Swindon Airsoft · Admin Alert</div>
        <div style="font-size:22px;font-weight:900;color:#e0a000;letter-spacing:.04em;">&#8617; RETURN REQUESTED</div>
      </div>
      <div style="padding:20px 24px;">
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
          <tr><td style="padding:7px 12px;border:1px solid #1a2808;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:.1em;width:30%;">Customer</td><td style="padding:7px 12px;border:1px solid #1a2808;color:#fff;font-size:13px;">${order.customer_name || order.customerName || "—"}</td></tr>
          <tr><td style="padding:7px 12px;border:1px solid #1a2808;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:.1em;">Email</td><td style="padding:7px 12px;border:1px solid #1a2808;color:#4fc3f7;font-size:13px;">${order.customer_email || order.customerEmail || "—"}</td></tr>
          <tr><td style="padding:7px 12px;border:1px solid #1a2808;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:.1em;">Order #</td><td style="padding:7px 12px;border:1px solid #1a2808;color:#c8ff00;font-size:13px;font-family:monospace;">${(order.id || "").slice(0,8).toUpperCase()}</td></tr>
          <tr><td style="padding:7px 12px;border:1px solid #1a2808;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:.1em;">Order Total</td><td style="padding:7px 12px;border:1px solid #1a2808;color:#c8ff00;font-size:13px;font-weight:900;">&#163;${Number(order.total || 0).toFixed(2)}</td></tr>
          <tr><td style="padding:7px 12px;border:1px solid #1a2808;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:.1em;">Return Ref</td><td style="padding:7px 12px;border:1px solid #1a2808;color:#e0a000;font-size:13px;font-family:monospace;font-weight:700;">${order.return_number || "—"}</td></tr>
          <tr><td style="padding:7px 12px;border:1px solid #1a2808;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:.1em;">Reason</td><td style="padding:7px 12px;border:1px solid #1a2808;color:#fff;font-size:13px;">${order.return_reason || "—"}</td></tr>
          ${order.return_notes ? `<tr><td style="padding:7px 12px;border:1px solid #1a2808;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:.1em;">Notes</td><td style="padding:7px 12px;border:1px solid #1a2808;color:#ccc;font-size:13px;">${order.return_notes}</td></tr>` : ""}
        </table>
        <div style="background:#1a1500;border:1px solid #332800;border-radius:4px;padding:12px 16px;font-size:12px;color:#8a7040;line-height:1.6;">
          Log in to the admin panel &#8594; Shop &#8594; Orders to approve or reject this return request.
        </div>
      </div>
      <div style="background:#0a0f06;border-top:2px solid #c8ff00;padding:12px 24px;text-align:center;">
      <a href="https://swindon-airsoft.com" style="font-size:11px;color:#c8ff00;letter-spacing:.2em;text-transform:uppercase;text-decoration:none;font-family:Arial,sans-serif;font-weight:700;">swindon-airsoft.com</a>
      <div style="font-size:9px;color:#3a5010;letter-spacing:.15em;text-transform:uppercase;margin-top:3px;">Admin · Auto-generated notification</div>
    </div>
    </div>
  </div>`;
  await sendEmail({ toEmail: adminEmail, toName: "Swindon Airsoft Admin", subject: `Return Request: ${order.customer_name || order.customerName} — Order #${(order.id||"").slice(0,8).toUpperCase()}`, htmlContent });
}

// ── Customer: Return Decision Email ──────────────────────────
async function sendReturnDecisionEmail({ toEmail, toName, order, approved, rejectionReason }) {
  const orderRef = (order.id || "").slice(0, 8).toUpperCase();
  const htmlContent = approved ? `
  <div style="max-width:600px;margin:0 auto;background:#0a0a0a;font-family:Arial,sans-serif;color:#fff;line-height:1;">
    <div style="height:3px;background:linear-gradient(90deg,#c8ff00,#8aaa60);margin:-32px -16px 24px;"></div>
    <div style="text-align:center;margin-bottom:24px;padding-bottom:20px;border-bottom:1px solid #1a2808;">
      <img src="https://bnlndgjbcthxyodgstaa.supabase.co/storage/v1/object/public/email-templates/logo_transparent.png" alt="Swindon Airsoft" width="160" style="display:block;margin:0 auto 10px;height:auto;" />
      <div style="font-size:9px;letter-spacing:.35em;color:#3a5010;text-transform:uppercase;font-weight:700;">◈ RETURN APPROVED</div>
    </div>
    <div style="background:#0d1f0a;border:1px solid #1a3a10;border-radius:8px;padding:20px 24px;margin-bottom:20px;text-align:center;">
      <div style="font-size:36px;margin-bottom:8px;">&#10003;</div>
      <div style="font-size:22px;font-weight:900;color:#c8ff00;letter-spacing:.08em;text-transform:uppercase;">Your Return Has Been Approved</div>
      <div style="font-size:13px;color:#8aaa60;margin-top:8px;">Order #${orderRef}</div>
    </div>
    <div style="background:#111;border:1px solid #222;border-radius:8px;padding:20px 24px;margin-bottom:20px;">
      <div style="font-size:11px;letter-spacing:.15em;color:#c8ff00;font-weight:700;text-transform:uppercase;margin-bottom:12px;">NEXT STEPS</div>
      <ol style="color:#ccc;font-size:13px;line-height:2;padding-left:20px;margin:0;">
        <li>Package your item securely in its <strong style="color:#fff;">original packaging where possible</strong>.</li>
        <li>Items must be in <strong style="color:#fff;">unused, unopened condition</strong>. Deductions may apply for items that have been opened or used.</li>
        <li>Write your return reference <strong style="color:#c8ff00;font-family:monospace;">${order.return_number || ""}</strong> clearly on the outside of the package.</li>
        <li>Post the item back to us — <strong style="color:#fff;">return postage is your responsibility</strong>.</li>
        <li>Log in and enter your return tracking number on the order page so we can monitor your shipment.</li>
      </ol>
    </div>
    <div style="background:#111;border:1px solid #333;border-left:3px solid #c8ff00;border-radius:4px;padding:14px 20px;margin-bottom:20px;font-size:13px;color:#aaa;line-height:1.6;">
      Once we receive and inspect your return, a refund will be processed to your original payment method within 5–10 business days. Deductions may be made for items that are not in original unused condition or are missing packaging.
    </div>
    <div style="background:#0a0f06;border-top:2px solid #c8ff00;padding:14px 24px;text-align:center;">
      <a href="https://swindon-airsoft.com" style="font-size:11px;color:#c8ff00;letter-spacing:.2em;text-transform:uppercase;text-decoration:none;font-family:Arial,sans-serif;font-weight:700;">swindon-airsoft.com</a>
      <div style="font-size:10px;color:#3a5010;margin-top:4px;letter-spacing:.1em;">© 2026 Swindon Airsoft. All rights reserved.</div>
    </div>
  </div>` : `
  <div style="max-width:600px;margin:0 auto;background:#0a0a0a;font-family:Arial,sans-serif;color:#fff;line-height:1;">
    <div style="height:3px;background:linear-gradient(90deg,#c8ff00,#8aaa60);margin:-32px -16px 24px;"></div>
    <div style="text-align:center;margin-bottom:24px;padding-bottom:20px;border-bottom:1px solid #1a2808;">
      <img src="https://bnlndgjbcthxyodgstaa.supabase.co/storage/v1/object/public/email-templates/logo_transparent.png" alt="Swindon Airsoft" width="160" style="display:block;margin:0 auto 10px;height:auto;" />
      <div style="font-size:9px;letter-spacing:.35em;color:#3a5010;text-transform:uppercase;font-weight:700;">◈ RETURN UPDATE</div>
    </div>
    <div style="background:#1a0808;border:1px solid #3a1010;border-radius:8px;padding:20px 24px;margin-bottom:20px;text-align:center;">
      <div style="font-size:36px;margin-bottom:8px;">&#10007;</div>
      <div style="font-size:22px;font-weight:900;color:#ff6b6b;letter-spacing:.08em;text-transform:uppercase;">Return Request Not Approved</div>
      <div style="font-size:13px;color:#8a6060;margin-top:8px;">Order #${orderRef}</div>
    </div>
    ${rejectionReason ? `<div style="background:#111;border:1px solid #333;border-left:3px solid #ff6b6b;border-radius:4px;padding:14px 20px;margin-bottom:20px;">
      <div style="font-size:10px;letter-spacing:.15em;color:#ff6b6b;font-weight:700;text-transform:uppercase;margin-bottom:8px;">Reason</div>
      <div style="font-size:13px;color:#ddd;line-height:1.6;">${rejectionReason}</div>
    </div>` : ""}
    <div style="background:#111;border:1px solid #222;border-radius:8px;padding:16px 20px;margin-bottom:20px;font-size:13px;color:#aaa;line-height:1.7;">
      If you believe this decision is incorrect or would like to discuss further, please reply to this email or contact us through the website — we are happy to help.
    </div>
    <div style="background:#0a0f06;border-top:2px solid #c8ff00;padding:14px 24px;text-align:center;">
      <a href="https://swindon-airsoft.com" style="font-size:11px;color:#c8ff00;letter-spacing:.2em;text-transform:uppercase;text-decoration:none;font-family:Arial,sans-serif;font-weight:700;">swindon-airsoft.com</a>
      <div style="font-size:10px;color:#3a5010;margin-top:4px;letter-spacing:.1em;">© 2026 Swindon Airsoft. All rights reserved.</div>
    </div>
  </div>`;
  await sendEmail({
    toEmail,
    toName: toName || "Customer",
    subject: approved
      ? `Return Approved — Order #${orderRef}`
      : `Return Request Update — Order #${orderRef}`,
    htmlContent,
  });
}



// ── Admin: UKARA Application Notification ────────────────────
async function sendAdminUkaraNotification({ adminEmail, user }) {
  if (!adminEmail) return;
  const htmlContent = `<div style="background:#0a0a0a;font-family:'Arial',sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#0d1300;border:1px solid #1a2808;border-radius:4px;overflow:hidden;">
      <div style="background:#0a0f06;padding:16px 24px;border-bottom:1px solid #1a2808;">
        <img src="https://bnlndgjbcthxyodgstaa.supabase.co/storage/v1/object/public/email-templates/logo_transparent.png" alt="Swindon Airsoft" width="200" style="display:block;margin:0 auto 12px;height:auto;" />
        <div style="font-size:9px;letter-spacing:.3em;color:#3a5010;text-transform:uppercase;margin-bottom:4px;">Swindon Airsoft · Admin Alert</div>
        <div style="font-size:22px;font-weight:900;color:#ce93d8;letter-spacing:.04em;">&#128737; UKARA APPLICATION</div>
      </div>
      <div style="padding:20px 24px;">
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
          <tr><td style="padding:7px 12px;border:1px solid #1a2808;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:.1em;width:30%;">Name</td><td style="padding:7px 12px;border:1px solid #1a2808;color:#fff;font-size:13px;">${user.name || user.full_name || "—"}</td></tr>
          <tr><td style="padding:7px 12px;border:1px solid #1a2808;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:.1em;">Email</td><td style="padding:7px 12px;border:1px solid #1a2808;color:#4fc3f7;font-size:13px;">${user.email || "—"}</td></tr>
          <tr><td style="padding:7px 12px;border:1px solid #1a2808;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:.1em;">User ID</td><td style="padding:7px 12px;border:1px solid #1a2808;color:#c8ff00;font-size:13px;font-family:monospace;">${(user.id || "").slice(0,8).toUpperCase()}</td></tr>
          <tr><td style="padding:7px 12px;border:1px solid #1a2808;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:.1em;">Game Days</td><td style="padding:7px 12px;border:1px solid #1a2808;color:#c8ff00;font-size:13px;font-weight:900;">${user.game_days ?? user.gameDays ?? "—"}</td></tr>
          ${user.ukara_notes ? `<tr><td style="padding:7px 12px;border:1px solid #1a2808;color:#666;font-size:11px;text-transform:uppercase;letter-spacing:.1em;">Notes</td><td style="padding:7px 12px;border:1px solid #1a2808;color:#ccc;font-size:13px;">${user.ukara_notes}</td></tr>` : ""}
        </table>
        <div style="background:#1a1500;border:1px solid #332800;border-radius:4px;padding:12px 16px;font-size:12px;color:#8a7040;line-height:1.6;">
          Log in to the admin panel &#8594; Members to approve or reject this UKARA application.
        </div>
      </div>
      <div style="background:#0a0f06;border-top:2px solid #c8ff00;padding:12px 24px;text-align:center;">
        <a href="https://swindon-airsoft.com" style="font-size:11px;color:#c8ff00;letter-spacing:.2em;text-transform:uppercase;text-decoration:none;font-family:Arial,sans-serif;font-weight:700;">swindon-airsoft.com</a>
        <div style="font-size:9px;color:#3a5010;letter-spacing:.15em;text-transform:uppercase;margin-top:3px;">Admin · Auto-generated notification</div>
      </div>
    </div>
  </div>`;
  await sendEmail({ toEmail: adminEmail, toName: "Swindon Airsoft Admin", subject: `UKARA Application: ${user.name || user.full_name || user.email}`, htmlContent });
}

// ── Customer: UKARA Decision Email ───────────────────────────
async function sendUkaraDecisionEmail({ toEmail, toName, approved, rejectionReason }) {
  const htmlContent = approved ? `
  <div style="max-width:600px;margin:0 auto;background:#080e04;font-family:Arial,sans-serif;color:#e8f0d8;line-height:1;">
    <div style="height:3px;background:linear-gradient(90deg,#c8ff00,#8aaa60);"></div>
    <div style="background:#0d0d0d;padding:16px 24px;text-align:center;border-left:1px solid #1a2808;border-right:1px solid #1a2808;">
      <img src="https://bnlndgjbcthxyodgstaa.supabase.co/storage/v1/object/public/email-templates/logo_transparent.png" alt="Swindon Airsoft" width="180" style="display:block;margin:0 auto 10px;height:auto;" />
      <div style="font-size:9px;letter-spacing:.35em;color:#3a5010;text-transform:uppercase;font-weight:700;">&#128737; UKARA REGISTRATION</div>
    </div>
    <div style="background:#0a1005;border:1px solid #1a2808;border-top:none;padding:24px;">
      <div style="background:#0d1f0a;border:1px solid #c8ff00;padding:20px 24px;margin-bottom:20px;text-align:center;">
        <div style="font-size:32px;margin-bottom:8px;">&#10003;</div>
        <div style="font-size:22px;font-weight:900;color:#c8ff00;letter-spacing:.08em;text-transform:uppercase;">UKARA Application Approved</div>
        <div style="font-size:13px;color:#8aaa60;margin-top:8px;">Your registration has been confirmed</div>
      </div>
      <p style="font-size:14px;color:#8aaa60;line-height:1.8;margin:0 0 20px;">Hi ${toName || "Operative"},</p>
      <p style="font-size:14px;color:#8aaa60;line-height:1.8;margin:0 0 20px;">
        Congratulations &mdash; your UKARA registration is now <strong style="color:#c8ff00;">active</strong>.
        This gives you a legal defence for purchasing Realistic Imitation Firearms (RIFs) as a registered skirmisher.
        Your registration details have been updated on your account.
      </p>
      <div style="background:#060d02;border:1px solid #1a2808;border-left:3px solid #c8ff00;padding:16px 20px;margin-bottom:20px;">
        <div style="font-size:8px;letter-spacing:.25em;color:#3a5010;text-transform:uppercase;font-weight:700;margin-bottom:10px;">MAINTAINING YOUR REGISTRATION</div>
        <p style="font-size:13px;color:#8aaa60;line-height:1.8;margin:0 0 10px;">
          To remain eligible for UKARA you must have played at least
          <strong style="color:#c8ff00;">3 game days at Swindon Airsoft within the past year</strong>.
          If you drop below this threshold your registration may be reviewed.
        </p>
        <p style="font-size:12px;color:#4a6820;line-height:1.7;margin:0;">
          &#9654; UKARA is valid for 12 months &mdash; renew annually (£5/yr) to keep your defence active.<br>
          &#9654; Questions? Reply to this email or contact us through the website.
        </p>
      </div>
      <div style="text-align:center;">
        <a href="https://swindon-airsoft.com/#events" style="display:inline-block;background:#c8ff00;color:#0a0a0a;font-size:13px;font-weight:900;letter-spacing:.15em;text-transform:uppercase;padding:14px 36px;text-decoration:none;">BOOK YOUR NEXT GAME &rarr;</a>
      </div>
    </div>
    <div style="background:#0a0f06;border-top:2px solid #c8ff00;padding:14px 24px;text-align:center;border-left:1px solid #1a2808;border-right:1px solid #1a2808;">
      <a href="https://swindon-airsoft.com" style="font-size:11px;color:#c8ff00;letter-spacing:.25em;text-transform:uppercase;text-decoration:none;font-weight:700;font-family:Arial,sans-serif;">swindon-airsoft.com</a>
      <div style="font-size:10px;color:#2a3a10;margin-top:5px;letter-spacing:.1em;">&copy; 2026 Swindon Airsoft. All rights reserved.</div>
    </div>
    <div style="height:3px;background:linear-gradient(90deg,#1a2808,#c8ff00,#1a2808);"></div>
  </div>` : `
  <div style="max-width:600px;margin:0 auto;background:#080e04;font-family:Arial,sans-serif;color:#e8f0d8;line-height:1;">
    <div style="height:3px;background:linear-gradient(90deg,#c8ff00,#8aaa60);"></div>
    <div style="background:#0d0d0d;padding:16px 24px;text-align:center;border-left:1px solid #1a2808;border-right:1px solid #1a2808;">
      <img src="https://bnlndgjbcthxyodgstaa.supabase.co/storage/v1/object/public/email-templates/logo_transparent.png" alt="Swindon Airsoft" width="180" style="display:block;margin:0 auto 10px;height:auto;" />
      <div style="font-size:9px;letter-spacing:.35em;color:#3a5010;text-transform:uppercase;font-weight:700;">&#128737; UKARA UPDATE</div>
    </div>
    <div style="background:#0a1005;border:1px solid #1a2808;border-top:none;padding:24px;">
      <div style="background:#1a0808;border:1px solid #3a1010;padding:20px 24px;margin-bottom:20px;text-align:center;">
        <div style="font-size:32px;margin-bottom:8px;">&#10007;</div>
        <div style="font-size:22px;font-weight:900;color:#ff6b6b;letter-spacing:.08em;text-transform:uppercase;">Application Not Approved</div>
        <div style="font-size:13px;color:#8a6060;margin-top:8px;">Your UKARA application could not be processed at this time</div>
      </div>
      ${rejectionReason ? `<div style="background:#111;border:1px solid #1a2808;border-left:3px solid #ff6b6b;padding:14px 20px;margin-bottom:20px;">
        <div style="font-size:10px;letter-spacing:.15em;color:#ff6b6b;font-weight:700;text-transform:uppercase;margin-bottom:8px;">Reason</div>
        <div style="font-size:13px;color:#ddd;line-height:1.6;">${rejectionReason}</div>
      </div>` : ""}
      <div style="background:#111;border:1px solid #1a2808;padding:16px 20px;margin-bottom:20px;font-size:13px;color:#8aaa60;line-height:1.8;">
        If you believe this is an error or would like to discuss your application, please reply to this email or
        <a href="https://swindon-airsoft.com/#contact" style="color:#c8ff00;">contact us through the website</a> &mdash; we are happy to help.
      </div>
    </div>
    <div style="background:#0a0f06;border-top:2px solid #c8ff00;padding:14px 24px;text-align:center;border-left:1px solid #1a2808;border-right:1px solid #1a2808;">
      <a href="https://swindon-airsoft.com" style="font-size:11px;color:#c8ff00;letter-spacing:.25em;text-transform:uppercase;text-decoration:none;font-weight:700;font-family:Arial,sans-serif;">swindon-airsoft.com</a>
      <div style="font-size:10px;color:#2a3a10;margin-top:5px;letter-spacing:.1em;">&copy; 2026 Swindon Airsoft. All rights reserved.</div>
    </div>
    <div style="height:3px;background:linear-gradient(90deg,#1a2808,#c8ff00,#1a2808);"></div>
  </div>`;
  await sendEmail({
    toEmail,
    toName: toName || "Customer",
    subject: approved ? "UKARA Application Approved — Swindon Airsoft" : "UKARA Application Update — Swindon Airsoft",
    htmlContent,
  });
}

// ── Customer: UKARA Revoked Email ─────────────────────────────
async function sendUkaraRevokedEmail({ toEmail, toName, reason }) {
  const htmlContent = `
  <div style="max-width:600px;margin:0 auto;background:#080e04;font-family:Arial,sans-serif;color:#e8f0d8;line-height:1;">
    <div style="height:3px;background:linear-gradient(90deg,#c8ff00,#8aaa60);"></div>
    <div style="background:#0d0d0d;padding:16px 24px;text-align:center;border-left:1px solid #1a2808;border-right:1px solid #1a2808;">
      <img src="https://bnlndgjbcthxyodgstaa.supabase.co/storage/v1/object/public/email-templates/logo_transparent.png" alt="Swindon Airsoft" width="180" style="display:block;margin:0 auto 10px;height:auto;" />
      <div style="font-size:9px;letter-spacing:.35em;color:#3a5010;text-transform:uppercase;font-weight:700;">&#128737; UKARA REGISTRATION</div>
    </div>
    <div style="background:#0a1005;border:1px solid #1a2808;border-top:none;padding:24px;">
      <div style="background:#1a0808;border:1px solid #3a1010;padding:20px 24px;margin-bottom:20px;text-align:center;">
        <div style="font-size:32px;margin-bottom:8px;">&#9888;</div>
        <div style="font-size:22px;font-weight:900;color:#ff6b6b;letter-spacing:.08em;text-transform:uppercase;">UKARA Registration Revoked</div>
        <div style="font-size:13px;color:#8a6060;margin-top:8px;">Your UKARA registration has been removed from your account</div>
      </div>
      <p style="font-size:14px;color:#8aaa60;line-height:1.8;margin:0 0 20px;">Hi ${toName || "Operative"},</p>
      <p style="font-size:14px;color:#8aaa60;line-height:1.8;margin:0 0 20px;">
        We are writing to let you know that your UKARA registration with Swindon Airsoft has been revoked.
        Your UKARA ID has been removed from your account and you will no longer be able to use Swindon Airsoft as your registered site for RIF purchases.
      </p>
      ${reason ? `<div style="background:#111;border:1px solid #1a2808;border-left:3px solid #ff6b6b;padding:14px 20px;margin-bottom:20px;">
        <div style="font-size:10px;letter-spacing:.15em;color:#ff6b6b;font-weight:700;text-transform:uppercase;margin-bottom:8px;">Reason</div>
        <div style="font-size:13px;color:#ddd;line-height:1.6;">${reason}</div>
      </div>` : ""}
      <div style="background:#060d02;border:1px solid #1a2808;border-left:3px solid #c8ff00;padding:16px 20px;margin-bottom:20px;">
        <div style="font-size:8px;letter-spacing:.25em;color:#3a5010;text-transform:uppercase;font-weight:700;margin-bottom:10px;">ELIGIBILITY REQUIREMENTS</div>
        <p style="font-size:13px;color:#8aaa60;line-height:1.8;margin:0;">
          To hold an active UKARA registration with Swindon Airsoft you must have played at least
          <strong style="color:#c8ff00;">3 game days at Swindon Airsoft within the past year</strong>.
          If you believe your registration has been revoked in error, please get in touch.
        </p>
      </div>
      <div style="background:#111;border:1px solid #1a2808;padding:16px 20px;margin-bottom:20px;font-size:13px;color:#8aaa60;line-height:1.8;">
        If you have any questions or would like to re-apply once you meet the eligibility criteria,
        please reply to this email or <a href="https://swindon-airsoft.com/#contact" style="color:#c8ff00;">contact us through the website</a>.
      </div>
      <div style="text-align:center;">
        <a href="https://swindon-airsoft.com/#events" style="display:inline-block;background:#c8ff00;color:#0a0a0a;font-size:13px;font-weight:900;letter-spacing:.15em;text-transform:uppercase;padding:14px 36px;text-decoration:none;">BOOK A GAME DAY &rarr;</a>
      </div>
    </div>
    <div style="background:#0a0f06;border-top:2px solid #c8ff00;padding:14px 24px;text-align:center;border-left:1px solid #1a2808;border-right:1px solid #1a2808;">
      <a href="https://swindon-airsoft.com" style="font-size:11px;color:#c8ff00;letter-spacing:.25em;text-transform:uppercase;text-decoration:none;font-weight:700;font-family:Arial,sans-serif;">swindon-airsoft.com</a>
      <div style="font-size:10px;color:#2a3a10;margin-top:5px;letter-spacing:.1em;">&copy; 2026 Swindon Airsoft. All rights reserved.</div>
    </div>
    <div style="height:3px;background:linear-gradient(90deg,#1a2808,#c8ff00,#1a2808);"></div>
  </div>`;
  await sendEmail({
    toEmail,
    toName: toName || "Customer",
    subject: "UKARA Registration Revoked — Swindon Airsoft",
    htmlContent,
  });
}

// ─────────────────────────────────────────────────────────────
// Rank & Designation insignia — shared by App.jsx + AdminPanel

export {
  EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, EMAILJS_PUBLIC_KEY,
  sendEmail,
  sendTicketEmail, sendEventReminderEmail, sendWaitlistNotifyEmail,
  sendCancellationEmail, sendWelcomeEmail,
  sendOrderEmail, sendDispatchEmail, sendNewEventEmail,
  sendAdminBookingNotification, sendAdminOrderNotification,
  sendAdminReturnNotification, sendReturnDecisionEmail,
  sendAdminUkaraNotification, sendUkaraDecisionEmail, sendUkaraRevokedEmail,
};
