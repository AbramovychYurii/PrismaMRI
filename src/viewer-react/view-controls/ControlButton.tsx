import { ACTIONS, type ActionId, ariaKeyShortcut, formatCombo } from '@prisma-mri/viewer-core';
import { type MouseEvent, type PointerEvent, useRef } from 'react';
import { useViewControls, useViewControlsMessages, useViewControlsState } from './context';
import { ActionIcon } from './icons';

export type ControlButtonVariant = 'dock' | 'dock-touch' | 'sheet' | 'tile';

export interface ControlButtonProps {
  id: ActionId;
  /** Show the keycap hint under the icon. */
  keycaps: boolean;
  /** dock = desktop dock, dock-touch = tablet dock, sheet = phone rows, tile = phone tabs (icon + text). */
  variant: ControlButtonVariant;
  iconSize?: number;
}

/**
 * One action as a press-and-hold button: it fires on pointer down, repeats
 * while held (repeatable actions), and stops on up, cancel or capture loss.
 * Enter / Space on a focused button fire it once.
 */
export function ControlButton({ id, keycaps, variant, iconSize }: ControlButtonProps) {
  const controller = useViewControls();
  const m = useViewControlsMessages();
  const combos = useViewControlsState((s) => s.config.keyboard.bindings[id]);
  const keyboard = useViewControlsState((s) => s.config.keyboard.enabled);
  const held = useViewControlsState((s) => s.heldAction === id);
  const enabled = useViewControlsState((s) => s.config.actions[id]);
  const shiftMultiplier = useViewControlsState((s) => s.config.step.shiftMultiplier);
  const rotateDeg = useViewControlsState((s) => s.config.step.rotateDeg);
  const zoomPercent = useViewControlsState((s) => s.config.step.zoomPercent);
  const pointerActive = useRef(false);

  if (!enabled) return null;

  const meta = ACTIONS[id];
  const primary = keyboard ? combos[0] : undefined;
  const label = m.actions[id];
  const hint = m.actionHints[id];
  const touch = variant !== 'dock';

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    pointerActive.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    controller.pressStart(id, { shift: e.shiftKey, source: 'pointer' });
  };
  const end = () => {
    if (!pointerActive.current) return;
    pointerActive.current = false;
    controller.pressEnd(id);
  };
  // Keyboard activation (Enter / Space on a focused button) arrives as a click with detail 0.
  const onClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (e.detail === 0) controller.trigger(id, { shift: e.shiftKey, source: 'pointer' });
  };

  const bigStep =
    meta.group === 'rotate'
      ? `${rotateDeg * shiftMultiplier}°`
      : meta.group === 'zoom' && meta.steppable
        ? `${Math.round(((1 + zoomPercent / 100) ** shiftMultiplier - 1) * 100)}%`
        : null;

  return (
    <span className="pmv-vc-btnwrap">
      <button
        type="button"
        className={`pmv-vc-btn pmv-vc-btn--${variant}`}
        data-held={held || undefined}
        aria-label={label}
        aria-keyshortcuts={
          keyboard ? combos.map(ariaKeyShortcut).join(' ') || undefined : undefined
        }
        onPointerDown={onPointerDown}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={end}
        onClick={onClick}
        onContextMenu={(e) => e.preventDefault()}
      >
        <ActionIcon id={id} size={iconSize} />
        {variant === 'tile' && (
          <span className="pmv-vc-btn__text">{m.tileLabels[id] ?? label}</span>
        )}
        {keycaps && primary && <Keycaps combo={primary} />}
      </button>
      {!touch && (
        <span role="tooltip" className="pmv-vc-tip">
          <span className="pmv-vc-tip__title">{label}</span>
          {hint && <span className="pmv-vc-tip__hint">{hint}</span>}
          {primary && <Keycaps combo={primary} />}
          {meta.steppable && primary && bigStep && (
            <>
              <span className="pmv-vc-tip__hint">·</span>
              <Keycaps combo={`Shift+${primary}`} />
              <span className="pmv-vc-tip__hint">{bigStep}</span>
            </>
          )}
        </span>
      )}
      {variant === 'dock-touch' && held && meta.repeatable && (
        <span role="tooltip" className="pmv-vc-tip pmv-vc-tip--held">
          <span className="pmv-vc-tip__title">{label}</span>
          <span className="pmv-vc-tip__hint">· {m.holdHint}</span>
        </span>
      )}
    </span>
  );
}

export function Keycaps({ combo }: { combo: string }) {
  return (
    <span className="pmv-vc-keys">
      {formatCombo(combo).map((part, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: parts of one combo are positional
        <kbd key={i} className="pmv-vc-kbd">
          {part}
        </kbd>
      ))}
    </span>
  );
}
