const cornerBase: React.CSSProperties = {
  position: 'absolute',
  width: 28,
  height: 28,
  border: '0 solid var(--rule-2)',
};

export function RegistrationMarks() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 22,
        pointerEvents: 'none',
        border: '1px solid transparent',
      }}
    >
      <span
        style={{ ...cornerBase, top: 0, left: 0, borderTopWidth: 1, borderLeftWidth: 1 }}
      />
      <span
        style={{ ...cornerBase, top: 0, right: 0, borderTopWidth: 1, borderRightWidth: 1 }}
      />
      <span
        style={{ ...cornerBase, bottom: 0, left: 0, borderBottomWidth: 1, borderLeftWidth: 1 }}
      />
      <span
        style={{ ...cornerBase, bottom: 0, right: 0, borderBottomWidth: 1, borderRightWidth: 1 }}
      />
    </div>
  );
}
