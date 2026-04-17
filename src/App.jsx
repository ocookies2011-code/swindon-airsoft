// App.jsx — root entry: ErrorBoundary wraps AppInner
// All routing, pages, and state live in AppInner.jsx
import AppInner from "./AppInner";
import React from "react";

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(e) { return { err: e }; }
  render() {
    if (this.state.err) return (
      <div style={{ padding: 40, textAlign: "center", fontFamily: "monospace" }}>
        <h2 style={{ color: "#ef4444" }}>Something went wrong</h2>
        <p style={{ color: "#888", marginTop: 12 }}>{this.state.err.message}</p>
        <button onClick={() => window.location.reload()} style={{ marginTop: 20, padding: "10px 24px", background: "#c8ff00", color: "#000", border: "none", fontWeight: 700, cursor: "pointer" }}>
          RELOAD
        </button>
      </div>
    );
    return this.props.children;
  }
}

export default function App() {
  return <ErrorBoundary><AppInner /></ErrorBoundary>;
}
