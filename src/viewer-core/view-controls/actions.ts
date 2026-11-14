/**
 * Every operation the view-controls feature can perform.
 * Framework-agnostic: no React, no DOM, no Three.js in this file.
 */
import type { SlicePlane } from '../types';

export type RotationAxis = 'pitch' | 'yaw' | 'roll';
export type ActionGroup = 'rotate' | 'align' | 'zoom' | 'view' | 'panel';

export const ACTION_IDS = [
  'pitchUp',
  'pitchDown',
  'yawLeft',
  'yawRight',
  'rollCcw',
  'rollCw',
  'alignCoronal',
  'alignSagittal',
  'alignAxial',
  'zoomOut',
  'fitToView',
  'zoomIn',
  'resetView',
  'togglePanel',
  'openShortcuts',
] as const;

export type ActionId = (typeof ACTION_IDS)[number];

export type ActionEffect =
  | { kind: 'rotate'; axis: RotationAxis; direction: 1 | -1 }
  | { kind: 'align'; plane: SlicePlane }
  | { kind: 'zoom'; direction: 1 | -1 }
  | { kind: 'fit' }
  | { kind: 'reset' }
  | { kind: 'togglePanel' }
  | { kind: 'openShortcuts' };

export interface ActionMeta {
  id: ActionId;
  group: ActionGroup;
  effect: ActionEffect;
  /** Holding the key / button repeats the action continuously. */
  repeatable: boolean;
  /** Shift multiplies the step (rotate and zoom only). */
  steppable: boolean;
  /** Shown as a button in the on-screen panel (togglePanel/openShortcuts are panel chrome). */
  inPanel: boolean;
}

const rotate = (id: ActionId, axis: RotationAxis, direction: 1 | -1): ActionMeta => ({
  id,
  group: 'rotate',
  effect: { kind: 'rotate', axis, direction },
  repeatable: true,
  steppable: true,
  inPanel: true,
});

const align = (id: ActionId, plane: SlicePlane): ActionMeta => ({
  id,
  group: 'align',
  effect: { kind: 'align', plane },
  repeatable: false,
  steppable: false,
  inPanel: true,
});

export const ACTIONS: Readonly<Record<ActionId, ActionMeta>> = {
  pitchUp: rotate('pitchUp', 'pitch', 1),
  pitchDown: rotate('pitchDown', 'pitch', -1),
  yawLeft: rotate('yawLeft', 'yaw', -1),
  yawRight: rotate('yawRight', 'yaw', 1),
  rollCcw: rotate('rollCcw', 'roll', -1),
  rollCw: rotate('rollCw', 'roll', 1),
  alignCoronal: align('alignCoronal', 'coronal'),
  alignSagittal: align('alignSagittal', 'sagittal'),
  alignAxial: align('alignAxial', 'axial'),
  zoomOut: {
    id: 'zoomOut',
    group: 'zoom',
    effect: { kind: 'zoom', direction: -1 },
    repeatable: true,
    steppable: true,
    inPanel: true,
  },
  fitToView: {
    id: 'fitToView',
    group: 'zoom',
    effect: { kind: 'fit' },
    repeatable: false,
    steppable: false,
    inPanel: true,
  },
  zoomIn: {
    id: 'zoomIn',
    group: 'zoom',
    effect: { kind: 'zoom', direction: 1 },
    repeatable: true,
    steppable: true,
    inPanel: true,
  },
  resetView: {
    id: 'resetView',
    group: 'view',
    effect: { kind: 'reset' },
    repeatable: false,
    steppable: false,
    inPanel: false,
  },
  togglePanel: {
    id: 'togglePanel',
    group: 'panel',
    effect: { kind: 'togglePanel' },
    repeatable: false,
    steppable: false,
    inPanel: false,
  },
  openShortcuts: {
    id: 'openShortcuts',
    group: 'panel',
    effect: { kind: 'openShortcuts' },
    repeatable: false,
    steppable: false,
    inPanel: false,
  },
};

export const actionsInGroup = (group: ActionGroup): ActionMeta[] =>
  ACTION_IDS.map((id) => ACTIONS[id]).filter((a) => a.group === group);
