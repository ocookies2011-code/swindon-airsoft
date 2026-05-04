// admin/AdminPanel.jsx — sidebar shell + section routing
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
// Imports all admin sub-panels and re-exports public-facing pages
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
import React, { useState, useEffect } from "react";
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
import { supabase } from "../supabaseClient";
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
import * as api from "../api";
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
import { GmtClock } from "../utils";
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
import { SA_LOGO_SRC } from "../assets/logoImage";
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },

    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
import { AdminDash }               from "./AdminDash";
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
import { AdminEventsBookings }     from "./AdminEventsBookings";
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
import { AdminPlayers }            from "./AdminPlayers";
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
import { AdminOrdersInline }       from "./AdminOrders";
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
import { AdminShop }               from "./AdminShop";
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
import { AdminWaivers }            from "./AdminWaivers";
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
import { AdminScanWaiver }        from "./AdminScanWaiver";
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
import { AdminUkaraApplications }  from "./AdminUkaraApplications";
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
import { AdminDiscountCodes }      from "./AdminDiscountCodes";
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
import { AdminGiftVouchers }       from "./AdminGiftVouchers";
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
import { AdminRevenue }            from "./AdminRevenue";
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
import { AdminGallery }            from "./AdminGallery";
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
import { AdminQA }                 from "./AdminQA";
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
import { AdminStaff }              from "./AdminStaff";
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
import { AdminMarshalSchedule }    from "./AdminMarshalSchedule";
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
import { AdminContactDepts }       from "./AdminContactDepts";
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
import { AdminLeaderboard }        from "./AdminLeaderboard";
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
import { AdminMessages }           from "./AdminMessages";
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
import { AdminCash }               from "./AdminCash";
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
import { AdminSettings }           from "./AdminSettings";
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
import { AdminVisitorStats }       from "./AdminVisitorStats";
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
import { AdminAuditLog }           from "./AdminAuditLog";
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
import { AdminCheatReports }       from "./AdminCheatReports";
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
import { AdminNews }              from "./AdminNews";
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
import { EmailTestCard }           from "./EmailTestCard";
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },

    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
// Public-facing pages that live in /pages but were originally in AdminPanel.jsx
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
import { AboutPage }       from "../pages/AboutPage";
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
import { StaffPage }       from "../pages/StaffPage";
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
import { ContactPage }     from "../pages/ContactPage";
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
import { PlayerWaitlist }  from "../pages/PlayerWaitlist";
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
import { TermsPage }       from "../pages/TermsPage";
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },

    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
const SUPERADMIN_EMAIL = "c-pullen@outlook.com";
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },

    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
function AdminPanel({ data, cu, save, updateUser, updateEvent, showToast, setPage, refresh }) {
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
  const getInitialSection = () => {
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
    const parts = window.location.hash.replace("#","").split("/");
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
    const ADMIN_SECTIONS = ["dashboard","events","waivers","unsigned-waivers","scan-waiver","players","shop",
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
      "leaderboard-admin","revenue","visitor-stats","gallery-admin","qa-admin","staff-admin",
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
      "contact-admin","messages","news-admin","marshal-admin","cash","discount-codes","gift-vouchers","settings","audit-log","cheat-reports","ukara-admin"];
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
    return parts[0] === "admin" && ADMIN_SECTIONS.includes(parts[1]) ? parts[1] : "dashboard";
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
  };
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
  const [section, setSectionState] = useState(getInitialSection);
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
  const setSection = (s) => {
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
    setSectionState(s);
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
    window.location.hash = "admin/" + s;
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
  };
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },

    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
  const isMain = cu.role === "admin";
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
  const isSuperAdmin = cu.email === SUPERADMIN_EMAIL;
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },

    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
  const hasPerm = (p) => isMain || cu.permissions?.includes(p) || cu.permissions?.includes("all");
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },

    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
  const pendingWaivers = data.users.filter(u => u.waiverPending).length;
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
  const pendingVip = data.users.filter(u => u.vipApplied && u.vipStatus !== "active").length;  const deleteReqs = data.users.filter(u => u.deleteRequest).length;
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
  const [pendingOrders, setPendingOrders] = useState(0);
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
  const [pendingReports, setPendingReports] = useState(0);
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
  const [pendingUkara, setPendingUkara] = React.useState(0);
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
  const [sidebarOpen, setSidebarOpen] = useState(false);
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
  useEffect(() => {
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
    const fetchPending = () =>
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
      supabase.from("shop_orders").select("id", { count: "exact", head: true })
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
        .not("status", "in", "(completed,cancelled)")
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
        .then(({ count }) => setPendingOrders(count || 0))
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
        .catch(() => {});
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
    fetchPending();
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
    const interval = setInterval(fetchPending, 30000);
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
    const onVisible = () => { if (document.visibilityState === "visible") fetchPending(); };
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
    document.addEventListener("visibilitychange", onVisible);
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", onVisible); };
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
  }, []);
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },

    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
  useEffect(() => {
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
    const fetchReports = () => {
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
      supabase.from("cheat_reports").select("id", { count: "exact", head: true }).eq("status", "pending")
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
        .then(({ count }) => setPendingReports(count || 0))
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
        .catch(() => {});
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
    };
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
    fetchReports();
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
    const onVisible = () => { if (document.visibilityState === "visible") fetchReports(); };
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
    document.addEventListener("visibilitychange", onVisible);
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
    return () => document.removeEventListener("visibilitychange", onVisible);
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
  }, []);
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },

    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
  React.useEffect(() => {
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
    const fetch = () => supabase.from("ukara_applications").select("id", { count: "exact", head: true }).eq("status", "pending")
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
      .then(({ count }) => setPendingUkara(count || 0)).catch(() => {});
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
    fetch();
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
    const iv = setInterval(fetch, 120000);
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
    return () => clearInterval(iv);
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
  }, []);
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },

    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
  const unsigned = data.users.filter(u => u.role === "player" && !(u.waiverSigned === true && u.waiverYear === new Date().getFullYear())).length;
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
  const _now = new Date();
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
  const _activeEvts = data.events.filter(e => e.published && new Date(e.date + "T" + (e.endTime || e.time || "23:59") + ":00") > _now);
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
  const upcomingEvents = _activeEvts.length;
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
  const totalBookings  = _activeEvts.flatMap(e => e.bookings).reduce((sum, b) => sum + (b.qty || 1), 0);
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
  const checkins = data.events.flatMap(e => e.bookings).filter(b => b.checkedIn).length;
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },

    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
  const NAV = [
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
    // ── OVERVIEW ─────────────────────────────────────────
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
    { id: "dashboard",        label: "Dashboard",         icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c8ff00" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>, group: "OVERVIEW" },
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },

    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
    // ── OPERATIONS ───────────────────────────────────────
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
    { id: "events",            label: "Events & Bookings", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4fc3f7" strokeWidth="2"><rect x="3" y="4" width="18" height="17" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>, badge: totalBookings, badgeColor: "blue", group: "OPERATIONS" },
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
    { id: "players",           label: "Players",           icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#81c784" strokeWidth="2"><circle cx="9" cy="7" r="4"/><path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="16" y1="11" x2="22" y2="11"/></svg>, badge: (pendingWaivers + pendingVip + deleteReqs) || null, badgeColor: pendingWaivers > 0 ? "gold" : pendingVip > 0 ? "gold" : "", group: "OPERATIONS" },
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
    { id: "cheat-reports",     label: "Cheat Reports",    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef5350" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>, badge: pendingReports || null, badgeColor: "red", group: "OPERATIONS" },
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
    { id: "ukara-admin",       label: "UKARA",             icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ce93d8" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>, badge: pendingUkara || null, badgeColor: "purple", group: "OPERATIONS" },
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
    { id: "staff-admin",       label: "Staff",             icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#81c784" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>, group: "OPERATIONS" },
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },

    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
    // ── COMMERCE ─────────────────────────────────────────
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
    { id: "shop",              label: "Shop",              icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffb74d" strokeWidth="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>, badge: pendingOrders, badgeColor: "red", group: "COMMERCE" },
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
    { id: "discount-codes",    label: "Discount Codes",    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffd54f" strokeWidth="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>, group: "COMMERCE" },
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
    { id: "gift-vouchers",      label: "Gift Vouchers",     icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c8a000" strokeWidth="2"><rect x="2" y="9" width="20" height="13" rx="1"/><path d="M12 9V22M2 14h20M7 9c0-2.8 2.2-5 5-5s5 2.2 5 5" strokeLinecap="round"/></svg>, group: "COMMERCE" },
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },

    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
    // ── CONTENT ──────────────────────────────────────────
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
    { id: "gallery-admin",     label: "Gallery",           icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ce93d8" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>, group: "CONTENT" },
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
    { id: "qa-admin",          label: "Q&A",               icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4fc3f7" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>, group: "CONTENT" },
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
    { id: "messages",          label: "Site Messages",     icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f48fb1" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>, group: "CONTENT" },
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
    { id: "news-admin",        label: "News & Updates",   icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#80cbc4" strokeWidth="2"><path d="M4 22h16a2 2 0 002-2V4a2 2 0 00-2-2H8a2 2 0 00-2 2v16a2 2 0 01-2 2zm0 0a2 2 0 01-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8M15 18h-5M10 6h8v4h-8z"/></svg>, group: "CONTENT" },
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
    { id: "marshal-admin",     label: "Marshal Schedule",  icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="3" y="4" width="18" height="17" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14l2 2 4-4"/></svg>, group: "CONTENT" },
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
    { id: "contact-admin",     label: "Contact Depts",     icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffb74d" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>, group: "CONTENT" },
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },

    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
    // ── ANALYTICS ────────────────────────────────────────
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
    { id: "leaderboard-admin", label: "Leaderboard",       icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffd54f" strokeWidth="2"><polyline points="18 20 18 10"/><polyline points="12 20 12 4"/><polyline points="6 20 6 14"/></svg>, group: "ANALYTICS" },
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
    { id: "visitor-stats",     label: "Visitor Stats",     icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#80cbc4" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>, group: "ANALYTICS" },
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
    ...(isSuperAdmin ? [{ id: "revenue", label: "Revenue", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M14.8 9A2 2 0 0 0 13 8h-2a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4h-2a2 2 0 0 1-1.8-1M12 7v1m0 8v1"/></svg>, group: "ANALYTICS" }] : []),
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },

    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
    // ── SYSTEM ───────────────────────────────────────────
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
    { id: "settings",          label: "Settings",          icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#b0bec5" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>, group: "SYSTEM" },
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
    // { id: "cash", label: "Cash Sales", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>, group: "COMMERCE" }, // hidden — terminal sales now go to shop_orders automatically
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
    ...(isSuperAdmin ? [{ id: "audit-log", label: "Audit Log", icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef9a9a" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>, group: "SYSTEM" }] : []),
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
  ];
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },

    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },

    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
  return (
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
    <div className="admin-shell">
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
      {/* Mobile overlay */}
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
      <div className={`admin-overlay ${sidebarOpen ? "open" : ""}`} onClick={() => setSidebarOpen(false)} />
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },

    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
      {/* Sidebar */}
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
      <div className={`admin-sidebar ${sidebarOpen ? "open" : ""}`}>
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
        <div className="sb-logo">
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
          <img src={SA_LOGO_SRC} alt="Swindon Airsoft" style={{ height:40, width:"auto", objectFit:"contain", display:"block" }} />
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
          <div className="sb-time"><GmtClock /></div>
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
        </div>
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
        <div style={{ padding: "8px 8px 0" }}>
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
          {NAV.map((item, idx) => {
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
            const showGroup = item.group && (idx === 0 || NAV[idx - 1]?.group !== item.group);
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
            return (
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
              <div key={item.id}>
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
                {showGroup && <div className="sb-label" style={{ marginTop: idx > 0 ? 16 : 8 }}>{item.group}</div>}
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
                <div className={`sb-item ${section === item.id ? "active" : ""}`} onClick={() => { setSection(item.id); setSidebarOpen(false); }}>
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
                  <span className="sb-icon">{item.icon}</span>
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
                  <span>{item.label}</span>
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
                  {item.badge > 0 && <span className={`sb-badge ${item.badgeColor || ""}`}>{item.badge}</span>}
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
                </div>
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
              </div>
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
            );
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
          })}
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
          <div style={{ marginTop: 16, padding: "0 0 16px" }}>
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
            <div className="sb-label">SYSTEM</div>
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
            <div className="sb-item" onClick={() => setPage("home")}>
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
              <span className="sb-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ef9a9a" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></span><span>Exit Admin</span>
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
            </div>
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
          </div>
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
        </div>
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
      </div>
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },

    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
      {/* Main */}
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
      <div className="admin-main">
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
        <div className="admin-topbar">
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
            <button onClick={() => setSidebarOpen(v => !v)} style={{ background: sidebarOpen ? "var(--accent)" : "none", border: "1px solid var(--border)", color: sidebarOpen ? "#000" : "var(--text)", padding: "6px 12px", borderRadius: 4, fontSize: 18, lineHeight: 1, cursor: "pointer", transition: "all .15s" }}>☰</button>
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
            <div style={{ fontWeight: 800, fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
              <span style={{ color: "var(--muted)" }}>⚙ ADMIN</span>
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
              <span style={{ color: "var(--border)" }}>·</span>
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
              <span style={{ color: "var(--text)", fontFamily: "'Oswald','Barlow Condensed',sans-serif", letterSpacing: ".06em", textTransform: "uppercase" }}>{NAV.find(n => n.id === section)?.label || section}</span>
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
            </div>
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
          </div>
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
            <span className="admin-hide-mobile" style={{ fontSize: 12 }}><GmtClock /></span>
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
            <button className="btn btn-sm btn-ghost" onClick={() => setPage("home")}>← Site</button>
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
          </div>
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
        </div>
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
        <div className="admin-content">
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
          {section === "dashboard" && <AdminDash data={data} setSection={setSection} isSuperAdmin={isSuperAdmin} />}
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
          <div style={{ display: section === "events" ? "block" : "none" }}><AdminEventsBookings data={data} save={save} updateEvent={updateEvent} updateUser={updateUser} showToast={showToast} cu={cu} /></div>
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
          {section === "waivers" && <AdminWaivers data={data} updateUser={updateUser} showToast={showToast} cu={cu} />}
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
          {section === "unsigned-waivers" && <AdminWaivers data={data} updateUser={updateUser} showToast={showToast} filterUnsigned cu={cu} />}
          {section === "scan-waiver" && <AdminScanWaiver data={data} updateUser={updateUser} showToast={showToast} />}
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
          <div style={{ display: section === "players" ? "block" : "none" }}><AdminPlayers data={data} save={save} updateUser={updateUser} showToast={showToast} cu={cu} /></div>
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
          {section === "cheat-reports" && <AdminCheatReports data={data} showToast={showToast} cu={cu} />}
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
          <div style={{ display: section === "shop" ? "block" : "none" }}><AdminShop data={data} save={save} showToast={showToast} cu={cu} /></div>
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
          {section === "leaderboard-admin" && <AdminLeaderboard data={data} updateUser={updateUser} showToast={showToast} />}
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
          {section === "revenue" && isSuperAdmin && <AdminRevenue data={data} save={save} showToast={showToast} cu={cu} />}
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
          {section === "visitor-stats" && <AdminVisitorStats />}
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
          {section === "gallery-admin" && <AdminGallery data={data} save={save} showToast={showToast} />}
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
          {section === "qa-admin" && <AdminQA data={data} save={save} showToast={showToast} cu={cu} />}
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
          {section === "staff-admin" && <AdminStaff showToast={showToast} cu={cu} />}
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
          {section === "contact-admin" && <AdminContactDepts showToast={showToast} save={save} cu={cu} />}
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
          {section === "messages" && <AdminMessages data={data} save={save} showToast={showToast} cu={cu} />}
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
          {section === "news-admin" && <AdminNews showToast={showToast} cu={cu} />}
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
          {section === "marshal-admin" && <AdminMarshalSchedule data={data} cu={cu} showToast={showToast} />}
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
          {section === "cash" && <AdminCash data={data} cu={cu} showToast={showToast} />}
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
          {section === "discount-codes" && <AdminDiscountCodes data={data} showToast={showToast} cu={cu} />}
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
          {section === "gift-vouchers" && <AdminGiftVouchers showToast={showToast} cu={cu} />}
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
          {section === "settings" && <AdminSettings showToast={showToast} cu={cu} />}
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
          {section === "audit-log" && isSuperAdmin && <AdminAuditLog />}
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
          {section === "ukara-admin" && <AdminUkaraApplications showToast={showToast} cu={cu} />}
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
        </div>
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
      </div>
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
    </div>
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
  );
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
}
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },

    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
// ── Admin Dashboard ───────────────────────────────────────
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },

    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },

    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
export {
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
  AdminPanel,
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
  // Re-export public pages for AppInner compatibility
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
  AboutPage, StaffPage, ContactPage, PlayerWaitlist, TermsPage,
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
};
    { id: "scan-waiver",       label: "Scan Waiver",      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a5d6a7" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M2 20h20"/></svg>, group: "OPERATIONS" },
