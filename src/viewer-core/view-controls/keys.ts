/**
 * Key combos.
 *
 * Serialized form (what is stored in config / localStorage):
 *   "[Ctrl+][Alt+][Meta+][Shift+]<main>"
 *   <main> is either a KeyboardEvent.code ("KeyQ", "ArrowUp", "Digit0", "Minus", "NumpadAdd")
 *   or "key:<char>" for symbol keys whose physical position differs between layouts ("key:+", "key:?").
 *
 * Letters, digits and arrows use `code`, so shortcuts keep working on non-Latin layouts
 * (a Ukrainian layout produces event.key === "й" for the Q key, but event.code is still "KeyQ").
 */
import { ACTIONS, type ActionId } from './actions';

export type KeyCombo = string;

export interface ParsedCombo {
  ctrl: boolean;
  alt: boolean;
  meta: boolean;
  shift: boolean;
  /** KeyboardEvent.code, or null when `key` is used */
  code: string | null;
  /** KeyboardEvent.key (single printable char), or null when `code` is used */
  key: string | null;
}

const MODIFIER_CODES = new Set([
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
  'CapsLock',
]);

export function parseCombo(combo: KeyCombo): ParsedCombo | null {
  const parts = combo.split('+');
  // "key:+" splits into [..., "key:", ""] — glue it back.
  if (combo.endsWith('key:+')) {
    parts.splice(parts.length - 2, 2, 'key:+');
  }
  const main = parts.pop();
  if (!main) return null;
  const mods = new Set(parts);
  const isKey = main.startsWith('key:');
  const keyChar = isKey ? main.slice(4) : null;
  if (isKey && keyChar?.length !== 1) return null;
  return {
    ctrl: mods.has('Ctrl'),
    alt: mods.has('Alt'),
    meta: mods.has('Meta'),
    shift: mods.has('Shift'),
    code: isKey ? null : main,
    key: keyChar,
  };
}

export function serializeCombo(p: ParsedCombo): KeyCombo {
  const mods = [p.ctrl && 'Ctrl', p.alt && 'Alt', p.meta && 'Meta', p.shift && 'Shift'].filter(
    Boolean,
  );
  const main = p.code ?? `key:${p.key}`;
  return [...mods, main].join('+');
}

export interface KeyEventLike {
  code: string;
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

/**
 * Turn a keydown into a combo while recording a new shortcut.
 * Returns null for lone modifiers (keep waiting) .
 * Symbol keys that need Shift on common layouts are stored as key:<char>.
 */
export function comboFromEvent(e: KeyEventLike): KeyCombo | null {
  if (MODIFIER_CODES.has(e.code)) return null;
  const isSymbol = e.key.length === 1 && !/^(Key|Digit|Numpad|Space)/.test(e.code);
  if (isSymbol) {
    return serializeCombo({
      ctrl: e.ctrlKey,
      alt: e.altKey,
      meta: e.metaKey,
      shift: false,
      code: null,
      key: e.key,
    });
  }
  return serializeCombo({
    ctrl: e.ctrlKey,
    alt: e.altKey,
    meta: e.metaKey,
    shift: e.shiftKey,
    code: e.code,
    key: null,
  });
}

/**
 * Does this keydown trigger the combo?
 * Shift handling:
 *  - combo requires Shift  -> event must have Shift
 *  - steppable action      -> Shift is allowed (it means "bigger step")
 *  - key:<char> combo      -> Shift is ignored (it is part of typing the char)
 *  - otherwise             -> Shift must be up
 */
export function matchesCombo(e: KeyEventLike, combo: KeyCombo, actionId: ActionId): boolean {
  const p = parseCombo(combo);
  if (!p) return false;
  if (p.ctrl !== e.ctrlKey || p.alt !== e.altKey || p.meta !== e.metaKey) return false;
  if (p.key !== null) {
    return e.key === p.key;
  }
  if (p.code !== e.code) return false;
  if (p.shift) return e.shiftKey;
  return ACTIONS[actionId].steppable ? true : !e.shiftKey;
}

const GLYPHS: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Minus: '−',
  Equal: '=',
  NumpadAdd: 'Num +',
  NumpadSubtract: 'Num −',
  Space: 'Space',
  Escape: 'Esc',
  Enter: '↵',
  Backspace: '⌫',
  Slash: '/',
  Backslash: '\\',
  BracketLeft: '[',
  BracketRight: ']',
  Comma: ',',
  Period: '.',
  Semicolon: ';',
  Quote: "'",
  Backquote: '`',
};

const isMac = (): boolean =>
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** Human labels for each part of a combo, e.g. ["⇧", "→"] — one <kbd> per part. */
export function formatCombo(combo: KeyCombo): string[] {
  const p = parseCombo(combo);
  if (!p) return [combo];
  const mac = isMac();
  const out: string[] = [];
  if (p.ctrl) out.push(mac ? '⌃' : 'Ctrl');
  if (p.alt) out.push(mac ? '⌥' : 'Alt');
  if (p.meta) out.push(mac ? '⌘' : 'Win');
  if (p.shift) out.push('⇧');
  if (p.key !== null) {
    out.push(p.key === '-' ? '−' : p.key.toUpperCase());
  } else if (p.code) {
    const c = p.code;
    out.push(
      GLYPHS[c] ??
        (c.startsWith('Key')
          ? c.slice(3)
          : c.startsWith('Digit')
            ? c.slice(5)
            : c.startsWith('Numpad')
              ? `Num ${c.slice(6)}`
              : c),
    );
  }
  return out;
}

/** A combo as `aria-keyshortcuts` spells it: "Shift+ArrowRight", "Control+Q", "+". */
export function ariaKeyShortcut(combo: KeyCombo): string {
  const p = parseCombo(combo);
  if (!p) return combo;
  const mods = [p.ctrl && 'Control', p.alt && 'Alt', p.meta && 'Meta', p.shift && 'Shift'].filter(
    Boolean,
  );
  const c = p.code ?? '';
  const main =
    p.key !== null
      ? p.key
      : c.startsWith('Key')
        ? c.slice(3)
        : c.startsWith('Digit')
          ? c.slice(5)
          : c.startsWith('Numpad')
            ? c.slice(6)
            : c;
  return [...mods, main].join('+');
}

export type Bindings = Record<ActionId, KeyCombo[]>;

/** Combos that are bound to more than one action. */
export function findConflicts(bindings: Bindings): Map<KeyCombo, ActionId[]> {
  const byCombo = new Map<KeyCombo, ActionId[]>();
  for (const [action, combos] of Object.entries(bindings) as [ActionId, KeyCombo[]][]) {
    for (const combo of combos) {
      const list = byCombo.get(combo) ?? [];
      list.push(action);
      byCombo.set(combo, list);
    }
  }
  for (const [combo, actions] of byCombo) {
    if (actions.length < 2) byCombo.delete(combo);
  }
  return byCombo;
}

/** Which action (other than `except`) already uses this combo? */
export function actionUsingCombo(
  bindings: Bindings,
  combo: KeyCombo,
  except?: ActionId,
): ActionId | null {
  for (const [action, combos] of Object.entries(bindings) as [ActionId, KeyCombo[]][]) {
    if (action !== except && combos.includes(combo)) return action;
  }
  return null;
}
