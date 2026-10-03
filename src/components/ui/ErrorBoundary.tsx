/**
 * ErrorBoundary — the last line under the whole app. A render error used to
 * unmount React's root and leave a blank page with no way forward; this shows
 * what happened and offers a reload, which restores the open volume from the
 * per-tab cache.
 *
 * The screen is ViewerPage's restore screen (full-bleed, mono uppercase); the
 * message is the import screen's error style and the button its primary one.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import styled from 'styled-components';

const Screen = styled.main`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  height: 100vh;
  padding: 0 30px;
  background: var(--bg);
  text-align: center;
`;

const Title = styled.h1`
  margin: 0;
  color: var(--ink-3);
  font-family: var(--mono);
  font-size: 12px;
  font-weight: 400;
  letter-spacing: 0.12em;
  text-transform: uppercase;
`;

const Message = styled.p`
  margin: 0;
  max-width: 480px;
  color: var(--rose);
  font-family: var(--mono);
  font-size: 11px;
  line-height: 1.5;
  letter-spacing: 0.02em;
`;

/** Engine text, for a bug report — the import screen's disclaimer style. */
const Details = styled.p`
  margin: 0;
  max-width: 480px;
  color: var(--ink-3);
  font-family: var(--mono);
  font-size: 10.5px;
  line-height: 1.5;
  letter-spacing: 0.04em;
  overflow-wrap: anywhere;
`;

const ReloadButton = styled.button`
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

  /* PrimaryButton's phone step; its flex: 1 is for a row and is left out. */
  @media (max-width: 767px) {
    padding: 13px 24px;
    font-size: 14px;
    border-radius: 6px;
  }
`;

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[app] render error', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <Screen>
        <Title>Something went wrong</Title>
        <Message role="alert">
          The viewer stopped unexpectedly. Reload to continue — the open volume is restored from
          this tab.
        </Message>
        {error.message && <Details>Details: {error.message}</Details>}
        <ReloadButton type="button" onClick={() => window.location.reload()}>
          Reload
        </ReloadButton>
      </Screen>
    );
  }
}
