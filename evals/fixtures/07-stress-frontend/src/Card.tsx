// Frontend agent-risk stress fixture:
// - hex / rgb literals in style instead of design tokens
//   → should fire design_token_escape (≥5 hard-coded style values)
// - fixed pixel widths / heights instead of responsive sizes
//   → should fire responsive_fragility (≥3 fixed-size values)
// - <div onClick> without role/tabIndex
//   → should fire accessible_interaction_risk
export function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: 800,
        height: 600,
        maxWidth: 1024,
        padding: 24,
        background: "#ff00aa",
        color: "#0a0a0a",
        borderColor: "#cccccc",
        boxShadow: "0 2px 4px rgb(0, 0, 0)",
        outlineColor: "#1a73e8",
      }}
      onClick={() => console.log("clicked")}
    >
      <div style={{ width: 720, fontSize: 18, color: "#333333" }}>
        {children}
      </div>
      <div style={{ width: 240, fontSize: 14, color: "#666666" }}>
        sidebar
      </div>
    </div>
  );
}
