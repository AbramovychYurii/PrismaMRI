import { type Annotation, type SlicePlane, sliceNumber } from '@prisma-mri/viewer-core';
import { defaultLabels } from '@prisma-mri/viewer-react';

/** A plane's name as the report prints it, before any upper-casing. */
export const planeName = (plane: SlicePlane): string => defaultLabels.planes[plane].name;

/** The one-based slice number a finding sits on. */
export const sliceNum = (finding: Annotation): number => sliceNumber(finding.voxel, finding.plane);
