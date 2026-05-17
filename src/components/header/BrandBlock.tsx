import styled from "styled-components";

// ── Styled components ──────────────────────────────────────────────────────

const BrandWrap = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 22px;
  border-right: 1px solid var(--rule);
`;

const LogoBox = styled.div`
  width: 26px;
  height: 26px;
  border: 1px solid var(--amber);
  color: var(--amber);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 2px;
  position: relative;
`;

const LogoInner = styled.span`
  position: absolute;
  inset: 3px;
  border: 1px solid currentColor;
  opacity: 0.5;
`;

const BrandText = styled.div``;

const BrandTitle = styled.div`
  font-family: var(--serif);
  font-size: 17px;
  font-weight: 500;
  letter-spacing: 0.02em;
`;

const BrandMriItalic = styled.em`
  font-style: italic;
  color: var(--ink-2);
  font-weight: 400;
`;

// ── BrandLogo SVG component (brand mark — kept as custom) ──────────────────

function BrandLogo() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={12}
      height={12}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path d="M12 2 2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
    </svg>
  );
}

export function BrandBlock() {
  return (
    <BrandWrap>
      <LogoBox>
        <LogoInner />
        <BrandLogo />
      </LogoBox>
      <BrandText>
        <BrandTitle>
          Prisma
          <BrandMriItalic>MRI</BrandMriItalic>
        </BrandTitle>
      </BrandText>
    </BrandWrap>
  );
}
