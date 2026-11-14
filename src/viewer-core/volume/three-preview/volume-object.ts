import * as THREE from 'three';
import type { PreparedVolumeFor3D, SlicePlane } from '../../types';
import {
  type RenderPreset,
  VolumeShader,
  buildOccupancyGrid,
  buildPreIntegratedTF,
  buildTransferFunction,
  isLowPower,
} from './volume-shader';

/** Colour of each cursor plane in the 3-D view, as 0xRRGGBB. */
export type PlaneColors = Readonly<Record<SlicePlane, number>>;

/** 0xRRGGBB → the 0..1 channels the shader mixes with, as the hex reads. */
function planeColorUniform(hex: number): THREE.Vector3 {
  return new THREE.Vector3(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
}

/** Re-colours the cursor planes of an existing material. */
export function setPlaneColors(material: THREE.ShaderMaterial, planeColors: PlaneColors): void {
  material.uniforms.u_planeCor.value = planeColorUniform(planeColors.coronal);
  material.uniforms.u_planeSag.value = planeColorUniform(planeColors.sagittal);
  material.uniforms.u_planeAxi.value = planeColorUniform(planeColors.axial);
}

/** Data3DTexture: single-channel Uint8, linear filtering, tight packing. */
export function buildTexture(prepared: PreparedVolumeFor3D): THREE.Data3DTexture {
  const [w, h, d] = prepared.dims;
  const tex = new THREE.Data3DTexture(prepared.data as Uint8Array<ArrayBuffer>, w, h, d);
  tex.format = THREE.RedFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

export function buildMaterial(
  texture: THREE.Data3DTexture,
  colormap: THREE.DataTexture,
  colormapPre: THREE.DataTexture,
  occupancy: THREE.Data3DTexture,
  prepared: PreparedVolumeFor3D,
  preset: RenderPreset,
  planeColors: PlaneColors,
): THREE.ShaderMaterial {
  const [w, h, d] = prepared.dims;

  const uniforms: Record<string, THREE.IUniform> = {
    u_data: { value: texture },
    u_cmdata: { value: colormap },
    u_cmdataPre: { value: colormapPre },
    u_occupancy: { value: occupancy },
    u_size: { value: new THREE.Vector3(w, h, d) },
    /** Physical voxel size (mm) — used to correct gradient for anisotropy.
     *  Without this, surfaces in CTs with non-isotropic spacing (typical:
     *  0.5 × 0.5 × 1.5 mm) get squashed shading along the thick axis. */
    u_voxelSize: { value: new THREE.Vector3(...prepared.spacing) },
    u_clim: { value: new THREE.Vector2(0, 1) },
    u_steps: { value: 256 },
    u_mode: { value: preset === 'mip' ? 1 : 0 },
    u_camVoxel: { value: new THREE.Vector3() },
    u_rayDirVox: { value: new THREE.Vector3(0, 0, -1) },
    /** 0 = off, 1 = active-only, 2 = all three planes. */
    u_planeMode: { value: 0 },
    /** Active plane index: 0 = coronal, 1 = sagittal, 2 = axial. */
    u_activePlane: { value: 0 },
    /** Cursor position in voxel / texture space. */
    u_planePos: { value: new THREE.Vector3() },
    u_planeCor: { value: planeColorUniform(planeColors.coronal) },
    u_planeSag: { value: planeColorUniform(planeColors.sagittal) },
    u_planeAxi: { value: planeColorUniform(planeColors.axial) },
    /** 0 = no shading, 1 = Phong — on by default for DVR depth cues. */
    u_shading: { value: 1 },
    /** 0 = AO disabled, 1 = enabled.  Starts OFF on low-power devices
     *  (old phones / budget laptops) — the 4-tap AO disk is one of the most
     *  expensive features in the cinematic stack and would drop these
     *  devices to single-digit fps. */
    u_aoEnabled: { value: isLowPower ? 0 : 1 },
    /** 0 = key-light shadows disabled, 1 = enabled.  Same low-power gate as
     *  AO: the 8-tap shadow march costs ~2× the AO disk per shaded sample. */
    u_shadowEnabled: { value: isLowPower ? 0 : 1 },
    /** 0 = off, 1 = clip active plane (hide camera-side half). */
    u_clipMode: { value: 0 },
    /** +1 = clip the positive-axis side, -1 = clip the negative-axis side.
     *  Snapped when clip mode is enabled and frozen until next enable/plane change. */
    u_clipDir: { value: 1.0 },
  };

  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VolumeShader.vertexShader,
    fragmentShader: VolumeShader.fragmentShader,
    side: THREE.BackSide,
  });
}

export interface VolumeObject {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  texture: THREE.Data3DTexture;
  colormap: THREE.DataTexture;
  /** 256×256 pre-integrated TF — used by the DVR shader path. */
  colormapPre: THREE.DataTexture;
  /** 32³ occupancy grid for empty-space skipping. */
  occupancy: THREE.Data3DTexture;
  /** World-space bounding box edge lengths. */
  size: THREE.Vector3;
}

export function buildVolumeMesh(
  prepared: PreparedVolumeFor3D,
  preset: RenderPreset,
  planeColors: PlaneColors,
): VolumeObject {
  const [w, h, d] = prepared.dims;
  const [sx, sy, sz] = prepared.spacing;
  const texture = buildTexture(prepared);
  const colormap = buildTransferFunction(preset);
  const colormapPre = buildPreIntegratedTF(preset);
  const occupancy = buildOccupancyGrid(prepared);
  const material = buildMaterial(
    texture,
    colormap,
    colormapPre,
    occupancy,
    prepared,
    preset,
    planeColors,
  );

  // The render box is 10 % larger than the voxel dims (5 % padding each side)
  // so cursor planes extend visibly past the volume boundary.  The centre
  // translation stays the same; volume data is sampled only within [0, dims].
  const PAD = 0.1;
  const geometry = new THREE.BoxGeometry(w * (1 + PAD), h * (1 + PAD), d * (1 + PAD));
  geometry.translate(w / 2 - 0.5, h / 2 - 0.5, d / 2 - 0.5);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.set(sx, sy, sz);

  return {
    mesh,
    material,
    texture,
    colormap,
    colormapPre,
    occupancy,
    size: new THREE.Vector3(w * sx, h * sy, d * sz),
  };
}

export function disposeVolumeObject(v: VolumeObject): void {
  v.mesh.geometry.dispose();
  v.material.dispose();
  v.texture.dispose();
  v.colormap.dispose();
  v.colormapPre.dispose();
  v.occupancy.dispose();
}
