import {
  type RenderPreset,
  VolumeShader,
  buildTransferFunction,
} from '@/lib/volume/three-preview/volume-shader';
import type { PreparedVolumeFor3D } from '@/types';
import * as THREE from 'three';

// ── Volume texture ─────────────────────────────────────────────────────────

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

// ── Material ───────────────────────────────────────────────────────────────

export function buildMaterial(
  texture: THREE.Data3DTexture,
  colormap: THREE.DataTexture,
  prepared: PreparedVolumeFor3D,
  preset: RenderPreset = 'mip',
): THREE.ShaderMaterial {
  const [w, h, d] = prepared.dims;

  const uniforms: Record<string, THREE.IUniform> = {
    u_data: { value: texture },
    u_cmdata: { value: colormap },
    u_size: { value: new THREE.Vector3(w, h, d) },
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
    /** 0 = no shading, 1 = Phong — on by default for DVR depth cues. */
    u_shading: { value: 1 },
    /** 0 = off, 1 = clip active plane (hide camera-side half). */
    u_clipMode: { value: 0 },
  };

  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VolumeShader.vertexShader,
    fragmentShader: VolumeShader.fragmentShader,
    side: THREE.BackSide,
  });
}

// ── VolumeObject ───────────────────────────────────────────────────────────

export interface VolumeObject {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  texture: THREE.Data3DTexture;
  colormap: THREE.DataTexture;
  /** World-space bounding box edge lengths. */
  size: THREE.Vector3;
}

export function buildVolumeMesh(
  prepared: PreparedVolumeFor3D,
  preset: RenderPreset = 'mip',
): VolumeObject {
  const [w, h, d] = prepared.dims;
  const [sx, sy, sz] = prepared.spacing;
  const texture = buildTexture(prepared);
  const colormap = buildTransferFunction(preset);
  const material = buildMaterial(texture, colormap, prepared, preset);

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
    size: new THREE.Vector3(w * sx, h * sy, d * sz),
  };
}

export function disposeVolumeObject(v: VolumeObject): void {
  v.mesh.geometry.dispose();
  v.material.dispose();
  v.texture.dispose();
  v.colormap.dispose();
}
