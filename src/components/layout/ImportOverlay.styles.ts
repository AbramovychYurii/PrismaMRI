/**
 * Styled components for ImportOverlay — the full-screen "Drop MRI to begin"
 * landing page shown when no volume is loaded.
 *
 * Layout: ImportMain → ContentWrap → TwoColGrid [ LeftCol | DropZone ].
 */

import styled from 'styled-components';

export const ImportMain = styled.main`
  position: fixed;
  inset: 0;
  z-index: var(--z-fullscreen);
  background: var(--bg);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px 40px 24px;
  overflow: auto;

  @media (max-width: 767px) {
    justify-content: flex-start;
    padding: 24px 20px env(safe-area-inset-bottom, 24px);
  }
`;

export const ContentWrap = styled.div`
  width: 1080px;
  max-width: 100%;
`;

export const TwoColGrid = styled.div`
  display: grid;
  grid-template-columns: 1.3fr 1fr;
  gap: 40px;
  align-items: center;

  @media (max-width: 767px) {
    grid-template-columns: 1fr;
    gap: 28px;
  }
`;

export const LeftCol = styled.div`
  @media (max-width: 767px) {
    border-left: none;
    padding-left: 0;
    padding-top: 24px;
  }
`;

// Subtle author link pinned to the viewport's bottom-left corner.
export const GithubLink = styled.a`
  position: fixed;
  right: 20px;
  bottom: 18px;
  z-index: 5;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  color: var(--ink-3);
  border: 1px solid transparent;
  transition: color 150ms, border-color 150ms, background 150ms;

  &:hover {
    color: var(--ink);
    border-color: var(--rule-2);
    background: var(--panel);
  }
  &:focus-visible {
    outline: none;
    color: var(--ink);
    box-shadow: 0 0 0 2px rgba(196, 153, 70, 0.4);
  }

  @media (max-width: 767px) {
    left: 12px;
    bottom: calc(env(safe-area-inset-bottom, 0px) + 12px);
  }
`;

export const TagLine = styled.div`
  font-family: var(--mono);
  font-size: 14px;
  color: var(--amber);
  letter-spacing: 0.2em;
  text-transform: uppercase;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
`;

export const TagRule = styled.span`
  flex: 1;
  height: 1px;
  background: var(--rule);
  max-width: 60px;
`;

export const MainTitle = styled.h1`
  font-family: var(--serif);
  font-size: 44px;
  line-height: 1.05;
  font-weight: 400;
  letter-spacing: -0.01em;
  margin: 0 0 10px;

  @media (max-width: 767px) {
    font-size: 28px;
  }
`;

export const TitleAccent = styled.em`
  font-style: italic;
  color: var(--amber);
`;

export const DescParagraph = styled.p`
  font-size: 14px;
  color: var(--ink-3);
  line-height: 1.5;
  max-width: 460px;
  margin-bottom: 16px;
`;

export const FormatList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
`;

export const FormatItem = styled.li`
  font-family: var(--mono);
  font-size: 10.5px;
  color: var(--ink-2);
  padding: 4px 10px;
  border: 1px solid var(--rule);
  border-radius: 2px;
  letter-spacing: 0.1em;
`;

export const FormatToken = styled.b`
  color: var(--amber);
  font-weight: 500;
`;

export const ErrorMsg = styled.p`
  font-family: var(--mono);
  font-size: 11px;
  color: var(--rose);
  line-height: 1.5;
  letter-spacing: 0.02em;
  margin: 0 0 8px;
`;

export const DisclaimerText = styled.p`
  font-family: var(--mono);
  font-size: 10.5px;
  color: var(--ink-3);
  line-height: 1.5;
  letter-spacing: 0.04em;
  margin: 0;
`;

export const DropZone = styled.div<{ $hover: boolean }>`
  position: relative;
  min-height: 280px;
  background: ${({ $hover }) => ($hover ? 'var(--panel-2)' : 'var(--panel)')};
  border: 1px dashed
    ${({ $hover }) => ($hover ? 'var(--amber)' : 'var(--rule-2)')};
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px;
  transition: 200ms;
  overflow: hidden;

  @media (max-width: 767px) {
    min-height: 200px;
    padding: 24px 20px;
  }
`;

export const CornerAccentTL = styled.span`
  position: absolute;
  top: 8px;
  left: 8px;
  width: 18px;
  height: 18px;
  border: 1px solid var(--amber);
  border-right: none;
  border-bottom: none;
`;

export const CornerAccentBR = styled.span`
  position: absolute;
  bottom: 8px;
  right: 8px;
  width: 18px;
  height: 18px;
  border: 1px solid var(--amber);
  border-left: none;
  border-top: none;
`;

export const LoadingTitle = styled.div`
  font-family: var(--serif);
  font-size: 18px;
  font-weight: 400;
  margin-bottom: 4px;
  text-align: center;
  line-height: 1.3;
`;

export const LoadingSubText = styled.div`
  font-family: var(--mono);
  font-size: 11px;
  color: var(--ink-3);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  margin-bottom: 24px;
`;

export const ButtonsRow = styled.div`
  display: flex;
  justify-content: center;
  width: 100%;
  gap: 8px;
`;

export const PrimaryButton = styled.button`
  padding: 9px 16px;
  border: 1px solid var(--amber);
  border-radius: 4px;
  background: var(--amber);
  color: var(--amber-text);
  font-weight: 600;
  font-family: var(--sans);
  font-size: 12.5px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;

  @media (max-width: 767px) {
    padding: 13px 24px;
    font-size: 14px;
    border-radius: 6px;
    flex: 1;
  }
`;

export const SecondaryButton = styled.button`
  padding: 9px 16px;
  border: 1px solid var(--rule-2);
  border-radius: 4px;
  background: transparent;
  color: var(--ink);
  font-family: var(--sans);
  font-size: 12.5px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;

  @media (max-width: 767px) {
    padding: 13px 24px;
    font-size: 14px;
    border-radius: 6px;
    flex: 1;
  }
`;
