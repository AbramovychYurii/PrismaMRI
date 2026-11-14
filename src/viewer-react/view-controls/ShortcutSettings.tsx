import {
  ACTION_IDS,
  type ActionId,
  type Bindings,
  DEFAULT_CONFIG,
  type KeyCombo,
  type KeycapMode,
  type PhoneLayout,
  ROTATE_STEP_OPTIONS,
  type ViewControlsConfig,
  actionUsingCombo,
  comboFromEvent,
  formatCombo,
} from '@prisma-mri/viewer-core';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { Keycaps } from './ControlButton';
import { useViewControls, useViewControlsMessages, useViewControlsState } from './context';
import { PlaneGlyph, type PlaneLetter, XIcon } from './icons';

type Slot = number | 'add';
type Recording = { action: ActionId; index: Slot } | null;
type Conflict = { action: ActionId; index: Slot; combo: KeyCombo; other: ActionId } | null;

const LEFT_COLUMN: ActionId[] = [
  'pitchUp',
  'pitchDown',
  'yawLeft',
  'yawRight',
  'rollCcw',
  'rollCw',
];
const RIGHT_COLUMN: ActionId[] = ACTION_IDS.filter((id) => !LEFT_COLUMN.includes(id));

const PLANE_LETTER: Partial<Record<ActionId, PlaneLetter>> = {
  alignCoronal: 'C',
  alignSagittal: 'S',
  alignAxial: 'A',
};

/** Put `combo` in `slot` of `action`, without duplicates. */
function place(bindings: Bindings, action: ActionId, index: Slot, combo: KeyCombo): KeyCombo[] {
  const list = [...bindings[action]];
  if (index === 'add') list.push(combo);
  else list[index] = combo;
  return [...new Set(list)];
}

function Switch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="pmv-vc-toggle">
      {label}
      <input
        type="checkbox"
        role="switch"
        className="pmv-vc-switch"
        aria-checked={checked}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="pmv-vc-card">
      <legend className="pmv-vc-label">{title}</legend>
      {children}
    </fieldset>
  );
}

export interface ShortcutSettingsProps {
  /** Called after Save and on Cancel / close. Omitted: no Cancel or close button (inline use). */
  onClose?: () => void;
}

/**
 * Settings and shortcut editor. Everything is edited as a draft and applied on
 * Save. Mount it in the host's settings page, or use <ShortcutSettingsDialog/>.
 */
export function ShortcutSettings({ onClose }: ShortcutSettingsProps) {
  const controller = useViewControls();
  const m = useViewControlsMessages();
  const s = m.settings;
  const saved = useViewControlsState((st) => st.config);
  const [draft, setDraft] = useState<ViewControlsConfig>(saved);
  const [recording, setRecordingState] = useState<Recording>(null);
  const [conflict, setConflict] = useState<Conflict>(null);
  const titleId = useId();

  const setRecording = (r: Recording) => {
    setRecordingState(r);
    controller.setRecording(r !== null);
  };
  useEffect(() => () => controller.setRecording(false), [controller]);

  const patch = (fn: (c: ViewControlsConfig) => ViewControlsConfig) => setDraft(fn);
  const setBindings = (fn: (b: Bindings) => Bindings) =>
    patch((c) => ({ ...c, keyboard: { ...c.keyboard, bindings: fn(c.keyboard.bindings) } }));

  // While recording, the next key press is the new shortcut — nobody else sees it.
  const recordingRef = useRef(recording);
  recordingRef.current = recording;
  const bindingsRef = useRef(draft.keyboard.bindings);
  bindingsRef.current = draft.keyboard.bindings;
  // biome-ignore lint/correctness/useExhaustiveDependencies: listens while recording; reads the rest through refs
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      const rec = recordingRef.current;
      if (!rec) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key === 'Escape') {
        setRecording(null);
        return;
      }
      const combo = comboFromEvent(e);
      if (!combo) return; // a lone modifier: keep waiting
      const other = actionUsingCombo(bindingsRef.current, combo, rec.action);
      setRecording(null);
      if (other) setConflict({ ...rec, combo, other });
      else setBindings((b) => ({ ...b, [rec.action]: place(b, rec.action, rec.index, combo) }));
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [recording]);

  const resolve = (how: 'swap' | 'replace' | 'cancel') => {
    if (!conflict) return;
    const { action, index, combo, other } = conflict;
    setConflict(null);
    if (how === 'cancel') return;
    setBindings((b) => {
      const previous = index === 'add' ? undefined : b[action][index];
      let theirs = b[other].filter((c) => c !== combo);
      if (how === 'swap' && previous) theirs = [...new Set([...theirs, previous])];
      return { ...b, [action]: place(b, action, index, combo), [other]: theirs };
    });
  };

  const removeCombo = (action: ActionId, index: number) =>
    setBindings((b) => ({ ...b, [action]: b[action].filter((_, i) => i !== index) }));

  const save = () => {
    controller.replaceConfig(draft);
    onClose?.();
  };

  const startRecording = (action: ActionId, index: Slot) => {
    setConflict(null);
    setRecording({ action, index });
  };

  const row = (id: ActionId) => {
    const combos = draft.keyboard.bindings[id];
    const rec = recording?.action === id ? recording : null;
    const letter = PLANE_LETTER[id];
    return (
      <div key={id} className="pmv-vc-srow" data-recording={rec ? true : undefined}>
        <label className="pmv-vc-srow__name">
          <input
            type="checkbox"
            checked={draft.actions[id]}
            aria-label={`${s.actionEnabled}: ${m.actions[id]}`}
            onChange={(e) =>
              patch((c) => ({ ...c, actions: { ...c.actions, [id]: e.target.checked } }))
            }
          />
          {letter && <PlaneGlyph letter={letter} />}
          <span>{m.actions[id]}</span>
          {rec && <span className="pmv-vc-muted">{s.recording}</span>}
        </label>
        <span className="pmv-vc-srow__keys">
          {combos.map((combo, i) => (
            <span key={combo} className="pmv-vc-chip">
              <button
                type="button"
                className="pmv-vc-kb"
                data-recording={rec?.index === i || undefined}
                aria-label={`${m.actions[id]}: ${formatCombo(combo).join(' ')}`}
                onClick={() => startRecording(id, i)}
              >
                {rec?.index === i ? s.pressKeys : <Keycaps combo={combo} />}
              </button>
              <button
                type="button"
                className="pmv-vc-x"
                aria-label={`${s.removeShortcut}: ${formatCombo(combo).join(' ')}`}
                onClick={() => removeCombo(id, i)}
              >
                <XIcon size={12} />
              </button>
            </span>
          ))}
          <button
            type="button"
            className="pmv-vc-add"
            aria-label={`${s.addAlternate}: ${m.actions[id]}`}
            data-recording={rec?.index === 'add' || undefined}
            onClick={() => startRecording(id, 'add')}
          >
            {rec?.index === 'add' ? s.pressKeys : '+'}
          </button>
        </span>
        {conflict?.action === id && (
          <div role="alert" className="pmv-vc-conflict">
            <span>
              <Keycaps combo={conflict.combo} />{' '}
              {s.conflict(formatCombo(conflict.combo).join(' '), m.actions[conflict.other])}
            </span>
            <span className="pmv-vc-conflict__actions">
              <button type="button" className="pmv-vc-primary" onClick={() => resolve('swap')}>
                {s.swap}
              </button>
              <button type="button" className="pmv-vc-secondary" onClick={() => resolve('replace')}>
                {s.replace}
              </button>
              <button type="button" className="pmv-vc-ghost" onClick={() => resolve('cancel')}>
                {s.cancel}
              </button>
            </span>
          </div>
        )}
      </div>
    );
  };

  const steps = draft.step;
  return (
    <section className="pmv-vc-settings" aria-labelledby={titleId}>
      <header className="pmv-vc-settings__head">
        <div>
          <h2 id={titleId}>{s.title}</h2>
          <p className="pmv-vc-muted">{s.subtitle}</p>
        </div>
        {onClose && (
          <button type="button" className="pmv-vc-iconbtn" aria-label={s.close} onClick={onClose}>
            <XIcon size={16} />
          </button>
        )}
      </header>

      <div className="pmv-vc-settings__cards">
        <Card title={s.general}>
          <Switch
            label={s.master}
            checked={draft.enabled}
            onChange={(v) => patch((c) => ({ ...c, enabled: v }))}
          />
          <Switch
            label={s.keyboard}
            checked={draft.keyboard.enabled}
            onChange={(v) => patch((c) => ({ ...c, keyboard: { ...c.keyboard, enabled: v } }))}
          />
          <Switch
            label={s.panel}
            checked={draft.panel.enabled}
            onChange={(v) => patch((c) => ({ ...c, panel: { ...c.panel, enabled: v } }))}
          />
        </Card>
        <Card title={s.rotateStep}>
          <div role="radiogroup" aria-label={s.rotateStep} className="pmv-vc-seg">
            {ROTATE_STEP_OPTIONS.map((deg) => (
              <label key={deg}>
                <input
                  type="radio"
                  name={`${titleId}-step`}
                  checked={steps.rotateDeg === deg}
                  onChange={() => patch((c) => ({ ...c, step: { ...c.step, rotateDeg: deg } }))}
                />
                {deg}°
              </label>
            ))}
          </div>
          <label className="pmv-vc-field">
            <span>
              <kbd className="pmv-vc-kbd">⇧</kbd> {s.shiftMultiplier}
            </span>
            <input
              type="number"
              min={1}
              max={20}
              step={1}
              value={steps.shiftMultiplier}
              onChange={(e) =>
                patch((c) => ({
                  ...c,
                  step: { ...c.step, shiftMultiplier: e.target.valueAsNumber },
                }))
              }
            />
          </label>
        </Card>
        <Card title={s.zoom}>
          <label className="pmv-vc-field">
            {s.zoomStep}
            <span className="pmv-vc-suffix">
              <input
                type="number"
                min={1}
                max={100}
                value={steps.zoomPercent}
                onChange={(e) =>
                  patch((c) => ({ ...c, step: { ...c.step, zoomPercent: e.target.valueAsNumber } }))
                }
              />
              %
            </span>
          </label>
          <label className="pmv-vc-field">
            {s.keycaps}
            <select
              value={draft.panel.keycaps}
              onChange={(e) =>
                patch((c) => ({
                  ...c,
                  panel: { ...c.panel, keycaps: e.target.value as KeycapMode },
                }))
              }
            >
              <option value="auto">{s.keycapsAuto}</option>
              <option value="always">{s.keycapsAlways}</option>
              <option value="never">{s.keycapsNever}</option>
            </select>
          </label>
          <label className="pmv-vc-field">
            {s.phoneLayout}
            <select
              value={draft.panel.phoneLayout}
              onChange={(e) =>
                patch((c) => ({
                  ...c,
                  panel: { ...c.panel, phoneLayout: e.target.value as PhoneLayout },
                }))
              }
            >
              <option value="rows">{s.phoneRows}</option>
              <option value="tabs">{s.phoneTabs}</option>
            </select>
          </label>
        </Card>
      </div>

      <div
        className="pmv-vc-settings__bindings"
        data-disabled={!draft.keyboard.enabled || !draft.enabled || undefined}
      >
        <div className="pmv-vc-col">
          <span className="pmv-vc-label">{m.groups.rotate}</span>
          {LEFT_COLUMN.map(row)}
        </div>
        <div className="pmv-vc-col">
          <span className="pmv-vc-label">
            {m.alignShort} · {m.groups.zoom} · {s.viewGroup}
          </span>
          {RIGHT_COLUMN.map(row)}
        </div>
      </div>

      <footer className="pmv-vc-settings__foot">
        <span className="pmv-vc-ghead">
          <button
            type="button"
            className="pmv-vc-secondary"
            onClick={() => {
              setConflict(null);
              setRecording(null);
              setDraft({
                ...DEFAULT_CONFIG,
                panel: { ...DEFAULT_CONFIG.panel, open: draft.panel.open },
              });
            }}
          >
            {s.resetAll}
          </button>
          <span className="pmv-vc-muted">{s.savedLocally}</span>
        </span>
        <span className="pmv-vc-ghead">
          {onClose && (
            <button type="button" className="pmv-vc-ghost" onClick={onClose}>
              {s.cancel}
            </button>
          )}
          <button type="button" className="pmv-vc-primary" onClick={save}>
            {s.save}
          </button>
        </span>
      </footer>
    </section>
  );
}

/** Modal driven by the controller's `shortcutsOpen` — the "?" key, the dock's settings button, a host entry. */
export function ShortcutSettingsDialog() {
  const controller = useViewControls();
  const open = useViewControlsState((s) => s.shortcutsOpen);
  const ref = useRef<HTMLDialogElement>(null);
  // As of the last render: the Escape that ends a recording clears the
  // controller's flag before the dialog's cancel event arrives in the same task.
  const recording = useRef(false);
  recording.current = useViewControlsState((s) => s.recording);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
    }
    if (!open && d.open) {
      if (typeof d.close === 'function') d.close();
      else d.removeAttribute('open');
    }
  }, [open]);

  const close = () => controller.setShortcutsOpen(false);
  return (
    <dialog
      ref={ref}
      className="pmv-vc-dialog"
      onCancel={(e) => {
        // Escape while recording belongs to the recording; the editor already handled it.
        e.preventDefault();
        if (!recording.current) close();
      }}
      onClose={close}
    >
      {open && <ShortcutSettings onClose={close} />}
    </dialog>
  );
}
