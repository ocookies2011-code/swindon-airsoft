import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "../supabaseClient";
import * as api from "../api";
import { normaliseProfile, squareRefund, waitlistApi, holdApi } from "../api";
import {
  renderMd, stockLabel, fmtErr,
  gmtNow, gmtDate, gmtShort, fmtDate, uid,
  CSS,
  loadSquareConfig, SquareCheckoutButton,
  TRACKING_CACHE_KEY, TRACKING_TTL_MS, TRACKING_TTL_SHORT_MS,
  detectCourier, TrackingBlock,
  useData,
  SkeletonCard, Toast, useMobile, useToast,
  GmtClock, Countdown, QRCode, QRScanner,
  SupabaseAuthModal, WaiverModal, PublicNav,
  sendEmail, sendOrderEmail, sendDispatchEmail,
  sendAdminOrderNotification, sendAdminBookingNotification,
  sendWelcomeEmail, sendTicketEmail, sendCancellationEmail,
  sendWaitlistNotifyEmail, sendAdminReturnNotification, sendAdminUkaraNotification, sendUkaraDecisionEmail,
  HomePage, CountdownPanel,
} from "../utils";
import { AdminPanel, AboutPage, StaffPage, ContactPage, PlayerWaitlist, TermsPage } from "../index";

export function ProductReviews({ item, cu }) {
  const [reviews, setReviews]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [myReview, setMyReview]     = useState(null);
  const [hasPurchased, setHasPurchased] = useState(false);
  const [editing, setEditing]       = useState(false);
  const [draftRating, setDraftRating] = useState(5);
  const [draftBody, setDraftBody]   = useState("");
  const [saving, setSaving]         = useState(false);
  const [deleting, setDeleting]     = useState(false);
  const [error, setError]           = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("product_reviews")
        .select("*")
        .eq("product_id", item.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setReviews(data || []);
      if (cu) {
        const mine = (data || []).find(r => r.user_id === cu.id);
        setMyReview(mine || null);
        if (mine) { setDraftRating(mine.rating); setDraftBody(mine.body); }

        // Check if this user has a confirmed (dispatched/completed) order containing this product
        const { data: orders } = await supabase
          .from("shop_orders")
          .select("items, status")
          .eq("user_id", cu.id)
          .in("status", ["dispatched", "completed", "processing"]);
        const purchased = (orders || []).some(order =>
          (order.items || []).some(i => i.id === item.id || i.productId === item.id)
        );
        setHasPurchased(purchased);
      }
    } catch {}
    finally { setLoading(false); }
  }, [item.id, cu]);

  useEffect(() => { load(); }, [load]);

  const avg = reviews.length ? (reviews.reduce((s,r) => s + r.rating, 0) / reviews.length) : 0;

  const Stars = ({ rating, size = 14, interactive = false, onSet }) => (
    <div style={{ display:"flex", gap:2 }}>
      {[1,2,3,4,5].map(n => (
        <span key={n}
          style={{ fontSize:size, color: n <= rating ? "#c8a000" : "#2a3a10", cursor: interactive ? "pointer" : "default", lineHeight:1 }}
          onClick={() => interactive && onSet && onSet(n)}
        >★</span>
      ))}
    </div>
  );

  const saveReview = async () => {
    if (!cu) return;
    if (!draftBody.trim()) { setError("Please write something before submitting."); return; }
    setSaving(true); setError("");
    try {
      if (myReview) {
        const { error } = await supabase.from("product_reviews")
          .update({ rating: draftRating, body: draftBody.trim() })
          .eq("id", myReview.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("product_reviews").insert({
          product_id: item.id,
          user_id:    cu.id,
          user_name:  cu.name || "Operative",
          rating:     draftRating,
          body:       draftBody.trim(),
        });
        if (error) throw error;
      }
      setEditing(false);
      await load();
    } catch (e) { setError(e.message || "Save failed."); }
    finally { setSaving(false); }
  };

  const deleteReview = async () => {
    if (!myReview) return;
    setDeleting(true);
    try {
      await supabase.from("product_reviews").delete().eq("id", myReview.id);
      setMyReview(null); setDraftBody(""); setDraftRating(5);
      await load();
    } catch {}
    finally { setDeleting(false); }
  };

  const SectionHead = () => (
    <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
      <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".3em", color:"#3a5010" }}>◈ —</div>
      <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:18, letterSpacing:".15em", textTransform:"uppercase", color:"#e8f0d8" }}>
        FIELD <span style={{ color:"#c8ff00" }}>REPORTS</span>
      </div>
      <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".3em", color:"#3a5010" }}>— ◈</div>
      {reviews.length > 0 && (
        <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:8 }}>
          <Stars rating={Math.round(avg)} />
          <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:16, color:"#c8a000" }}>{avg.toFixed(1)}</span>
          <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:"#3a5010", letterSpacing:".1em" }}>({reviews.length})</span>
        </div>
      )}
    </div>
  );

  return (
    <div style={{ maxWidth:1100, margin:"0 auto", padding:"0 16px 60px" }}>
      <div style={{ borderTop:"1px solid #1a2808", paddingTop:32 }}>
        <SectionHead />

        {/* Write / edit review */}
        {cu && !myReview && !editing && hasPurchased && (
          <button
            onClick={() => setEditing(true)}
            style={{ background:"transparent", border:"1px solid #2a3a10", color:"#5a7a30", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:11, letterSpacing:".18em", padding:"8px 18px", cursor:"pointer", marginBottom:24, transition:"border-color .15s, color .15s" }}
            onMouseEnter={e=>{e.currentTarget.style.borderColor="#c8ff00";e.currentTarget.style.color="#c8ff00";}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor="#2a3a10";e.currentTarget.style.color="#5a7a30";}}
          >◈ SUBMIT FIELD REPORT</button>
        )}
        {cu && !myReview && !editing && !hasPurchased && (
          <div style={{ background:"#0c1009", border:"1px solid #1a2808", borderLeft:"3px solid #2a3a10", padding:"10px 16px", marginBottom:20, fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#3a5010", letterSpacing:".1em" }}>
            ◈ PURCHASE REQUIRED — Only players who have ordered this item can submit a field report.
          </div>
        )}
        {cu && myReview && !editing && (
          <div style={{ background:"#0c1009", border:"1px solid #2a3a10", borderLeft:"3px solid #c8a000", padding:"12px 16px", marginBottom:20, display:"flex", justifyContent:"space-between", alignItems:"center", gap:12, flexWrap:"wrap" }}>
            <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#5a7a30", letterSpacing:".1em" }}>YOU ALREADY SUBMITTED A REPORT</div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => setEditing(true)} style={{ background:"transparent", border:"1px solid #2a3a10", color:"#5a7a30", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:10, letterSpacing:".12em", padding:"5px 12px", cursor:"pointer" }}>EDIT</button>
              <button onClick={deleteReview} disabled={deleting} style={{ background:"transparent", border:"1px solid #3a1a1a", color:"#6b3333", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:10, letterSpacing:".12em", padding:"5px 12px", cursor:"pointer" }}>{deleting ? "…" : "DELETE"}</button>
            </div>
          </div>
        )}
        {(editing) && (
          <div style={{ background:"#0c1009", border:"1px solid #2a3a10", padding:"18px", marginBottom:24 }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:11, letterSpacing:".22em", color:"#c8ff00", marginBottom:14 }}>⬡ {myReview ? "EDIT" : "SUBMIT"} FIELD REPORT</div>
            <div style={{ marginBottom:12 }}>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:"#3a5010", letterSpacing:".15em", marginBottom:6 }}>RATING</div>
              <Stars rating={draftRating} size={22} interactive onSet={setDraftRating} />
            </div>
            <div style={{ marginBottom:12 }}>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:"#3a5010", letterSpacing:".15em", marginBottom:6 }}>REPORT</div>
              <textarea
                value={draftBody}
                onChange={e => setDraftBody(e.target.value)}
                maxLength={600}
                rows={4}
                placeholder="Share your experience with this item..."
                style={{ width:"100%", background:"#080a06", border:"1px solid #2a3a10", color:"#8aaa50", fontFamily:"'Share Tech Mono',monospace", fontSize:11, padding:"10px 12px", resize:"vertical", outline:"none", letterSpacing:".05em", lineHeight:1.6 }}
              />
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, color:"#2a3a10", letterSpacing:".1em", marginTop:3, textAlign:"right" }}>{draftBody.length}/600</div>
            </div>
            {error && <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#ef4444", letterSpacing:".1em", marginBottom:10 }}>⚠ {error}</div>}
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={saveReview} disabled={saving}
                style={{ background:"#c8ff00", color:"#000", border:"none", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:11, letterSpacing:".2em", padding:"8px 20px", cursor:"pointer" }}>
                {saving ? "SAVING…" : "SUBMIT REPORT"}
              </button>
              <button onClick={() => { setEditing(false); setError(""); if (myReview) { setDraftRating(myReview.rating); setDraftBody(myReview.body); } }}
                style={{ background:"transparent", border:"1px solid #2a3a10", color:"#5a7a30", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:11, letterSpacing:".15em", padding:"8px 14px", cursor:"pointer" }}>
                CANCEL
              </button>
            </div>
          </div>
        )}

        {loading && <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#2a3a10", letterSpacing:".2em", padding:"20px 0" }}>RETRIEVING FIELD REPORTS…</div>}

        {!loading && reviews.length === 0 && (
          <div style={{ background:"#0c1009", border:"1px solid #1a2808", padding:"32px 24px", textAlign:"center" }}>
            <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:14, letterSpacing:".2em", color:"#2a3a10", textTransform:"uppercase", marginBottom:6 }}>NO FIELD REPORTS YET</div>
            <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#1a2808", letterSpacing:".12em" }}>Be the first to submit a report on this item.</div>
          </div>
        )}

        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {reviews.map(r => (
            <div key={r.id} style={{ background:"#0c1009", border:`1px solid ${r.user_id === cu?.id ? "#2a3a10" : "#1a2808"}`, padding:"14px 16px", position:"relative" }}>
              {r.user_id === cu?.id && <div style={{ position:"absolute", top:10, right:12, fontFamily:"'Share Tech Mono',monospace", fontSize:8, color:"#c8a000", letterSpacing:".12em" }}>YOUR REPORT</div>}
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8, flexWrap:"wrap" }}>
                <Stars rating={r.rating} size={13} />
                <span style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:12, letterSpacing:".1em", color:"#8aaa50", textTransform:"uppercase" }}>{r.user_name}</span>
                <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, color:"#2a3a10", background:"rgba(200,255,0,.06)", border:"1px solid #1a2808", padding:"1px 6px", letterSpacing:".1em" }}>✓ VERIFIED PURCHASE</span>
                <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:8, color:"#2a3a10", letterSpacing:".1em", marginLeft:"auto" }}>
                  {new Date(r.created_at).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"})}
                </span>
              </div>
              <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color:"#5a7a30", lineHeight:1.7, letterSpacing:".04em" }}>{r.body}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Product Page ──────────────────────────────────────────
