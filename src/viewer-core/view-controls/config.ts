/**
 * User-facing configuration. Everything here is serializable and versioned,
 * so the host app can persist it (localStorage, user profile, URL) and the
 * future npm package can accept it as a prop.
 */
import { ACTION_IDS, type ActionId } from './actions';
import type { Bindings, KeyCombo } from './keys';

export const CONFIG_VERSION = 1 as const;

export type KeycapMode = 'auto' | 'always' | 'never';
export type PhoneLayout = 'rows' | 'tabs';
export type PhoneTrigger = 'button' | 'host' | 'both';
export type MotionMode = 'auto' | 'reduced' | 'none';

export interface ViewControlsConfig {
  version: typeof CONFIG_VERSION;
  /** Master switch: off = no keyboard handling and no on-screen panel. */
  enabled: boolean;
  keyboard: {
    enabled: boolean;
    bindings: Bindings;
  };
  panel: {
    /** On-screen controls (dock on desktop/tablet, sheet on phone). */
    enabled: boolean;
    /** Remembered open/collapsed state. */
    open: boolean;
    /** auto = show keycaps on fine-pointer devices and after the first real key press. */
    keycaps: KeycapMode;
    phoneLayout: PhoneLayout;
    /**
     * Who opens the phone sheet:
     * button = our floating button, host = the app's own control (e.g. the CTRL tab), both.
     */
    phoneTrigger: PhoneTrigger;
    /** Show the "P 12° · Y −25° · R 0° · 125%" readout. */
    readout: boolean;
  };
  /** Per-action switch. false = no key handling and no button for that action. */
  actions: Record<ActionId, boolean>;
  step: {
    /** Degrees per press. Selectable in UI: 1 / 5 / 15 / 90. */
    rotateDeg: number;
    /** Zoom change per press, in percent (10 = ×1.1). */
    zoomPercent: number;
    /** Shift multiplies rotate and zoom steps by this. */
    shiftMultiplier: number;
    /** Press-and-hold: delay before continuous mode starts. */
    holdDelayMs: number;
    /** Continuous speed = one step every N ms. */
    holdIntervalMs: number;
  };
  motion: MotionMode;
}

export const ROTATE_STEP_OPTIONS = [1, 5, 15, 90] as const;

export const DEFAULT_BINDINGS: Bindings = {
  pitchUp: ['ArrowUp'],
  pitchDown: ['ArrowDown'],
  yawLeft: ['ArrowLeft'],
  yawRight: ['ArrowRight'],
  rollCcw: ['KeyQ'],
  rollCw: ['KeyE'],
  alignCoronal: ['KeyC'],
  alignSagittal: ['KeyS'],
  alignAxial: ['KeyA'],
  zoomIn: ['key:+', 'key:='],
  zoomOut: ['key:-'],
  fitToView: ['Digit0', 'Numpad0'],
  resetView: ['KeyR'],
  togglePanel: ['KeyK'],
  openShortcuts: ['key:?'],
};

export const DEFAULT_CONFIG: ViewControlsConfig = {
  version: CONFIG_VERSION,
  enabled: true,
  keyboard: { enabled: true, bindings: DEFAULT_BINDINGS },
  panel: {
    enabled: true,
    open: true,
    keycaps: 'auto',
    phoneLayout: 'rows',
    phoneTrigger: 'both',
    readout: true,
  },
  actions: Object.fromEntries(ACTION_IDS.map((id) => [id, true])) as Record<ActionId, boolean>,
  step: {
    rotateDeg: 5,
    zoomPercent: 10,
    shiftMultiplier: 3,
    holdDelayMs: 300,
    holdIntervalMs: 50,
  },
  motion: 'auto',
};

/** Deep-partial for overrides coming from props or storage. */
export type ViewControlsConfigInput = {
  [K in keyof ViewControlsConfig]?: ViewControlsConfig[K] extends object
    ? Partial<ViewControlsConfig[K]>
    : ViewControlsConfig[K];
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Merge an untrusted/partial input over defaults. Unknown keys are dropped,
 * wrong types fall back to defaults, so a corrupt localStorage value never breaks the viewer.
 */
export function normalizeConfig(
  input: unknown,
  base: ViewControlsConfig = DEFAULT_CONFIG,
): ViewControlsConfig {
  if (!isRecord(input)) return base;
  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  const num = (v: unknown, d: number, min: number, max: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d;
  const oneOf = <T extends string>(v: unknown, opts: readonly T[], d: T): T =>
    typeof v === 'string' && (opts as readonly string[]).includes(v) ? (v as T) : d;

  const kb = isRecord(input.keyboard) ? input.keyboard : {};
  const panel = isRecord(input.panel) ? input.panel : {};
  const step = isRecord(input.step) ? input.step : {};
  const actions = isRecord(input.actions) ? input.actions : {};
  const rawBindings = isRecord(kb.bindings) ? kb.bindings : {};

  const bindings = { ...base.keyboard.bindings };
  for (const id of ACTION_IDS) {
    const v = rawBindings[id];
    if (Array.isArray(v) && v.every((c): c is KeyCombo => typeof c === 'string')) bindings[id] = v;
  }

  return {
    version: CONFIG_VERSION,
    enabled: bool(input.enabled, base.enabled),
    keyboard: { enabled: bool(kb.enabled, base.keyboard.enabled), bindings },
    panel: {
      enabled: bool(panel.enabled, base.panel.enabled),
      open: bool(panel.open, base.panel.open),
      keycaps: oneOf(panel.keycaps, ['auto', 'always', 'never'] as const, base.panel.keycaps),
      phoneLayout: oneOf(panel.phoneLayout, ['rows', 'tabs'] as const, base.panel.phoneLayout),
      phoneTrigger: oneOf(
        panel.phoneTrigger,
        ['button', 'host', 'both'] as const,
        base.panel.phoneTrigger,
      ),
      readout: bool(panel.readout, base.panel.readout),
    },
    actions: Object.fromEntries(
      ACTION_IDS.map((id) => [id, bool(actions[id], base.actions[id])]),
    ) as Record<ActionId, boolean>,
    step: {
      rotateDeg: num(step.rotateDeg, base.step.rotateDeg, 0.1, 180),
      zoomPercent: num(step.zoomPercent, base.step.zoomPercent, 1, 100),
      shiftMultiplier: num(step.shiftMultiplier, base.step.shiftMultiplier, 1, 20),
      holdDelayMs: num(step.holdDelayMs, base.step.holdDelayMs, 0, 2000),
      holdIntervalMs: num(step.holdIntervalMs, base.step.holdIntervalMs, 8, 1000),
    },
    motion: oneOf(input.motion, ['auto', 'reduced', 'none'] as const, base.motion),
  };
}

/** Is this action live right now (master switch + per-action switch)? */
export const isActionEnabled = (config: ViewControlsConfig, id: ActionId): boolean =>
  config.enabled && config.actions[id];
