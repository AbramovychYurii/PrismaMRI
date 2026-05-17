import * as THREE from 'three';
import { VolumeRenderShader1 } from 'three/examples/jsm/shaders/VolumeShader.js';
import type { PreparedVolumeFor3D } from '@/types';

/** Data3DTexture: single-channel Uint8, linear filtering, tight packing. */
export function buildTexture(prepared: PreparedVolumeFor3D): THREE.Data3DTexture {
  const [w, h, d] = prepared.dims;
  const tex = new THREE.Data3DTexture(
    prepared.data as Uint8Array<ArrayBuffer>,
    w,
    h,
    d,
  );
  tex.format = THREE.RedFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Warm medical colormap: grayscale luminance ramp `18 + t*237`,
 * alpha ramp `10 + t*245`. Encoded as a 256×1 RGBA texture.
 */
export function buildColormap(): THREE.DataTexture {
  const n = 256;
  const data = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const lum = Math.round(18 + t * 237);
    data[i * 4 + 0] = lum;
    data[i * 4 + 1] = Math.round(lum * 0.97);
    data[i * 4 + 2] = Math.round(lum * 0.88);
    data[i * 4 + 3] = Math.round(10 + t * 245);
  }
  const tex = new THREE.DataTexture(data, n, 1);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export function buildMaterial(
  texture: THREE.Data3DTexture,
  colormap: THREE.DataTexture,
  prepared: PreparedVolumeFor3D,
): THREE.ShaderMaterial {
  const [w, h, d] = prepared.dims;
  const uniforms = THREE.UniformsUtils.clone(VolumeRenderShader1.uniforms);
  uniforms.u_data.value = texture;
  uniforms.u_size.value.set(w, h, d);
  uniforms.u_clim.value.set(0, 1);
  uniforms.u_renderstyle.value = 0; // 0 = MIP
  uniforms.u_renderthreshold.value = prepared.threshold;
  uniforms.u_cmdata.value = colormap;

  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VolumeRenderShader1.vertexShader,
    fragmentShader: VolumeRenderShader1.fragmentShader,
    side: THREE.BackSide,
  });
}

export interface VolumeObject {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  texture: THREE.Data3DTexture;
  colormap: THREE.DataTexture;
  /** World-space bounding box edge lengths. */
  size: THREE.Vector3;
}

export function buildVolumeMesh(prepared: PreparedVolumeFor3D): VolumeObject {
  const [w, h, d] = prepared.dims;
  const [sx, sy, sz] = prepared.spacing;
  const texture = buildTexture(prepared);
  const colormap = buildColormap();
  const material = buildMaterial(texture, colormap, prepared);

  // Geometry stays in voxel space so the shader's u_size stays correct.
  // Physical aspect ratio is applied via mesh.scale — the inverse model
  // matrix in the vertex shader converts world positions back to voxel space
  // for correct texture sampling.
  const geometry = new THREE.BoxGeometry(w, h, d);
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
