/**
 * Headless controller: config + UI state + action dispatch + keyboard + press-and-hold.
 * No React. React (or any other UI) subscribes via subscribe/getState.
 */
import { ACTIONS, ACTION_IDS, type ActionId } from './actions';
import {
  DEFAULT_CONFIG,
  type ViewControlsConfig,
  isActionEnabled,
  normalizeConfig,
} from './config';
import { matchesCombo } from './keys';
import type { ConfigStorage } from './storage';
import type { ViewControlsTarget } from './target';

export type ActionSource = 'keyboard' | 'pointer' | 'api';

export interface ViewControlsState {
  config: ViewControlsConfig;
  /** Settings / shortcut editor is open. */
  shortcutsOpen: boolean;
  /** A real key press has been seen in this session (drives keycaps in "auto" mode). */
  keyboardSeen: boolean;
  /** While true the shortcut editor owns the keyboard; actions are not dispatched. */
  recording: boolean;
  /** Action currently held (key or pointer), for the pressed visual state. */
  heldAction: ActionId | null;
  /** Last dispatched action, for the transient status chip. */
  lastAction: { id: ActionId; at: number } | null;
  /** Bumped whenever the target is replaced (volume swapped), so views re-subscribe. */
  targetSeq: number;
}

export interface ViewControlsControllerOptions {
  target?: ViewControlsTarget | null;
  config?: unknown;
  storage?: ConfigStorage;
  /** Called after every dispatched action (analytics, host side effects). */
  onAction?: (id: ActionId, source: ActionSource) => void;
  /** Called on every config change (controlled usage / saving to a user profile). */
  onConfigChange?: (config: ViewControlsConfig) => void;
}

export interface KeyboardAttachOptions {
  /** Extra veto, e.g. ignore keys while a modal of the host app is open. */
  shouldHandle?: (e: KeyboardEvent) => boolean;
  /**
   * The viewer this controller drives. When several viewers on one page listen
   * for keys, only the one holding focus or under the pointer handles them.
   */
  element?: HTMLElement | null;
}

/** Anything keydown can be listened on: window, document or an element. */
export type KeyboardScope = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

export interface ViewControlsController {
  getState(): ViewControlsState;
  subscribe(listener: () => void): () => void;
  setTarget(target: ViewControlsTarget | null): void;
  getTarget(): ViewControlsTarget | null;
  updateConfig(updater: (c: ViewControlsConfig) => ViewControlsConfig): void;
  /**
   * Replace the whole config. `silent` applies a value that came from the host
   * (controlled `config` prop): no onConfigChange echo and no storage write.
   */
  replaceConfig(config: unknown, opts?: { silent?: boolean }): void;
  /** Fire an action once. `shift` = multiplied step. */
  trigger(id: ActionId, opts?: { shift?: boolean; source?: ActionSource }): void;
  /** Start a press: fires once, then repeats continuously while held (repeatable actions only). */
  pressStart(id: ActionId, opts?: { shift?: boolean; source?: ActionSource }): void;
  pressEnd(id?: ActionId): void;
  setPanelOpen(open: boolean): void;
  togglePanel(): void;
  setShortcutsOpen(open: boolean): void;
  setRecording(recording: boolean): void;
  attachKeyboard(scope: KeyboardScope, opts?: KeyboardAttachOptions): () => void;
  /**
   * The action this keydown would trigger right now, or null — for host key
   * handlers that should stand aside for a view control.
   */
  actionForKey(e: KeyboardEvent): ActionId | null;
  destroy(): void;
}

const hasDom = typeof HTMLElement !== 'undefined';

const isEditableTarget = (t: EventTarget | null): boolean => {
  if (!hasDom || !(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (t as HTMLInputElement).type;
    return !['button', 'checkbox', 'radio', 'range', 'submit', 'reset'].includes(type);
  }
  return false;
};

/** Controls that give the arrow keys a meaning of their own. */
const CONTROLS_WITH_ARROWS =
  'input[type="range"], [role="slider"], [role="menu"], [role="menubar"], [role="tablist"], [role="listbox"], [role="radiogroup"], [role="combobox"], [role="spinbutton"], [role="tree"], [role="grid"]';
const ARROW_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

const arrowBelongsToControl = (e: KeyboardEvent): boolean =>
  ARROW_KEYS.has(e.code) &&
  hasDom &&
  e.target instanceof Element &&
  e.target.closest(CONTROLS_WITH_ARROWS) !== null;

/**
 * Viewers listening for keys right now. With more than one, a key goes only to
 * the viewer that holds focus or sits under the pointer.
 */
const attachedViewers = new Set<HTMLElement>();

function isViewerActive(element: HTMLElement): boolean {
  if (attachedViewers.size < 2) return true;
  const active = typeof document !== 'undefined' ? document.activeElement : null;
  if (active && active !== document.body && element.contains(active)) return true;
  try {
    return element.matches(':hover');
  } catch {
    return false;
  }
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
// Looked up per call, not captured at import: tests (and late polyfills) can swap them.
const raf = (cb: (t: number) => void): number =>
  typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame(cb)
    : (setTimeout(() => cb(now()), 16) as unknown as number);
const caf = (id: number): void =>
  typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame(id) : clearTimeout(id);

export function createViewControlsController(
  options: ViewControlsControllerOptions = {},
): ViewControlsController {
  let target = options.target ?? null;
  const storage = options.storage;
  let state: ViewControlsState = {
    config: normalizeConfig(options.config ?? storage?.load(), DEFAULT_CONFIG),
    shortcutsOpen: false,
    keyboardSeen: false,
    recording: false,
    heldAction: null,
    lastAction: null,
    targetSeq: 0,
  };
  const listeners = new Set<() => void>();

  const set = (patch: Partial<ViewControlsState>) => {
    state = { ...state, ...patch };
    for (const l of listeners) l();
  };

  const commitConfig = (config: ViewControlsConfig) => {
    set({ config });
    storage?.save(config);
    options.onConfigChange?.(config);
  };

  // ---- dispatch -----------------------------------------------------------

  /** Apply an action. `scale` = fraction of one step (continuous mode passes dt/interval). */
  const apply = (id: ActionId, shift: boolean, scale: number) => {
    const { config } = state;
    const effect = ACTIONS[id].effect;
    const mult = shift && ACTIONS[id].steppable ? config.step.shiftMultiplier : 1;
    switch (effect.kind) {
      case 'rotate':
        target?.rotate(effect.axis, effect.direction * config.step.rotateDeg * mult * scale);
        break;
      case 'zoom': {
        const perStep = 1 + config.step.zoomPercent / 100;
        target?.zoomBy(perStep ** (effect.direction * mult * scale));
        break;
      }
      case 'align':
        target?.alignToPlane(effect.plane);
        break;
      case 'fit':
        target?.fitToView();
        break;
      case 'reset':
        target?.resetView();
        break;
      case 'togglePanel':
        api.togglePanel();
        break;
      case 'openShortcuts':
        api.setShortcutsOpen(!state.shortcutsOpen);
        break;
    }
  };

  // ---- press and hold -----------------------------------------------------

  let hold: {
    id: ActionId;
    shift: boolean;
    startedAt: number;
    last: number;
    frame: number | null;
  } | null = null;

  const stopHold = () => {
    if (hold?.frame != null) caf(hold.frame);
    hold = null;
    if (state.heldAction) set({ heldAction: null });
  };

  const tick = (t: number) => {
    if (!hold) return;
    const { holdDelayMs, holdIntervalMs } = state.config.step;
    if (t - hold.startedAt >= holdDelayMs) {
      const from = Math.max(hold.last, hold.startedAt + holdDelayMs);
      const dt = t - from;
      if (dt > 0) apply(hold.id, hold.shift, dt / holdIntervalMs);
      hold.last = t;
    }
    hold.frame = raf(tick);
  };

  // ---- keyboard -----------------------------------------------------------

  const keyToAction = new Map<string, ActionId>(); // event.code -> held action (for keyup)

  const findAction = (e: KeyboardEvent): ActionId | null => {
    const { config } = state;
    for (const id of ACTION_IDS) {
      if (!isActionEnabled(config, id)) continue;
      if (id === 'togglePanel' && !config.panel.enabled) continue;
      // While the settings dialog is open only its own shortcut works.
      if (state.shortcutsOpen && id !== 'openShortcuts') continue;
      if (config.keyboard.bindings[id].some((combo) => matchesCombo(e, combo, id))) return id;
    }
    return null;
  };

  const api: ViewControlsController = {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setTarget(t) {
      if (t === target) return;
      stopHold();
      target = t;
      set({ targetSeq: state.targetSeq + 1 });
    },
    getTarget: () => target,
    updateConfig(updater) {
      commitConfig(normalizeConfig(updater(state.config), state.config));
    },
    replaceConfig(config, opts = {}) {
      const next = normalizeConfig(config, DEFAULT_CONFIG);
      if (!opts.silent) return commitConfig(next);
      if (JSON.stringify(next) !== JSON.stringify(state.config)) set({ config: next });
    },
    trigger(id, opts = {}) {
      if (!isActionEnabled(state.config, id)) return;
      apply(id, !!opts.shift, 1);
      set({ lastAction: { id, at: now() } });
      options.onAction?.(id, opts.source ?? 'api');
    },
    pressStart(id, opts = {}) {
      stopHold();
      api.trigger(id, opts);
      if (!ACTIONS[id].repeatable || !isActionEnabled(state.config, id)) return;
      const t = now();
      hold = { id, shift: !!opts.shift, startedAt: t, last: t, frame: null };
      hold.frame = raf(tick);
      set({ heldAction: id });
    },
    pressEnd(id) {
      if (!hold || (id && hold.id !== id)) return;
      stopHold();
    },
    setPanelOpen(open) {
      if (state.config.panel.open === open) return;
      api.updateConfig((c) => ({ ...c, panel: { ...c.panel, open } }));
    },
    togglePanel() {
      api.setPanelOpen(!state.config.panel.open);
    },
    setShortcutsOpen(open) {
      set({ shortcutsOpen: open, recording: open ? state.recording : false });
    },
    setRecording(recording) {
      if (recording) stopHold();
      set({ recording });
    },
    attachKeyboard(scope, opts = {}) {
      const onKeyDown = (ev: Event) => {
        const e = ev as KeyboardEvent;
        if (e.defaultPrevented || e.isComposing || isEditableTarget(e.target)) return;
        if (opts.element && !isViewerActive(opts.element)) return;
        if (!state.keyboardSeen && !e.metaKey && !e.ctrlKey) set({ keyboardSeen: true });
        if (hold && e.key === 'Shift') hold.shift = true;
        const { config } = state;
        if (!config.enabled || !config.keyboard.enabled || state.recording) return;
        if (arrowBelongsToControl(e)) return;
        if (opts.shouldHandle && !opts.shouldHandle(e)) return;
        const id = findAction(e);
        if (!id) return;
        e.preventDefault();
        if (e.repeat) return; // our own hold loop handles repetition smoothly
        keyToAction.set(e.code, id);
        api.pressStart(id, { shift: e.shiftKey, source: 'keyboard' });
      };
      const onKeyUp = (ev: Event) => {
        const e = ev as KeyboardEvent;
        if (hold && e.key === 'Shift') hold.shift = false;
        const id = keyToAction.get(e.code);
        if (!id) return;
        keyToAction.delete(e.code);
        api.pressEnd(id);
      };
      const releaseAll = () => {
        keyToAction.clear();
        stopHold();
      };
      const onVisibility = () => {
        if (document.visibilityState === 'hidden') releaseAll();
      };
      const { element } = opts;
      if (element) attachedViewers.add(element);
      scope.addEventListener('keydown', onKeyDown);
      scope.addEventListener('keyup', onKeyUp);
      window.addEventListener('blur', releaseAll);
      document.addEventListener('visibilitychange', onVisibility);
      return () => {
        scope.removeEventListener('keydown', onKeyDown);
        scope.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('blur', releaseAll);
        document.removeEventListener('visibilitychange', onVisibility);
        if (element) attachedViewers.delete(element);
        releaseAll();
      };
    },
    actionForKey(e) {
      const { config } = state;
      if (!config.enabled || !config.keyboard.enabled || state.recording) return null;
      return findAction(e);
    },
    destroy() {
      stopHold();
      listeners.clear();
      target = null;
    },
  };

  return api;
}
