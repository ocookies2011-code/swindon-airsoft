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

// ─── Shared rank & designation insignia — used in PublicProfilePage + AdminPlayers ───

export function RankInsignia({ rank, size = 56 }) {
  const s = size; const c = "#c8ff00"; const dim = "#1e3008"; const gold = "#c8a000"; const cx = s / 2; const cy = s / 2;

  // British Army style: OR ranks use chevrons (point-up), NCO/Officer use pips, top rank uses crown+pips
  const Chevron = ({ y }) => (
    <polyline points={`${s*.12},${y + s*.14} ${cx},${y} ${s*.88},${y + s*.14}`}
      fill="none" stroke={c} strokeWidth={s * .04} strokeLinecap="round" strokeLinejoin="round"/>
  );
  const Pip = ({ px, py, filled = false }) => (
    <g>
      <polygon points={`${px},${py - s*.13} ${px + s*.12},${py - s*.04} ${px + s*.08},${py + s*.1} ${px - s*.08},${py + s*.1} ${px - s*.12},${py - s*.04}`}
        fill={filled ? gold : "none"} stroke={gold} strokeWidth={s * .03}/>
    </g>
  );
  const Crown = ({ px, py }) => {
    const w = s * .32; const h = s * .2;
    return (
      <g fill="none" stroke={gold} strokeWidth={s * .035} strokeLinejoin="round">
        <polyline points={`${px - w},${py + h*.4} ${px - w},${py - h*.3} ${px - w*.5},${py + h*.05} ${px},${py - h*.6} ${px + w*.5},${py + h*.05} ${px + w},${py - h*.3} ${px + w},${py + h*.4}`}/>
        <line x1={px - w} y1={py + h*.4} x2={px + w} y2={py + h*.4}/>
        <circle cx={px} cy={py - h*.6} r={s*.04} fill={gold}/>
        <circle cx={px - w*.5} cy={py - h*.05} r={s*.03} fill={gold}/>
        <circle cx={px + w*.5} cy={py - h*.05} r={s*.03} fill={gold}/>
      </g>
    );
  };
  // Beret — used for Private and Recruit (no official British Army insignia yet)
  const Beret = ({ col = c }) => {
    const bw = s * .7; const bh = s * .32; const bx = cx - bw/2; const by = cy - bh * .3;
    return (
      <g>
        {/* Beret dome */}
        <ellipse cx={cx} cy={by} rx={bw/2} ry={bh} fill="rgba(200,255,0,.06)" stroke={col} strokeWidth={s*.03}/>
        {/* Brim band */}
        <rect x={bx} y={by + bh*.55} width={bw} height={s*.09} fill="rgba(200,255,0,.1)" stroke={col} strokeWidth={s*.025} rx={s*.01}/>
        {/* Cap badge — small diamond */}
        <polygon points={`${cx - s*.04},${by - bh*.1} ${cx},${by - bh*.38} ${cx + s*.04},${by - bh*.1} ${cx},${by + bh*.18}`} fill={col} stroke="none" opacity=".7"/>
        {/* Brim chin strap suggestion */}
        <line x1={bx + bw*.05} y1={by + bh*.64} x2={bx - s*.05} y2={by + bh*.9} stroke={col} strokeWidth={s*.02} strokeLinecap="round" opacity=".5"/>
        <line x1={bx + bw*.95} y1={by + bh*.64} x2={bx + bw + s*.05} y2={by + bh*.9} stroke={col} strokeWidth={s*.02} strokeLinecap="round" opacity=".5"/>
      </g>
    );
  };

  // British Army rank structure mapped to Swindon Airsoft ranks:
  // Civilian — dashed circle (no affiliation)
  // Private / Recruit — Beret (no earned insignia yet)
  // Operative — 3 chevrons (Sergeant)
  // Senior Operative — 3 gold pips (Captain)
  // Field Commander — Crown + 2 filled pips (Colonel)
  const gap = s * .135;
  const insig = {
    "CIVILIAN": (
      <circle cx={cx} cy={cy} r={s*.1} fill="none" stroke={dim} strokeWidth={s*.025} strokeDasharray={`${s*.05},${s*.05}`}/>
    ),
    "PRIVATE": (
      <Beret/>
    ),
    "RECRUIT": (
      <Beret col="#6ab030"/>
    ),
    "OPERATIVE": (
      <g><Chevron y={cy - gap*1.6}/><Chevron y={cy - gap*.45}/><Chevron y={cy + gap*.7}/></g>
    ),
    "SENIOR OPERATIVE": (
      <g>
        <Pip px={cx - s*.18} py={cy}/>
        <Pip px={cx}         py={cy}/>
        <Pip px={cx + s*.18} py={cy}/>
      </g>
    ),
    "FIELD COMMANDER": (
      <g>
        <Crown px={cx} py={cy - s*.12}/>
        <Pip px={cx - s*.15} py={cy + s*.2} filled/>
        <Pip px={cx + s*.15} py={cy + s*.2} filled/>
      </g>
    ),
  };

  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{ display: "block" }}>
      <rect width={s} height={s} fill="#080a06" rx={s * .04}/>
      {insig[rank] || <circle cx={cx} cy={cy} r={s*.08} fill={dim}/>}
    </svg>
  );
}

export function DesignationInsignia({ desig, size = 56 }) {
  const s = size; const c = "#4fc3f7"; const gold = "#c8a000"; const cx = s / 2; const cy = s / 2;
  const icons = {
    "GHOST":        <g stroke={c} fill="none" strokeWidth={s*.033}><ellipse cx={cx} cy={cy + s*.04} rx={s*.18} ry={s*.21}/><polyline points={`${cx - s*.18},${cy + s*.25} ${cx - s*.1},${cy + s*.18} ${cx - s*.04},${cy + s*.25} ${cx + s*.04},${cy + s*.18} ${cx + s*.1},${cy + s*.25} ${cx + s*.18},${cy + s*.18}`}/><circle cx={cx - s*.07} cy={cy - s*.02} r={s*.035} fill={c}/><circle cx={cx + s*.07} cy={cy - s*.02} r={s*.035} fill={c}/></g>,
    "SNIPER":       <g stroke={c} fill="none" strokeWidth={s*.033}><circle cx={cx} cy={cy} r={s*.18}/><line x1={cx} y1={cy - s*.28} x2={cx} y2={cy - s*.18}/><line x1={cx} y1={cy + s*.18} x2={cx} y2={cy + s*.28}/><line x1={cx - s*.28} y1={cy} x2={cx - s*.18} y2={cy}/><line x1={cx + s*.18} y1={cy} x2={cx + s*.28} y2={cy}/><circle cx={cx} cy={cy} r={s*.04} fill={c}/></g>,
    "MEDIC":        <g stroke={c} fill="rgba(79,195,247,.12)" strokeWidth={s*.038}><rect x={cx - s*.15} y={cy - s*.07} width={s*.3} height={s*.14} rx={s*.02}/><rect x={cx - s*.07} y={cy - s*.15} width={s*.14} height={s*.3} rx={s*.02}/></g>,
    "DEMOLITIONS":  <g stroke={c} fill="none" strokeWidth={s*.033}><ellipse cx={cx} cy={cy + s*.04} rx={s*.11} ry={s*.16}/><line x1={cx} y1={cy - s*.12} x2={cx} y2={cy - s*.25}/><polyline points={`${cx - s*.07},${cy - s*.25} ${cx},${cy - s*.2} ${cx + s*.07},${cy - s*.25}`}/><line x1={cx - s*.18} y1={cy + s*.04} x2={cx + s*.18} y2={cy + s*.04}/></g>,
    "RECON":        <g stroke={c} fill="none" strokeWidth={s*.033}><circle cx={cx} cy={cy} r={s*.08}/><path d={`M${cx - s*.15},${cy} Q${cx},${cy - s*.25} ${cx + s*.15},${cy}`}/><path d={`M${cx - s*.15},${cy} Q${cx},${cy + s*.25} ${cx + s*.15},${cy}`}/><line x1={cx - s*.28} y1={cy} x2={cx - s*.15} y2={cy}/><line x1={cx + s*.15} y1={cy} x2={cx + s*.28} y2={cy}/></g>,
    "HEAVY GUNNER": <g stroke={c} fill="none" strokeWidth={s*.033}><rect x={cx - s*.2} y={cy - s*.08} width={s*.32} height={s*.11} rx={s*.03}/><rect x={cx + s*.08} y={cy - s*.12} width={s*.07} height={s*.04} rx={s*.01}/><circle cx={cx - s*.14} cy={cy + s*.15} r={s*.055}/><circle cx={cx + s*.04} cy={cy + s*.15} r={s*.055}/><line x1={cx - s*.28} y1={cy - s*.02} x2={cx - s*.2} y2={cy - s*.02}/></g>,
    "SUPPORT":      <g stroke={c} fill="rgba(79,195,247,.1)" strokeWidth={s*.033}><path d={`M${cx},${cy - s*.25} L${cx + s*.22},${cy + s*.15} L${cx - s*.22},${cy + s*.15} Z`}/><line x1={cx} y1={cy - s*.12} x2={cx} y2={cy + s*.04}/><circle cx={cx} cy={cy + s*.1} r={s*.03} fill={c}/></g>,
    "SQUAD LEADER": <g stroke={c} fill="none" strokeWidth={s*.033}><polygon points={`${cx},${cy - s*.22} ${cx + s*.07},${cy - s*.07} ${cx + s*.23},${cy - s*.07} ${cx + s*.11},${cy + s*.04} ${cx + s*.16},${cy + s*.22} ${cx},${cy + s*.13} ${cx - s*.16},${cy + s*.22} ${cx - s*.11},${cy + s*.04} ${cx - s*.23},${cy - s*.07} ${cx - s*.07},${cy - s*.07}`}/></g>,
    "VETERAN":      <g strokeWidth={s*.033}><polygon points={`${cx},${cy - s*.22} ${cx + s*.07},${cy - s*.07} ${cx + s*.23},${cy - s*.07} ${cx + s*.11},${cy + s*.04} ${cx + s*.16},${cy + s*.22} ${cx},${cy + s*.13} ${cx - s*.16},${cy + s*.22} ${cx - s*.11},${cy + s*.04} ${cx - s*.23},${cy - s*.07} ${cx - s*.07},${cy - s*.07}`} fill="rgba(79,195,247,.08)" stroke={c}/><circle cx={cx} cy={cy - s*.01} r={s*.06} fill={c} stroke="none"/></g>,
    "LEGEND":       <g strokeWidth={s*.033}><polygon points={`${cx},${cy - s*.24} ${cx + s*.09},${cy - s*.07} ${cx + s*.26},${cy - s*.07} ${cx + s*.12},${cy + s*.04} ${cx + s*.18},${cy + s*.24} ${cx},${cy + s*.14} ${cx - s*.18},${cy + s*.24} ${cx - s*.12},${cy + s*.04} ${cx - s*.26},${cy - s*.07} ${cx - s*.09},${cy - s*.07}`} fill="rgba(200,160,0,.15)" stroke={gold}/><polygon points={`${cx},${cy - s*.12} ${cx + s*.04},${cy - s*.03} ${cx + s*.12},${cy - s*.03} ${cx + s*.06},${cy + s*.02} ${cx + s*.08},${cy + s*.11} ${cx},${cy + s*.06} ${cx - s*.08},${cy + s*.11} ${cx - s*.06},${cy + s*.02} ${cx - s*.12},${cy - s*.03} ${cx - s*.04},${cy - s*.03}`} fill={gold} stroke="none"/></g>,
  };
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{ display: "block" }}>
      <rect width={s} height={s} fill="#080a06" rx={s * .04}/>
      {icons[desig] || <text x={cx} y={cy + s*.07} textAnchor="middle" fontSize={s*.35} fill={c}>{desig[0]}</text>}
    </svg>
  );
}

