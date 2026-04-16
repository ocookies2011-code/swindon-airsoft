// index.js — Re-exports everything that the original AdminPanel.jsx exported.
// External code that imports from "AdminPanel" should now point here instead.

export { default as AdminPanel }   from "./AdminPanel";
export { StaffPage }               from "./AdminStaff";
export { ContactPage }             from "./AdminContact";
export { AboutPage, PlayerWaitlist } from "./PublicPages";
export { default as TermsPage }    from "./PublicPages";
