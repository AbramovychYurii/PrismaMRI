import { ACTIONS, ROTATE_STEP_OPTIONS, actionsInGroup } from '@prisma-mri/viewer-core';
import type { ActionGroup } from '@prisma-mri/viewer-core';
import { useEffect, useRef, useState } from 'react';
import { Keycaps } from './ControlButton';
import { useViewControls, useViewControlsMessages, useViewControlsState } from './context';
import { formatAngle, formatZoom, useViewReadout } from './hooks';

/** Whether any action of `group` is still switched on — a group with none left disappears. */
export function useGroupVisible(group: ActionGroup): boolean {
  return useViewControlsState((s) => actionsInGroup(group).some((a) => s.config.actions[a.id]));
}

/** Tapping cycles 1° → 5° → 15° → 90°. Replaces Shift on touch devices. */
export function StepChip() {
  const controller = useViewControls();
  const m = useViewControlsMessages();
  const deg = useViewControlsState((s) => s.config.step.rotateDeg);
  const next = () => {
    const opts: readonly number[] = ROTATE_STEP_OPTIONS;
    const value = opts[(opts.indexOf(deg) + 1) % opts.length] ?? opts[0];
    controller.updateConfig((c) => ({ ...c, step: { ...c.step, rotateDeg: value } }));
  };
  return (
    <button type="button" className="pmv-vc-step" aria-label={m.stepButton(deg)} onClick={next}>
      {deg}° <span aria-hidden="true">▾</span>
    </button>
  );
}

/** "P 12° · Y −25° · R 0° · 125%" chip. */
export function Readout() {
  const m = useViewControlsMessages();
  const view = useViewReadout();
  const enabled = useViewControlsState((s) => s.config.panel.readout);
  if (!enabled || !view) return null;
  return (
    <output className="pmv-vc-readout">
      {m.readout({
        pitch: formatAngle(view.pitch),
        yaw: formatAngle(view.yaw),
        roll: formatAngle(view.roll),
        zoom: formatZoom(view.zoom),
      })}
    </output>
  );
}

/** "Zoom · 125%" — the live zoom next to a group label. */
export function ZoomLabel() {
  const m = useViewControlsMessages();
  const zoom = useViewReadout()?.zoom;
  return (
    <span className="pmv-vc-label">
      {m.groups.zoom}
      {zoom ? ` · ${formatZoom(zoom)}` : ''}
    </span>
  );
}

/** Shown for 2.5 s after the desktop panel is collapsed, while the keys still work. */
export function CollapsedToast() {
  const m = useViewControlsMessages();
  const open = useViewControlsState((s) => s.config.panel.open);
  const toggleCombo = useViewControlsState((s) => s.config.keyboard.bindings.togglePanel[0]);
  const keyboard = useViewControlsState(
    (s) => s.config.keyboard.enabled && s.config.actions[ACTIONS.togglePanel.id],
  );
  const [visible, setVisible] = useState(false);
  const previous = useRef(open);

  useEffect(() => {
    const wasOpen = previous.current;
    previous.current = open;
    if (open || !wasOpen || !keyboard) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 2500);
    return () => clearTimeout(t);
  }, [open, keyboard]);

  if (!visible || !toggleCombo) return null;
  return (
    <output className="pmv-vc-toast">
      {m.collapsedToast} <Keycaps combo={toggleCombo} /> {m.toShow}
    </output>
  );
}
