import { ariaKeyShortcut } from '@prisma-mri/viewer-core';
import type { Ref } from 'react';
import { Keycaps } from './ControlButton';
import { useViewControls, useViewControlsMessages, useViewControlsState } from './context';
import type { FormFactor } from './hooks';
import { BoxIcon, ChevronUpIcon, KeyboardIcon } from './icons';

export interface LauncherProps {
  formFactor: FormFactor;
  keycaps: boolean;
  launcherRef?: Ref<HTMLButtonElement>;
}

/**
 * The collapsed panel.
 * desktop: round button bottom-left, keyboard icon + K; "View controls" slides out on hover / focus.
 * tablet:  centred pill — box icon, "View controls", ▴.
 * phone:   44 px round button bottom-left, above the host's tab bar.
 */
export function Launcher({ formFactor, keycaps, launcherRef }: LauncherProps) {
  const controller = useViewControls();
  const m = useViewControlsMessages();
  const toggleCombo = useViewControlsState((s) =>
    s.config.keyboard.enabled && s.config.actions.togglePanel
      ? s.config.keyboard.bindings.togglePanel[0]
      : undefined,
  );
  const open = () => controller.setPanelOpen(true);
  const shortcut = toggleCombo ? ariaKeyShortcut(toggleCombo) : undefined;

  if (formFactor === 'tablet') {
    return (
      <button
        ref={launcherRef}
        type="button"
        className="pmv-vc-launcher pmv-vc-launcher--tablet"
        aria-expanded="false"
        aria-keyshortcuts={shortcut}
        onClick={open}
      >
        <BoxIcon size={22} className="pmv-vc-accent" />
        <span>{m.panel}</span>
        <ChevronUpIcon size={16} />
      </button>
    );
  }
  return (
    <button
      ref={launcherRef}
      type="button"
      className={`pmv-vc-launcher pmv-vc-launcher--${formFactor}`}
      aria-label={m.showPanel}
      aria-expanded="false"
      aria-keyshortcuts={shortcut}
      onClick={open}
    >
      <KeyboardIcon size={formFactor === 'phone' ? 20 : 18} className="pmv-vc-accent" />
      {formFactor === 'desktop' && (
        <span className="pmv-vc-launcher__label" aria-hidden="true">
          {m.panel}
        </span>
      )}
      {formFactor === 'desktop' && keycaps && toggleCombo && <Keycaps combo={toggleCombo} />}
    </button>
  );
}
