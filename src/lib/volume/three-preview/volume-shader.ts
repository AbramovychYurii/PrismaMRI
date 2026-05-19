import type { RenderPreset } from '@/types';
import * as THREE from 'three';

export type { RenderPreset };

// ── Transfer-function builders ──────────────────────────────────────────────

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

/**
 * Build a 256×1 RGBA DataTexture used as the transfer function.
 * Index 0 → lowest normalised intensity, index 255 → highest.
 * R/G/B = colour (0-255), A = opacity (0 = transparent, 255 = fully opaque).
 */
export function buildTransferFunction(preset: RenderPreset): THREE.DataTexture {
  const N = 256;
  const data = new Uint8Array(N * 4);

  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;

    switch (preset) {
      // ── MIP – warm grayscale ramp ────────────────────────────────────────
      case 'mip': {
        const lum = Math.round(18 + t * 237);
        r = lum;
        g = Math.round(lum * 0.97);
        b = Math.round(lum * 0.88);
        a = Math.round(10 + t * 245);
        break;
      }

      // ── Tissue – air/water/muscle/fat/marrow segmentation ────────────────
      case 'tissue': {
        if (t < 0.06) {
          // air / background → transparent
          a = 0;
        } else if (t < 0.3) {
          // fluid / dark soft-tissue → cool blue-grey
          const s = (t - 0.06) / (0.3 - 0.06);
          r = Math.round(lerp(65, 145, s));
          g = Math.round(lerp(85, 165, s));
          b = Math.round(lerp(125, 195, s));
          a = Math.round(lerp(12, 90, s));
        } else if (t < 0.58) {
          // muscle / soft tissue → warm red-brown (brighter)
          const s = (t - 0.3) / (0.58 - 0.3);
          r = Math.round(lerp(200, 238, s));
          g = Math.round(lerp(90, 118, s));
          b = Math.round(lerp(65, 75, s));
          a = Math.round(lerp(110, 185, s));
        } else if (t < 0.8) {
          // fat → golden yellow
          const s = (t - 0.58) / (0.8 - 0.58);
          r = Math.round(lerp(240, 252, s));
          g = Math.round(lerp(200, 228, s));
          b = Math.round(lerp(65, 105, s));
          a = Math.round(lerp(195, 235, s));
        } else {
          // bright marrow / dense tissue → cream white
          const s = (t - 0.8) / (1.0 - 0.8);
          r = Math.round(lerp(252, 255, s));
          g = Math.round(lerp(245, 255, s));
          b = Math.round(lerp(220, 245, s));
          a = Math.round(lerp(235, 255, s));
        }
        break;
      }

      // ── Bone – highlight dense bright structures ─────────────────────────
      case 'bone': {
        if (t < 0.52) {
          a = 0; // soft tissue & fluid → transparent
        } else if (t < 0.68) {
          const s = (t - 0.52) / (0.68 - 0.52);
          r = Math.round(lerp(140, 195, s));
          g = Math.round(lerp(170, 220, s));
          b = Math.round(lerp(215, 245, s));
          a = Math.round(lerp(12, 110, s));
        } else {
          const s = (t - 0.68) / (1.0 - 0.68);
          r = Math.round(lerp(195, 255, s));
          g = Math.round(lerp(220, 252, s));
          b = Math.round(lerp(245, 255, s));
          a = Math.round(lerp(110, 255, s));
        }
        break;
      }
    }

    data[i * 4 + 0] = Math.max(0, Math.min(255, Math.round(r)));
    data[i * 4 + 1] = Math.max(0, Math.min(255, Math.round(g)));
    data[i * 4 + 2] = Math.max(0, Math.min(255, Math.round(b)));
    data[i * 4 + 3] = Math.max(0, Math.min(255, Math.round(a)));
  }

  const tex = new THREE.DataTexture(data, N, 1);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

// ── GLSL ───────────────────────────────────────────────────────────────────

export const VolumeShader = {
  uniforms: {
    u_data: { value: null as THREE.Data3DTexture | null },
    u_cmdata: { value: null as THREE.DataTexture | null },
    u_size: { value: new THREE.Vector3(1, 1, 1) },
    u_clim: { value: new THREE.Vector2(0, 1) },
    /** Ray march steps – reduce during interaction for performance. */
    u_steps: { value: 256 },
    /** 0 = DVR (compositing), 1 = MIP */
    u_mode: { value: 1 },
    /** 0 = no shading, 1 = Phong */
    u_shading: { value: 0 },
    /** Camera position in voxel space — updated every frame. */
    u_camVoxel: { value: new THREE.Vector3() },
    /** Camera forward direction in voxel space (normalised) — updated every frame.
     *  Required for correct orthographic (parallel) ray casting. */
    u_rayDirVox: { value: new THREE.Vector3(0, 0, -1) },
    /** 0 = off, 1 = active-only, 2 = all three planes. */
    u_planeMode: { value: 0 },
    /** Active plane index: 0 = coronal, 1 = sagittal, 2 = axial. */
    u_activePlane: { value: 0 },
    /** Cursor position in voxel / texture space (same coords as u_size). */
    u_planePos: { value: new THREE.Vector3() },
  },

  // ── Vertex ────────────────────────────────────────────────────────────────
  vertexShader: /* glsl */ `
    uniform vec3 u_size;
    varying vec3 vVoxelPos;

    void main() {
      vVoxelPos   = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  // ── Fragment ──────────────────────────────────────────────────────────────
  fragmentShader: /* glsl */ `
    precision highp float;
    precision highp sampler3D;

    uniform sampler3D u_data;
    uniform sampler2D u_cmdata;
    uniform vec3      u_size;
    uniform vec2      u_clim;
    uniform int       u_steps;
    uniform int       u_mode;
    uniform int       u_shading;
    uniform vec3      u_camVoxel;
    uniform vec3      u_rayDirVox;
    uniform int       u_planeMode;
    uniform int       u_activePlane;
    uniform vec3      u_planePos;

    varying vec3 vVoxelPos;

    #define MAX_STEPS 256

    // Phong constants (pre-normalised light direction for vec3(1,2,3))
    const vec3  LIGHT  = vec3(0.2673, 0.5345, 0.8018);
    const float KA     = 0.30;
    const float KD     = 0.65;
    const float KS     = 0.20;
    const float SHINE  = 28.0;

    // ── Helpers ──────────────────────────────────────────────────────────────

    float sampleVol(vec3 vox) {
      return texture(u_data, vox / u_size).r;
    }

    // Central-difference gradient (voxel units).
    vec3 gradient(vec3 vox) {
      const float D = 1.5;
      float dx = sampleVol(vox + vec3(D, 0.0, 0.0)) - sampleVol(vox - vec3(D, 0.0, 0.0));
      float dy = sampleVol(vox + vec3(0.0, D, 0.0)) - sampleVol(vox - vec3(0.0, D, 0.0));
      float dz = sampleVol(vox + vec3(0.0, 0.0, D)) - sampleVol(vox - vec3(0.0, 0.0, D));
      return vec3(dx, dy, dz);
    }

    // Slab intersection.  The render box extends 5 % beyond u_size on every
    // side (10 % total) so cursor planes are visible past the volume boundary.
    vec2 hitBox(vec3 ro, vec3 rd) {
      const float P = 0.05;          // 5 % padding each side
      vec3 lo   = -P * u_size;
      vec3 hi   = (1.0 + P) * u_size;
      vec3 inv  = 1.0 / rd;
      vec3 t0   = (lo - ro) * inv;
      vec3 t1   = (hi - ro) * inv;
      vec3 tmin = min(t0, t1);
      vec3 tmax = max(t0, t1);
      return vec2(
        max(max(tmin.x, tmin.y), tmin.z),
        min(min(tmax.x, tmax.y), tmax.z)
      );
    }

    // Map raw intensity through window/level then TF.
    vec4 sampleTF(float intensity) {
      float mapped = clamp(
        (intensity - u_clim.x) / max(u_clim.y - u_clim.x, 0.0001),
        0.0, 1.0
      );
      return texture(u_cmdata, vec2(mapped, 0.5));
    }

    void main() {
      // ── Orthographic ray setup ────────────────────────────────────────────
      // All rays are parallel (same direction). For the back-face fragment at
      // vVoxelPos, the ray that reaches it has:
      //   tAtExit  = signed distance from camera plane to back face along rayDir
      //   rayOrigin = projection of vVoxelPos onto the camera plane (perpendicular
      //               to rayDir passing through u_camVoxel)
      vec3  rayDir   = u_rayDirVox;
      float tAtExit  = dot(vVoxelPos - u_camVoxel, rayDir);
      vec3  rayOrigin = vVoxelPos - rayDir * tAtExit;

      vec2  tb     = hitBox(rayOrigin, rayDir);
      float tEntry = max(0.0, tb.x);
      float tExit  = tAtExit;          // exact back-face distance

      if (tEntry >= tExit) { discard; }

      float dt = (tExit - tEntry) / float(u_steps);

      // View vector for shading: opposite to ray direction (parallel rays)
      vec3 V = -rayDir;

      // ── Plane intersection setup (shared by MIP and DVR) ─────────────────
      // Colours match slice-panel accents (amber / violet / azure)
      const vec3 P_COR = vec3(1.000, 0.710, 0.278);
      const vec3 P_SAG = vec3(0.710, 0.616, 0.820);
      const vec3 P_AXI = vec3(0.510, 0.659, 0.831);

      bool showCor = u_planeMode == 2 || (u_planeMode == 1 && u_activePlane == 0);
      bool showSag = u_planeMode == 2 || (u_planeMode == 1 && u_activePlane == 1);
      bool showAxi = u_planeMode == 2 || (u_planeMode == 1 && u_activePlane == 2);

      // Ray-plane t-values; 1e9 = "no intersection"
      float tCor = 1.0e9;
      float tSag = 1.0e9;
      float tAxi = 1.0e9;
      if (showCor && abs(rayDir.y) > 1.0e-4) {
        float tc = (u_planePos.y - rayOrigin.y) / rayDir.y;
        if (tc > tEntry && tc < tExit) tCor = tc;
      }
      if (showSag && abs(rayDir.x) > 1.0e-4) {
        float tc = (u_planePos.x - rayOrigin.x) / rayDir.x;
        if (tc > tEntry && tc < tExit) tSag = tc;
      }
      if (showAxi && abs(rayDir.z) > 1.0e-4) {
        float tc = (u_planePos.z - rayOrigin.z) / rayDir.z;
        if (tc > tEntry && tc < tExit) tAxi = tc;
      }

      // ── MIP ───────────────────────────────────────────────────────────────
      if (u_mode == 1) {
        float maxI = 0.0;
        for (int i = 0; i < MAX_STEPS; i++) {
          if (i >= u_steps) break;
          vec3 vox = rayOrigin + (tEntry + (float(i) + 0.5) * dt) * rayDir;
          if (any(lessThan(vox, vec3(0.0))) || any(greaterThan(vox, u_size))) continue;
          maxI = max(maxI, sampleVol(vox));
        }
        bool noTissue = maxI < u_clim.x + 0.001;
        bool anyPlane = tCor < 1.0e8 || tSag < 1.0e8 || tAxi < 1.0e8;
        if (noTissue && !anyPlane) { discard; }

        vec4 col = noTissue ? vec4(0.0) : sampleTF(maxI);
        // Blend planes uniformly over MIP (MIP has no depth ordering)
        const float P_MIP = 0.35;
        if (tCor < 1.0e8) { col.rgb = mix(col.rgb, P_COR, P_MIP); col.a = max(col.a, P_MIP); }
        if (tSag < 1.0e8) { col.rgb = mix(col.rgb, P_SAG, P_MIP); col.a = max(col.a, P_MIP); }
        if (tAxi < 1.0e8) { col.rgb = mix(col.rgb, P_AXI, P_MIP); col.a = max(col.a, P_MIP); }
        gl_FragColor = col;
        return;
      }

      // ── DVR – front-to-back compositing ──────────────────────────────────
      const float P_ALPHA = 0.45;
      vec4 acc = vec4(0.0);
      bool doneCor = false;
      bool doneSag = false;
      bool doneAxi = false;

      for (int i = 0; i < MAX_STEPS; i++) {
        if (i >= u_steps) break;

        float t_lo = tEntry + float(i) * dt;
        float t_hi = t_lo + dt;

        // Blend any plane whose intersection t falls within this step interval
        if (!doneCor && tCor >= t_lo && tCor < t_hi) {
          float pa = (1.0 - acc.a) * P_ALPHA;
          acc.rgb += pa * P_COR; acc.a += pa; doneCor = true;
        }
        if (!doneSag && tSag >= t_lo && tSag < t_hi) {
          float pa = (1.0 - acc.a) * P_ALPHA;
          acc.rgb += pa * P_SAG; acc.a += pa; doneSag = true;
        }
        if (!doneAxi && tAxi >= t_lo && tAxi < t_hi) {
          float pa = (1.0 - acc.a) * P_ALPHA;
          acc.rgb += pa * P_AXI; acc.a += pa; doneAxi = true;
        }

        float t   = t_lo + 0.5 * dt;
        vec3  vox = rayOrigin + t * rayDir;
        if (any(lessThan(vox, vec3(0.0))) || any(greaterThan(vox, u_size))) continue;

        float intensity = sampleVol(vox);
        vec4  tf        = sampleTF(intensity);

        if (tf.a < 0.004) continue;

        vec3  color = tf.rgb;
        float alpha = tf.a;

        // Phong shading — skip 6-fetch gradient for nearly-transparent voxels
        if (u_shading == 1 && alpha > 0.08) {
          vec3  grad = gradient(vox);
          float gLen = length(grad);
          if (gLen > 0.003) {
            vec3 N = normalize(grad);
            if (dot(N, V) < 0.0) N = -N;

            float diff  = max(0.0, dot(N, LIGHT));
            vec3  R     = reflect(-LIGHT, N);
            float spec  = pow(max(0.0, dot(R, V)), SHINE);

            color = color * (KA + KD * diff) + vec3(KS * spec);
          }
        }

        // Front-to-back blend
        float contrib = (1.0 - acc.a) * alpha;
        acc.rgb += contrib * color;
        acc.a   += contrib;

        // Early-exit
        if (acc.a > 0.95) break;
      }

      if (acc.a < 0.005) { discard; }
      gl_FragColor = acc;
    }
  `,
} as const;
