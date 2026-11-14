/**
 * Open / close choreography for the panel, on the Web Animations API.
 *
 * Desktop open (`cubic-bezier(.2,.8,.2,1)`):
 *   0–200 ms    the launcher's button flies to its place as the dock's first button, on a slight arc;
 *   120–360 ms  the dock background grows out of it (clip-path pill → full dock);
 *   200–440 ms  the groups come in left to right, 40 ms apart (opacity, translateX −8 px → 0).
 * Desktop close is the reverse in 240 ms. Tablet: the pill fades and scales into the
 * dock (220 ms). Phone: the sheet slides up (280 ms) and down (200 ms), then the
 * launcher fades in. Reduced motion: a 150 ms fade everywhere; `none`: nothing moves.
 *
 * Only transform, opacity and clip-path are animated (plus the flying button's
 * own fill, which stands in for the launcher it came from). Toggling mid-way
 * reverses the running animations from where they are; nothing animates on mount.
 */
import { type RefObject, useLayoutEffect, useRef, useState } from 'react';
import type { FormFactor, Motion } from './hooks';

export const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const canAnimate = (el: Element | null | undefined): el is HTMLElement =>
  !!el && typeof (el as HTMLElement).animate === 'function';

function boxIn(el: Element, root: Element): Box {
  const r = el.getBoundingClientRect();
  const o = root.getBoundingClientRect();
  return { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height };
}

const centre = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

/** Where the desktop launcher sits when it has never been measured: 24 px from the bottom-left. */
function defaultLauncher(root: Element): Box {
  const o = root.getBoundingClientRect();
  return { x: 24, y: o.height - 24 - 48, w: 48, h: 48 };
}

interface Scene {
  kind: FormFactor;
  motion: Motion;
  root: HTMLElement;
  panel: HTMLElement;
  launcher: Box | null;
}

const fade = (el: HTMLElement, from: number, to: number, duration: number, delay = 0) =>
  el.animate([{ opacity: from }, { opacity: to }], {
    duration,
    delay,
    easing: 'linear',
    fill: 'both',
  });

/** The dock's parts and the numbers the desktop FLIP needs. */
function dockGeometry(scene: Scene) {
  const { panel, root } = scene;
  const lead = panel.querySelector<HTMLElement>('[data-vc="lead"]');
  const bg = panel.querySelector<HTMLElement>('[data-vc="bg"]');
  const staggers = Array.from(panel.querySelectorAll<HTMLElement>('[data-vc="stagger"]'));
  if (!lead || !bg) return null;
  // The dock may be scaled down to fit a narrow stage; translations happen inside that scale.
  const scale = panel.offsetWidth > 0 ? panel.getBoundingClientRect().width / panel.offsetWidth : 1;
  const launcher = scene.launcher ?? defaultLauncher(root);
  const from = centre(launcher);
  const to = centre(boxIn(lead, root));
  const dx = (from.x - to.x) / scale;
  const dy = (from.y - to.y) / scale;
  const W = panel.offsetWidth;
  const H = panel.offsetHeight;
  const cx = lead.offsetLeft + lead.offsetWidth / 2;
  const cy = lead.offsetTop + lead.offsetHeight / 2;
  const pillW = Math.max(44, launcher.w / scale);
  const left = Math.max(0, cx - 22);
  const pill = `inset(${cy - 22}px ${Math.max(0, W - left - pillW)}px ${H - cy - 22}px ${left}px round 999px)`;
  const full = 'inset(0px 0px 0px 0px round 20px)';
  const fill = getComputedStyle(bg).backgroundColor;
  const border = getComputedStyle(bg).borderTopColor;
  return { lead, bg, staggers, dx, dy, pill, full, fill, border };
}

/** The button's flight: launcher spot → dock, lifted a little half-way. */
function flight(dx: number, dy: number, fill: string, border: string): Keyframe[] {
  return [
    {
      transform: `translate(${dx}px, ${dy}px)`,
      backgroundColor: fill,
      borderColor: border,
      borderRadius: '999px',
    },
    {
      offset: 0.5,
      transform: `translate(${dx / 2}px, ${dy / 2 - 14}px)`,
      backgroundColor: fill,
      borderColor: border,
      borderRadius: '999px',
    },
    {
      transform: 'translate(0px, 0px)',
      backgroundColor: 'rgba(0, 0, 0, 0)',
      borderColor: 'rgba(0, 0, 0, 0)',
      borderRadius: '12px',
    },
  ];
}

const STAGGER_IN: Keyframe[] = [
  { opacity: 0, transform: 'translateX(-8px)' },
  { opacity: 1, transform: 'translateX(0px)' },
];
const STAGGER_OUT = [...STAGGER_IN].reverse();

function openDesktop(scene: Scene): Animation[] {
  const g = dockGeometry(scene);
  if (!g) return [];
  return [
    g.lead.animate(flight(g.dx, g.dy, g.fill, g.border), {
      duration: 200,
      easing: EASE,
      fill: 'both',
    }),
    g.bg.animate([{ clipPath: g.pill }, { clipPath: g.full }], {
      duration: 240,
      delay: 120,
      easing: EASE,
      fill: 'both',
    }),
    ...g.staggers.map((el, i) =>
      el.animate(STAGGER_IN, { duration: 120, delay: 200 + i * 40, easing: EASE, fill: 'both' }),
    ),
  ];
}

function closeDesktop(scene: Scene): Animation[] {
  const g = dockGeometry(scene);
  if (!g) return [];
  const n = g.staggers.length;
  return [
    ...g.staggers.map((el, i) =>
      el.animate(STAGGER_OUT, {
        duration: 90,
        delay: (n - 1 - i) * 30,
        easing: EASE,
        fill: 'both',
      }),
    ),
    g.bg.animate([{ clipPath: g.full }, { clipPath: g.pill }], {
      duration: 130,
      delay: 60,
      easing: EASE,
      fill: 'both',
    }),
    g.lead.animate([...flight(g.dx, g.dy, g.fill, g.border)].reverse(), {
      duration: 120,
      delay: 120,
      easing: EASE,
      fill: 'both',
    }),
  ];
}

/** The tablet pill ↔ dock: a scale from the pill's size about the dock's bottom centre. */
function pillScale(scene: Scene): string {
  const { panel, launcher } = scene;
  const r = panel.getBoundingClientRect();
  if (!launcher || r.width === 0 || r.height === 0) return 'scale(0.6, 0.6)';
  return `scale(${launcher.w / r.width}, ${launcher.h / r.height})`;
}

function openTablet(scene: Scene): Animation[] {
  const { panel } = scene;
  panel.style.transformOrigin = '50% 100%';
  const staggers = Array.from(panel.querySelectorAll<HTMLElement>('[data-vc="stagger"]'));
  return [
    panel.animate(
      [
        { opacity: 0, transform: pillScale(scene) },
        { opacity: 1, transform: 'scale(1, 1)' },
      ],
      { duration: 220, easing: EASE, fill: 'both' },
    ),
    ...staggers.map((el, i) =>
      el.animate(STAGGER_IN, { duration: 160, delay: 80 + i * 40, easing: EASE, fill: 'both' }),
    ),
  ];
}

function closeTablet(scene: Scene): Animation[] {
  const { panel } = scene;
  panel.style.transformOrigin = '50% 100%';
  return [
    panel.animate(
      [
        { opacity: 1, transform: 'scale(1, 1)' },
        { opacity: 0, transform: pillScale(scene) },
      ],
      { duration: 180, easing: EASE, fill: 'both' },
    ),
  ];
}

const SHEET_DOWN = 'translateY(calc(100% + var(--pmv-vc-sheet-bottom, 0px)))';

function openPhone({ panel }: Scene): Animation[] {
  return [
    panel.animate([{ transform: SHEET_DOWN }, { transform: 'translateY(0px)' }], {
      duration: 280,
      easing: EASE,
      fill: 'both',
    }),
  ];
}

function closePhone({ panel }: Scene): Animation[] {
  return [
    panel.animate([{ transform: 'translateY(0px)' }, { transform: SHEET_DOWN }], {
      duration: 200,
      easing: 'cubic-bezier(0.4, 0, 1, 1)',
      fill: 'both',
    }),
  ];
}

export function animateOpen(scene: Scene): Animation[] {
  if (scene.motion === 'none' || !canAnimate(scene.panel)) return [];
  if (scene.motion === 'reduced') return [fade(scene.panel, 0, 1, 150)];
  if (scene.kind === 'desktop') return openDesktop(scene);
  if (scene.kind === 'tablet') return openTablet(scene);
  return openPhone(scene);
}

export function animateClose(scene: Scene): Animation[] {
  if (scene.motion === 'none' || !canAnimate(scene.panel)) return [];
  if (scene.motion === 'reduced') return [fade(scene.panel, 1, 0, 150)];
  if (scene.kind === 'desktop') return closeDesktop(scene);
  if (scene.kind === 'tablet') return closeTablet(scene);
  return closePhone(scene);
}

/** After a close: the launcher fades in — except on desktop, where the button already flew there. */
export function animateLauncherIn(kind: FormFactor, motion: Motion, el: HTMLElement): void {
  if (motion === 'none' || !canAnimate(el)) return;
  if (motion === 'reduced') fade(el, 0, 1, 150);
  else if (kind === 'tablet') fade(el, 0, 1, 120);
  else if (kind === 'phone') fade(el, 0, 1, 150);
}

type Direction = 'open' | 'close';

interface Run {
  dir: Direction;
  anims: Animation[];
}

export interface PanelPresenceOptions {
  open: boolean;
  kind: FormFactor;
  motion: Motion;
  rootRef: RefObject<HTMLElement | null>;
  panelRef: RefObject<HTMLElement | null>;
  launcherRef: RefObject<HTMLElement | null>;
}

/**
 * Whether the panel or the launcher is on screen, lagging `open` while a close
 * plays. Runs the choreography above on every toggle after the first render.
 */
export function usePanelPresence({
  open,
  kind,
  motion,
  rootRef,
  panelRef,
  launcherRef,
}: PanelPresenceOptions): boolean {
  const [showPanel, setShowPanel] = useState(open);
  const run = useRef<Run | null>(null);
  const token = useRef(0);
  const pendingOpen = useRef(false);
  const pendingLauncher = useRef(false);
  const launcherBox = useRef<Box | null>(null);
  const mounted = useRef(false);
  const lastKind = useRef(kind);

  const settle = (anims: Animation[], dir: Direction, done: () => void) => {
    const t = ++token.current;
    run.current = { dir, anims };
    Promise.all(anims.map((a) => a.finished))
      .then(() => {
        if (token.current !== t) return;
        run.current = null;
        done();
      })
      .catch(() => {});
  };

  const finishOpen = (anims: Animation[]) => () => {
    for (const a of anims) a.cancel();
  };
  const finishClose = () => {
    pendingLauncher.current = true;
    setShowPanel(false);
  };

  // A layout switch (resize, rotation) drops whatever was playing.
  useLayoutEffect(() => {
    if (lastKind.current === kind) return;
    lastKind.current = kind;
    token.current++;
    for (const a of run.current?.anims ?? []) a.cancel();
    run.current = null;
    setShowPanel(open);
  }, [kind, open]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `open` is the trigger; the rest is read at that moment
  useLayoutEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const current = run.current;
    const root = rootRef.current;
    if (open) {
      if (current?.dir === 'close') {
        for (const a of current.anims) a.reverse();
        settle(current.anims, 'open', finishOpen(current.anims));
        return;
      }
      if (showPanel) return;
      if (launcherRef.current && root) launcherBox.current = boxIn(launcherRef.current, root);
      pendingOpen.current = true;
      setShowPanel(true);
      return;
    }
    if (current?.dir === 'open') {
      for (const a of current.anims) a.reverse();
      settle(current.anims, 'close', finishClose);
      return;
    }
    const panel = panelRef.current;
    const anims =
      panel && root
        ? animateClose({ kind, motion, root, panel, launcher: launcherBox.current })
        : [];
    if (anims.length === 0) setShowPanel(false);
    else settle(anims, 'close', finishClose);
  }, [open]);

  // The panel has just been rendered for an open: play it in.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the panel appears; the rest is read then
  useLayoutEffect(() => {
    if (showPanel && pendingOpen.current) {
      pendingOpen.current = false;
      const panel = panelRef.current;
      const root = rootRef.current;
      if (!panel || !root) return;
      const anims = animateOpen({ kind, motion, root, panel, launcher: launcherBox.current });
      if (anims.length) settle(anims, 'open', finishOpen(anims));
      return;
    }
    if (!showPanel && pendingLauncher.current) {
      pendingLauncher.current = false;
      if (launcherRef.current) animateLauncherIn(kind, motion, launcherRef.current);
    }
  }, [showPanel]);

  // Remember where the launcher sits, for the flight back on the next close.
  useLayoutEffect(() => {
    if (!showPanel && launcherRef.current && rootRef.current) {
      launcherBox.current = boxIn(launcherRef.current, rootRef.current);
    }
  });

  return showPanel;
}
