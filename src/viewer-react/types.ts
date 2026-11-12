import type { PlanesMode } from '@prisma-mri/viewer-core';

/** UI state of one viewer — what its controls show, not what the volume holds. */

/** Active tab on the mobile layout. */
export type MobileTab = '3d' | 'coronal' | 'sagittal' | 'axial' | 'controls';

export interface ToolbarState {
  planes: PlanesMode;
  clip: boolean;
  rail: boolean;
  focus: boolean;
  dock: boolean;
}
