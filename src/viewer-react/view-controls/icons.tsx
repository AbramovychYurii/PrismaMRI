import type { ActionId } from '@prisma-mri/viewer-core';
import {
  Box,
  ChevronDown,
  ChevronUp,
  House,
  Keyboard,
  type LucideIcon,
  Redo,
  RotateCcw,
  RotateCw,
  Scan,
  SlidersHorizontal,
  Undo,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

const STROKE = 1.75;

interface IconProps {
  size?: number;
  className?: string;
}

const icon =
  (Icon: LucideIcon, style?: React.CSSProperties) =>
  ({ size = 20, className }: IconProps) => (
    <Icon size={size} strokeWidth={STROKE} className={className} style={style} aria-hidden />
  );

/** Pitch is undo / redo turned a quarter turn, so the arrow curls up or down. */
const QUARTER_TURN: React.CSSProperties = { transform: 'rotate(90deg)' };

export const PitchUpIcon = icon(Undo, QUARTER_TURN);
export const PitchDownIcon = icon(Redo, QUARTER_TURN);
export const YawLeftIcon = icon(Undo);
export const YawRightIcon = icon(Redo);
export const RollCcwIcon = icon(RotateCcw);
export const RollCwIcon = icon(RotateCw);
export const ZoomOutIcon = icon(ZoomOut);
export const ZoomInIcon = icon(ZoomIn);
export const FitIcon = icon(Scan);
export const ResetIcon = icon(House);
export const KeyboardIcon = icon(Keyboard);
export const BoxIcon = icon(Box);
export const SettingsIcon = icon(SlidersHorizontal);
export const ChevronDownIcon = icon(ChevronDown);
export const ChevronUpIcon = icon(ChevronUp);
export const XIcon = icon(X);

export type PlaneLetter = 'C' | 'S' | 'A';

/** Slice planes use the viewer's serif plane letter, coloured like the slice panels. */
export const PlaneGlyph = ({ letter }: { letter: PlaneLetter }) => (
  <span aria-hidden="true" className={`pmv-vc-plane pmv-vc-plane--${letter}`}>
    {letter}
  </span>
);

const ICONS: Record<ActionId, (p: IconProps) => React.ReactElement> = {
  pitchUp: PitchUpIcon,
  pitchDown: PitchDownIcon,
  yawLeft: YawLeftIcon,
  yawRight: YawRightIcon,
  rollCcw: RollCcwIcon,
  rollCw: RollCwIcon,
  alignCoronal: () => <PlaneGlyph letter="C" />,
  alignSagittal: () => <PlaneGlyph letter="S" />,
  alignAxial: () => <PlaneGlyph letter="A" />,
  zoomOut: ZoomOutIcon,
  fitToView: FitIcon,
  zoomIn: ZoomInIcon,
  resetView: ResetIcon,
  togglePanel: KeyboardIcon,
  openShortcuts: SettingsIcon,
};

export function ActionIcon({ id, size }: { id: ActionId; size?: number }) {
  const Icon = ICONS[id];
  return <Icon size={size} />;
}
