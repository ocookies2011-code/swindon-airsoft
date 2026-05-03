// PlayerLink — clickable player name that navigates to their public profile.
// Use anywhere a player name is displayed.
//
// Usage:
//   <PlayerLink id={userId} name={userName} goToPlayer={goToPlayer} />
//
// goToPlayer(id) is a function passed down from AppInner that sets the page
// to "player" with the given user ID.
// If goToPlayer is not provided (e.g. non-admin contexts without the prop),
// the name renders as plain text.

export function PlayerLink({ id, name, goToPlayer, style = {} }) {
  if (!name) return <span style={{ color: "var(--muted)", ...style }}>—</span>;
  if (!id || !goToPlayer) return <span style={style}>{name}</span>;

  return (
    <button
      onClick={() => goToPlayer(id)}
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
