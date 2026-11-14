import type { FramingInset } from '@prisma-mri/viewer-core';
import { useEffect, useRef, useState } from 'react';
import { Dock } from './Dock';
import { Launcher } from './Launcher';
import { Sheet } from './Sheet';
import { ShortcutSettingsDialog } from './ShortcutSettings';
import { CollapsedToast, Readout } from './chips';
import { useViewControls, useViewControlsState } from './context';
import {
  type FormFactor,
  type FormFactorOptions,
  useFormFactor,
  useMotion,
  useShowKeycaps,
} from './hooks';
import { usePanelPresence } from './motion';

export interface ViewControlsProps extends FormFactorOptions {
  /** Force a layout (tests, stories). Default: from input capability and the viewport's width. */
  formFactor?: FormFactor;
  className?: string;
  /**
   * How much of the viewport's bottom the phone sheet covers, 0 once it closes —
   * for host chrome that has to move above it. The target's `setFramingInset`
   * is told the same, to keep the model centred in what stays visible.
   */
  onInsetChange?: (inset: FramingInset) => void;
}

const NO_INSET: FramingInset = { bottom: 0 };

/** Reports the open phone sheet's height to the target and the host. */
function useSheetInset(
  sheet: HTMLElement | null,
  onInsetChange: ViewControlsProps['onInsetChange'],
): void {
  const controller = useViewControls();
  const targetSeq = useViewControlsState((s) => s.targetSeq);
  const report = useRef(onInsetChange);
  report.current = onInsetChange;

  // biome-ignore lint/correctness/useExhaustiveDependencies: targetSeq re-applies the inset to a new target
  useEffect(() => {
    const apply = (inset: FramingInset) => {
      controller.getTarget()?.setFramingInset?.(inset);
      report.current?.(inset);
    };
    if (!sheet) {
      apply(NO_INSET);
      return;
    }
    const measure = () => {
      const bottom = Number.parseFloat(getComputedStyle(sheet).bottom) || 0;
      apply({ bottom: sheet.offsetHeight + bottom });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return () => apply(NO_INSET);
    const ro = new ResizeObserver(measure);
    ro.observe(sheet);
    return () => {
      ro.disconnect();
      apply(NO_INSET);
    };
  }, [controller, sheet, targetSeq]);
}

/**
 * The on-screen view controls. Place inside the viewer's 3-D viewport
 * (position: relative); it fills it without taking pointer events of its own.
 * Keyboard shortcuts work whenever <ViewControlsProvider> is mounted, with or
 * without this.
 */
export function ViewControls({
  formFactor: forced,
  className,
  phoneMaxWidth,
  onInsetChange,
}: ViewControlsProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const launcherRef = useRef<HTMLButtonElement | null>(null);
  const [sheet, setSheet] = useState<HTMLElement | null>(null);

  const detected = useFormFactor(root, { phoneMaxWidth });
  const formFactor = forced ?? detected;
  const master = useViewControlsState((s) => s.config.enabled);
  const panelEnabled = useViewControlsState((s) => s.config.enabled && s.config.panel.enabled);
  // Without the show / hide action there is no way back from collapsed: keep it open.
  const open = useViewControlsState((s) => s.config.panel.open || !s.config.actions.togglePanel);
  const phoneLayout = useViewControlsState((s) => s.config.panel.phoneLayout);
  const phoneTrigger = useViewControlsState((s) => s.config.panel.phoneTrigger);
  const keycaps = useShowKeycaps(formFactor);
  const motion = useMotion();

  const showPanel = usePanelPresence({
    open: panelEnabled && open,
    kind: formFactor,
    motion,
    rootRef,
    panelRef,
    launcherRef,
  });
  useSheetInset(formFactor === 'phone' && showPanel ? sheet : null, onInsetChange);

  const setRootRefs = (el: HTMLDivElement | null) => {
    rootRef.current = el;
    setRoot(el);
  };
  const setSheetRefs = (el: HTMLElement | null) => {
    panelRef.current = el;
    setSheet(el);
  };

  const launcher =
    formFactor !== 'phone' || phoneTrigger !== 'host' ? (
      <Launcher formFactor={formFactor} keycaps={keycaps} launcherRef={launcherRef} />
    ) : null;

  return (
    <div
      ref={setRootRefs}
      className={className ? `pmv-vc-root ${className}` : 'pmv-vc-root'}
      data-form-factor={formFactor}
      data-motion={motion}
    >
      {master && panelEnabled && (
        <>
          {formFactor !== 'desktop' && <Readout />}
          {showPanel ? (
            formFactor === 'phone' ? (
              <Sheet layout={phoneLayout} keycaps={keycaps} sheetRef={setSheetRefs} />
            ) : (
              <Dock
                formFactor={formFactor}
                keycaps={keycaps}
                dockRef={(el) => {
                  panelRef.current = el;
                }}
              />
            )
          ) : (
            launcher
          )}
          {formFactor === 'desktop' && <CollapsedToast />}
        </>
      )}
      {/* Mounted even with the master switch off, so a host entry can open it to turn things back on. */}
      <ShortcutSettingsDialog />
    </div>
  );
}
