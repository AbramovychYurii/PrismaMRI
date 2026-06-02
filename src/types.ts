export type Vec3 = [number, number, number];

export type SlicePlane = 'coronal' | 'sagittal' | 'axial';
export type MobileTab = '3d' | 'coronal' | 'sagittal' | 'axial' | 'controls';

export interface SliceWindowLevel {
  window: number;
  level: number;
}

export interface ParsedVolumeMeta {
  studyId?: string;
  acquired?: string;
  protocol?: string;
  scanner?: string;
  modality?: string;
  spacing: Vec3;
  origin: Vec3;
  /** Voxel dimensions in source order [width, height, depth]. */
  dims: Vec3;
  bitsAllocated: number;
  rescaleSlope?: number;
  rescaleIntercept?: number;
}

/**
 * Linear voxel container. Int16 is used for integer sources with no rescale
 * (halves memory vs Float32 on large 16-bit volumes); Float32 otherwise.
 */
export type VoxelArray = Float32Array | Int16Array;

export interface LoadedVolume {
  /** Linear voxel buffer: x fastest, then y, then z. Scalar values post slope/intercept. */
  voxels: VoxelArray;
  meta: ParsedVolumeMeta;
  /** Scalar range after slope/intercept applied. */
  scalarMin: number;
  scalarMax: number;
  /** Default W/L resolved at parse time. */
  windowLevel: SliceWindowLevel;
  formatId: 'dicom' | 'galileos' | 'onevolume' | 'nifti' | 'mha' | 'nrrd';
}

export interface PreparedVolumeFor3D {
  data: Uint8Array;
  /** Texture dims (may be downsampled from meta.dims). */
  dims: Vec3;
  /** World-space spacing for the texture box. */
  spacing: Vec3;
  /** Voxel range for raycaster clim (Uint8). */
  clim: [number, number];
  /** Auto threshold for iso surface, 0..1. */
  threshold: number;
  /** Scalar [lo, hi] the Uint8 texture was quantized over (for W/L → clim). */
  sourceRange: [number, number];
  /** Original full-resolution dims before any downsample (for cursor mapping). */
  sourceDims: Vec3;
}

export interface VolumeCursor {
  x: number;
  y: number;
  z: number;
}

export interface SliceImage {
  width: number;
  height: number;
  /** RGBA Uint8ClampedArray, length = width*height*4. */
  data: Uint8ClampedArray;
}

export interface ViewerSlices {
  coronal: SliceImage | null;
  sagittal: SliceImage | null;
  axial: SliceImage | null;
}

export type ImportStage =
  | 'idle'
  | 'scanning'
  | 'parsing-headers'
  | 'reading-files'
  | 'assembling'
  | 'preparing-3d'
  | 'done'
  | 'error';

export interface ImportProgress {
  stage: ImportStage;
  current: number;
  total: number;
  message: string;
}

export interface ScanFolderEntry {
  /** Posix-style relative path to the folder root. */
  path: string;
  file: File;
}

export interface ScanFolderSource {
  rootName: string;
  entries: ScanFolderEntry[];
}

export type PlanesMode = 'off' | 'active' | 'all';

export interface ToolbarState {
  planes: PlanesMode;
  clip: boolean;
  rail: boolean;
  focus: boolean;
  dock: boolean;
}

export interface MeasurementPoint {
  x: number;
  y: number;
  z: number;
}

export interface ActiveMeasurement {
  from: MeasurementPoint;
  to: MeasurementPoint | null;
  distanceMm: number | null;
}

/** 3-D volume rendering preset. */
export type RenderPreset = 'mip' | 'tissue' | 'bone';

/** Scalar-intensity histogram returned by the volume worker. */
export interface VolumeHistogram {
  bins: Uint32Array;
  min: number;
  max: number;
  count: number;
}

/**
 * Clinical severity of an AI finding — drives the marker colour everywhere
 * (2-D panels and 3-D model) and sort order in the navigator.
 */
export type AnnotationSeverity = 'critical' | 'serious' | 'moderate' | 'comment';

/** A finding placed on the volume by the AI agent. */
export interface AiAnnotation {
  /** Unique ID so React keys are stable. */
  id: string;
  /** Plane the agent was viewing when it placed the marker. */
  plane: SlicePlane;
  /** Horizontal fraction 0–1 from the left edge of the slice canvas. */
  fx: number;
  /** Vertical fraction 0–1 from the top edge of the slice canvas. */
  fy: number;
  /**
   * Full voxel coordinate of the finding — the source of truth for projecting
   * the marker onto the 3-D model and for jump-to navigation. Derived from
   * `plane` + `fx`/`fy` + the cursor position at placement time.
   */
  voxel: VolumeCursor;
  /** Short label rendered next to the marker. */
  label: string;
  /** 1–3 sentence description shown in the summary card. */
  summary?: string;
  /** Clinical severity — determines colour. */
  severity: AnnotationSeverity;
}
