// PlayerLink — clickable player name. Context-aware via onNameClick.
//
// Usage:
//   <PlayerLink id={userId} name={userName} onNameClick={onNameClick} />
//
// onNameClick is whatever makes sense for the current page:
//   - Bookings:  () => setViewBooking(b)
//   - Players:   () => setViewPlayer(u)
//   - Revenue:   () => setSelected(t)
//   - Admin (generic): () => goToPlayer(id)  ← public profile
//   - Not provided: renders as plain text

export function PlayerLink({ id, name, onNameClick, style = {} }) {
  if (!name) return <span style={{ color: "var(--muted)", ...style }}>—</span>;
  if (!onNameClick) return <span style={style}>{name}</span>;

  return (
    <button
      onClick={e => { e.stopPropagation(); onNameClick(); }}
      style={{
        background: "none",
        border: "none",
        padding: 0,
        margin: 0,
        color: "var(--accent)",
        fontWeight: "inherit",
        fontSize: "inherit",
        fontFamily: "inherit",
        cursor: "pointer",
        textDecoration: "underline",
        textDecorationColor: "rgba(176,192,144,.4)",
        textUnderlineOffset: 3,
        ...style,
      }}
    >
      {name}
    </button>
  );
}
