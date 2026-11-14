import type { SlicePlane } from '../types';
/**
 * The only thing the controls need from the viewer.
 * The 3D viewer implements this (see adapters/three.ts for a Three.js reference);
 * the controls never touch the camera, the scene or Three.js directly.
 */
import type { RotationAxis } from './actions';

export interface ViewState {
  /** Degrees, for the readout only. */
  pitch: number;
  yaw: number;
  roll: number;
  /** 1 = 100 % */
  zoom: number;
}

export interface ViewControlsTarget {
  /** Rotate the volume around a screen-space axis by `degrees` (sign gives direction). */
  rotate(axis: RotationAxis, degrees: number): void;
  /** Orient the 3D view so it looks along the given slice plane's normal. */
  alignToPlane(plane: SlicePlane): void;
  /** Multiply the zoom by `factor` (> 1 zooms in). */
  zoomBy(factor: number): void;
  fitToView(): void;
  resetView(): void;
  /** Optional: feeds the readout. */
  getViewState?(): ViewState;
  /** Optional: call `listener` whenever the view changes (including mouse/touch gestures). */
  subscribe?(listener: () => void): () => void;
  /**
   * Optional: part of the viewport is covered (the phone sheet), in CSS pixels.
   * The viewer keeps the model centred in the part that stays visible.
   */
  setFramingInset?(inset: FramingInset): void;
}

export interface FramingInset {
  bottom: number;
}
