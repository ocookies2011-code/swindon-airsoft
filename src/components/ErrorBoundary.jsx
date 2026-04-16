import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null, errorInfo: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) {
    console.error("App error caught:", error, info);
    this.setState({ errorInfo: info });
  }
  render() {
    if (this.state.hasError) return (
      <div style={{ background:"#080a06", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
        <div style={{ maxWidth:480, width:"100%", background:"#0c1009", border:"1px solid #3a0a0a", padding:"32px 28px", position:"relative" }}>
          {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h]) => (
            <div key={v+h} style={{ position:"absolute", width:16, height:16, top:v==="top"?8:"auto", bottom:v==="bottom"?8:"auto", left:h==="left"?8:"auto", right:h==="right"?8:"auto", borderTop:v==="top"?"1px solid #ef4444":"none", borderBottom:v==="bottom"?"1px solid #ef4444":"none", borderLeft:h==="left"?"1px solid #ef4444":"none", borderRight:h==="right"?"1px solid #ef4444":"none" }} />
          ))}
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, letterSpacing:".3em", color:"#ef4444", marginBottom:12 }}>⚠ SYSTEM FAULT DETECTED</div>
          <div style={{ fontFamily:"'Barlow Condensed',sans-serif", fontWeight:900, fontSize:26, letterSpacing:".1em", color:"#e8f0d8", marginBottom:8 }}>SOMETHING WENT WRONG</div>
          <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:10, color:"#5a7a30", lineHeight:1.7, marginBottom:20 }}>An unexpected error has occurred. Your session data is safe.</div>
          {this.state.error && (
            <div style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color:"#3a3a3a", background:"#080a06", border:"1px solid #1a1a1a", padding:"8px 10px", marginBottom:20, wordBreak:"break-all", lineHeight:1.6 }}>
              {this.state.error.message}
            </div>
          )}
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            <button
              onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
              style={{ background:"rgba(200,255,0,.08)", border:"1px solid #2a3a10", color:"#c8ff00", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:12, letterSpacing:".2em", padding:"10px 24px", cursor:"pointer", width:"100%" }}>
              ↩ TRY AGAIN
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{ background:"transparent", border:"1px solid #1a2808", color:"#3a5010", fontFamily:"'Barlow Condensed',sans-serif", fontWeight:800, fontSize:12, letterSpacing:".2em", padding:"10px 24px", cursor:"pointer", width:"100%" }}>
              ↺ FULL RELOAD
            </button>
          </div>
        </div>
      </div>
    );
    return this.props.children;
  }
}
