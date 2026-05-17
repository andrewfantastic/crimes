// Frontend agent-risk stress fixture:
// - hex literals in style instead of tailwind classes
// - <div onClick> without role/tabIndex
// - fixed pixel width instead of responsive
export function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{ width: 800, background: "#ff00aa", color: "#0a0a0a" }}
      onClick={() => console.log("clicked")}
    >
      {children}
    </div>
  );
}
