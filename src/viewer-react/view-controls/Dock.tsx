import { type ActionGroup, actionsInGroup, ariaKeyShortcut } from '@prisma-mri/viewer-core';
import { type CSSProperties, type Ref, useLayoutEffect, useRef, useState } from 'react';
import { ControlButton, Keycaps } from './ControlButton';
import { StepChip, ZoomLabel, useGroupVisible } from './chips';
import { useViewControls, useViewControlsMessages, useViewControlsState } from './context';
import { ChevronDownIcon, KeyboardIcon, SettingsIcon } from './icons';

export const PANEL_GROUPS = ['rotate', 'align', 'zoom'] as const;
export type PanelGroup = (typeof PANEL_GROUPS)[number];

function GroupHeader({ group, touch }: { group: PanelGroup; touch: boolean }) {
  const m = useViewControlsMessages();
  const deg = useViewControlsState((s) => s.config.step.rotateDeg);
  if (group === 'zoom') return <ZoomLabel />;
  if (group === 'align') {
    return <span className="pmv-vc-label">{touch ? m.alignShort : m.groups.align}</span>;
  }
  return touch ? (
    <>
      <span className="pmv-vc-label">{m.groups.rotate}</span>
      <StepChip />
    </>
  ) : (
    <span className="pmv-vc-label">
      {m.groups.rotate} · {deg}°
    </span>
  );
}

function DockGroup({
  group,
  touch,
  keycaps,
}: {
  group: ActionGroup & PanelGroup;
  touch: boolean;
  keycaps: boolean;
}) {
  const visible = useGroupVisible(group);
  if (!visible) return null;
  return (
    <div className="pmv-vc-section" data-vc="stagger">
      <span className="pmv-vc-sep" aria-hidden="true" />
      <div className="pmv-vc-group" data-group={group}>
        <span className="pmv-vc-ghead">
          <GroupHeader group={group} touch={touch} />
        </span>
        <div className="pmv-vc-row">
          {actionsInGroup(group).map((a) => (
            <ControlButton
              key={a.id}
              id={a.id}
              keycaps={keycaps}
              variant={touch ? 'dock-touch' : 'dock'}
              iconSize={touch ? 22 : 18}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Scale that keeps the dock inside its viewport when the stage is narrower
 * than the dock (a desktop window with the slice rail open).
 */
function useFitScale(dock: React.RefObject<HTMLElement | null>): number {
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = dock.current;
    const viewport = el?.parentElement?.parentElement;
    if (!el || !viewport || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const available = viewport.clientWidth - 24;
      setScale(el.offsetWidth > 0 ? Math.min(1, available / el.offsetWidth) : 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(viewport);
    ro.observe(el);
    return () => ro.disconnect();
  }, [dock]);
  return scale;
}

export interface DockProps {
  formFactor: 'desktop' | 'tablet';
  keycaps: boolean;
  dockRef?: Ref<HTMLDivElement>;
}

/** Desktop dock (keycaps, tooltips, settings button) and tablet dock (touch sizes, step chip). */
export function Dock({ formFactor, keycaps, dockRef }: DockProps) {
  const controller = useViewControls();
  const m = useViewControlsMessages();
  const toggleCombo = useViewControlsState((s) =>
    s.config.actions.togglePanel ? s.config.keyboard.bindings.togglePanel[0] : undefined,
  );
  // null: the action is on but has no key; undefined: the action is off (no button).
  const settingsCombo = useViewControlsState((s) =>
    s.config.actions.openShortcuts
      ? (s.config.keyboard.bindings.openShortcuts[0] ?? null)
      : undefined,
  );
  const touch = formFactor === 'tablet';
  const inner = useRef<HTMLDivElement | null>(null);
  const scale = useFitScale(inner);

  const setRefs = (el: HTMLDivElement | null) => {
    inner.current = el;
    if (typeof dockRef === 'function') dockRef(el);
    else if (dockRef) (dockRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
  };

  return (
    <div
      className="pmv-vc-dockpos"
      data-touch={touch || undefined}
      style={{ '--pmv-vc-fit': scale } as CSSProperties}
    >
      <div
        ref={setRefs}
        role="toolbar"
        aria-label={m.panel}
        className="pmv-vc-dock"
        data-touch={touch || undefined}
      >
        <span className="pmv-vc-dock__bg" data-vc="bg" aria-hidden="true" />
        <button
          type="button"
          data-vc="lead"
          className={`pmv-vc-btn pmv-vc-btn--${touch ? 'dock-touch' : 'dock'} pmv-vc-accent`}
          aria-label={m.hidePanel}
          aria-expanded="true"
          aria-keyshortcuts={toggleCombo ? ariaKeyShortcut(toggleCombo) : undefined}
          onClick={() => controller.setPanelOpen(false)}
        >
          {touch ? <ChevronDownIcon size={22} /> : <KeyboardIcon size={18} />}
          {keycaps && toggleCombo && <Keycaps combo={toggleCombo} />}
        </button>
        {PANEL_GROUPS.map((g) => (
          <DockGroup key={g} group={g} touch={touch} keycaps={keycaps} />
        ))}
        {!touch && settingsCombo !== undefined && (
          <div className="pmv-vc-section" data-vc="stagger">
            <span className="pmv-vc-sep" aria-hidden="true" />
            <button
              type="button"
              className="pmv-vc-btn pmv-vc-btn--dock"
              aria-label={m.customize}
              aria-haspopup="dialog"
              aria-keyshortcuts={settingsCombo ? ariaKeyShortcut(settingsCombo) : undefined}
              onClick={() => controller.setShortcutsOpen(true)}
            >
              <SettingsIcon size={18} />
              {keycaps && settingsCombo && <Keycaps combo={settingsCombo} />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
