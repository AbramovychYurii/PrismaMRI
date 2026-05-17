import styled from "styled-components";

// ── Styled components ──────────────────────────────────────────────────────

const MarksWrap = styled.div`
  position: absolute;
  inset: 22px;
  pointer-events: none;
  border: 1px solid transparent;
`;

const Corner = styled.span<{ $pos: "tl" | "tr" | "bl" | "br" }>`
  position: absolute;
  width: 28px;
  height: 28px;
  border: 0 solid var(--rule-2);

  ${({ $pos }) => {
    switch ($pos) {
      case "tl":
        return "top: 0; left: 0; border-top-width: 1px; border-left-width: 1px;";
      case "tr":
        return "top: 0; right: 0; border-top-width: 1px; border-right-width: 1px;";
      case "bl":
        return "bottom: 0; left: 0; border-bottom-width: 1px; border-left-width: 1px;";
      case "br":
        return "bottom: 0; right: 0; border-bottom-width: 1px; border-right-width: 1px;";
    }
  }}
`;

export function RegistrationMarks() {
  return (
    <MarksWrap>
      <Corner $pos="tl" />
      <Corner $pos="tr" />
      <Corner $pos="bl" />
      <Corner $pos="br" />
    </MarksWrap>
  );
}
