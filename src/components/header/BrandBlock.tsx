import styled from 'styled-components';

// ── Styled components ──────────────────────────────────────────────────────

const BrandWrap = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 22px;
  border-right: 1px solid var(--rule);
`;

const LogoBox = styled.div`
  color: var(--amber);
  display: flex;
  align-items: center;
  justify-content: center;
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
      width={18}
      height={18}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
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
