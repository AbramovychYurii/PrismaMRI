import type { PreparedVolumeFor3D, RenderPreset } from '@/types';
import * as THREE from 'three';

export type { RenderPreset };

/**
 * One-time low-power device detection at module load.  Used to scale down
 * the cinematic stack on weak hardware (old phones, budget laptops) so the
 * viewer stays usable instead of dropping to <10 fps under the full pass.
 *
 * Heuristic:
 *   • `hardwareConcurrency < 6` → likely 4-core mobile / older budget chip
 *   • `deviceMemory < 4` GB     → low-end Android, very old laptops
 * Either fires → low-power.
 *
 * Fallback `?? 8` on both: when the API is missing (notably Safari does not
 * implement `deviceMemory`), assume the device is capable.  Better to risk
 * a few stutters on a fringe device than to under-render every Safari user.
 *
 * Two consumers:
 *   • `index.ts` uses it to pick RAY_STEPS (384 → 256 on low-power)
 *   • `volume-object.ts` uses it to set initial u_aoEnabled (1 → 0)
 * Combined this is ~3× faster than the full-quality stack on weak hardware,
 * with zero cost on modern Macs / desktops (they all pass the check).
 */
// `deviceMemory` is non-standard (no TS lib type) — declare the optional
// shape inline instead of adding a global ambient module just for this.
const nav = navigator as Navigator & { deviceMemory?: number };
export const isLowPower = (nav.hardwareConcurrency ?? 8) < 6 || (nav.deviceMemory ?? 8) < 4;

/**
 * Build a coarse occupancy grid for empty-space skipping in the DVR ray
 * march.  Each cell of the OCC³ grid stores 255 if ANY voxel inside that
 * cell exceeds a low intensity threshold (≈ air ceiling), else 0.
 *
 * At render time the shader samples this grid for each ray step and, on an
 * empty cell, jumps several steps ahead — air-filled regions (typically
 * 30-60 % of a scan's bounding box) get traversed for free instead of
 * paying a full TF lookup + AO + Phong fetch budget per step.
 *
 * OCC=32 is a sweet spot: the grid is tiny (32 KB texture), each cell
 * covers ~8-16 voxels so skips don't overshoot into tissue, and it builds
 * in <300 ms even for a full-body CT.
 */
export function buildOccupancyGrid(prepared: PreparedVolumeFor3D): THREE.Data3DTexture {
  const [w, h, d] = prepared.dims;
  const OCC = 32;
  // 25/255 ≈ 10 % of the data range — well above true air for both CT
  // (HU≈-1024 is mapped to 0) and MRI (background noise is usually <5 %).
  // Conservative: a few tissue voxels classed as air is invisible; the
  // reverse (skipping past tissue) would leave holes.
  const THRESHOLD = 25;

  const vol = prepared.data as Uint8Array;
  const data = new Uint8Array(OCC * OCC * OCC);

  const sliceStride = w * h;
  const dInv = OCC / d;
  const hInv = OCC / h;
  const wInv = OCC / w;

  for (let oz = 0; oz < OCC; oz++) {
    const z0 = Math.floor(oz / dInv);
    const z1 = Math.min(d, Math.ceil((oz + 1) / dInv));
    for (let oy = 0; oy < OCC; oy++) {
      const y0 = Math.floor(oy / hInv);
      const y1 = Math.min(h, Math.ceil((oy + 1) / hInv));
      for (let ox = 0; ox < OCC; ox++) {
        const x0 = Math.floor(ox / wInv);
        const x1 = Math.min(w, Math.ceil((ox + 1) / wInv));
        let occupied = 0;
        // Tight inner loop — early-out on first occupied voxel.
        outer: for (let z = z0; z < z1; z++) {
          const baseZ = z * sliceStride;
          for (let y = y0; y < y1; y++) {
            const base = baseZ + y * w;
            for (let x = x0; x < x1; x++) {
              if (vol[base + x] >= THRESHOLD) {
                occupied = 255;
                break outer;
              }
            }
          }
        }
        data[oz * OCC * OCC + oy * OCC + ox] = occupied;
      }
    }
  }

  const tex = new THREE.Data3DTexture(data, OCC, OCC, OCC);
  tex.format = THREE.RedFormat;
  tex.type = THREE.UnsignedByteType;
  // NEAREST filter — we want a crisp per-cell empty/occupied flag, not a
  // smoothly-interpolated soft edge that could either over-skip (artifacts)
  // or under-skip (no perf gain).
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

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

/**
 * Build a 256×256 RGBA DataTexture: the pre-integrated transfer function.
 *
 * Each texel LUT[front, back] stores the composited RGBA contribution of a
 * single ray-march segment whose intensity ramps linearly from `front` to
 * `back`.  The 1D TF is numerically integrated front-to-back with K
 * sub-steps per cell, so sharp TF transitions (e.g. Bone preset's
 * transparent→opaque step at i ≈ 0.52) get represented as a smooth gradual
 * contribution instead of an all-or-nothing point sample.
 *
 * This is the standard fix for "wood-ring" banding in DVR with sharp TFs
 * (Engel & Ertl 2001).  At runtime the shader looks up (i_front, i_back)
 * for each step — adjacent rays composite the same TF-integral regardless
 * of where exactly they cross the step threshold, so the banding artifact
 * disappears without per-pixel jitter dithering.
 *
 * Cost: 256² × K = ~2M scalar ops per preset switch (≈50 ms in JS).
 * Memory: 256 KB GPU texture.
 */
export function buildPreIntegratedTF(preset: RenderPreset): THREE.DataTexture {
  const N = 256;
  const K = 32; // integration sub-steps per cell
  // How much of pre-integration's "extra opacity at TF transitions" to
  // keep, relative to the original 1D midpoint-sampled baseline.
  //   1.0 → pure pre-integration: physically correct, more opaque at
  //         transitions, much sharper shadows under AO ("sculptural").
  //   0.0 → pure 1D midpoint sampling: banding returns, but visual
  //         weight matches the pre-Phase-3 baseline.
  //   0.5 → half-fix: most banding gone, brightness/translucency close
  //         to old baseline.
  //   0.3 → mostly 1D look, banding mostly suppressed (sharp threshold
  //         transitions are softened just enough not to band).
  // Applied as a per-cell lerp(alpha_1d, alpha_pre, KEEP), so uniform
  // segments (LUT diagonal where front == back) always match 1D exactly
  // (alpha_pre == alpha_1d there), and only TRANSITION cells move
  // toward the more-opaque pre-integrated value.
  const KEEP = 0.3;

  // Reuse the existing 1D TF generator to get the raw color/alpha data —
  // we never upload this temp texture, just read its CPU-side buffer.
  const tex1d = buildTransferFunction(preset);
  const tf1d = tex1d.image.data as Uint8Array;

  // Pre-convert to floats and compute the per-sub-step alpha that
  // composites back to the original 1D alpha after K sub-steps of a
  // uniform-intensity segment.
  //
  // Standard opacity correction (Beer–Lambert):
  //   1 - (1 - sub_a)^K = tf.a    ⇒    sub_a = 1 - (1 - tf.a)^(1/K)
  //
  // Linear sub_a = tf.a / K (the naïve choice) under-shoots the target
  // alpha because the compositing formula is multiplicative, not additive.
  // That under-shoot makes the whole DVR render look darker than the 1D
  // baseline.  This formula matches the 1D baseline on the LUT diagonal
  // (front == back) and smoothly interpolates everywhere else.
  const invK = 1.0 / K;
  const fr = new Float32Array(N);
  const fg = new Float32Array(N);
  const fb = new Float32Array(N);
  const fa = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    fr[i] = tf1d[i * 4 + 0] / 255;
    fg[i] = tf1d[i * 4 + 1] / 255;
    fb[i] = tf1d[i * 4 + 2] / 255;
    const a1d = tf1d[i * 4 + 3] / 255;
    fa[i] = 1 - (1 - a1d) ** invK;
  }
  tex1d.dispose();

  const data = new Uint8Array(N * N * 4);

  // Row = i_front (v in texture space), col = i_back (u in texture space).
  for (let iF = 0; iF < N; iF++) {
    const rowBase = iF * N * 4;
    for (let iB = 0; iB < N; iB++) {
      const step = (iB - iF) * invK;
      let intensity = iF + step * 0.5; // midpoint of first sub-step
      let accR = 0;
      let accG = 0;
      let accB = 0;
      let accA = 0;
      for (let k = 0; k < K; k++) {
        const idx = intensity < 0 ? 0 : intensity > N - 1 ? N - 1 : intensity | 0;
        const sa = fa[idx];
        const c = (1 - accA) * sa;
        accR += c * fr[idx];
        accG += c * fg[idx];
        accB += c * fb[idx];
        accA += c;
        intensity += step;
      }
      // Selective blend with the 1D midpoint baseline.  Sampling the 1D
      // TF at the segment's midpoint intensity gives the alpha/colour the
      // old renderer would have used for this segment; we lerp toward
      // the pre-integrated value by KEEP.  On the diagonal (front == back),
      // both values are identical so the diagonal still matches 1D exactly.
      const mid = (iF + iB) * 0.5;
      const midIdx = mid < 0 ? 0 : mid > N - 1 ? N - 1 : mid | 0;
      const r1d = fr[midIdx];
      const g1d = fg[midIdx];
      const b1d = fb[midIdx];
      // The midpoint's 1D alpha is the *un-K-scaled* original value.
      const a1d = tf1d[midIdx * 4 + 3] / 255;
      // For colour, the 1D contribution is r1d * a1d (front-to-back blend
      // weighting), matching what compositing one sample with this TF
      // entry would have written into acc.rgb at first-touch.
      const outR = r1d * a1d + (accR - r1d * a1d) * KEEP;
      const outG = g1d * a1d + (accG - g1d * a1d) * KEEP;
      const outB = b1d * a1d + (accB - b1d * a1d) * KEEP;
      const outA = a1d + (accA - a1d) * KEEP;
      const off = rowBase + iB * 4;
      data[off + 0] = Math.min(255, Math.max(0, Math.round(255 * outR)));
      data[off + 1] = Math.min(255, Math.max(0, Math.round(255 * outG)));
      data[off + 2] = Math.min(255, Math.max(0, Math.round(255 * outB)));
      data[off + 3] = Math.min(255, Math.max(0, Math.round(255 * outA)));
    }
  }

  const tex = new THREE.DataTexture(data, N, N);
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
    /** Pre-integrated 2D TF (256×256 RGBA) — used by the DVR compositing
     *  loop so segments with sharp TF transitions don't band. */
    u_cmdataPre: { value: null as THREE.DataTexture | null },
    /** Coarse 32³ occupancy grid for empty-space skipping. */
    u_occupancy: { value: null as THREE.Data3DTexture | null },
    u_size: { value: new THREE.Vector3(1, 1, 1) },
    /** Physical voxel size (mm) — anisotropy correction for gradient/lighting. */
    u_voxelSize: { value: new THREE.Vector3(1, 1, 1) },
    u_clim: { value: new THREE.Vector2(0, 1) },
    /** Ray march steps – reduce during interaction for performance. */
    u_steps: { value: 256 },
    /** 0 = DVR (compositing), 1 = MIP */
    u_mode: { value: 1 },
    /** 0 = no shading, 1 = Phong */
    u_shading: { value: 0 },
    /** 0 = AO disabled (during interaction for perf), 1 = enabled (still frames). */
    u_aoEnabled: { value: 1 },
    /** 0 = key-light shadows disabled, 1 = enabled. */
    u_shadowEnabled: { value: 1 },
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
    uniform sampler2D u_cmdata;     // 1D TF — point-sample (MIP, cut-face)
    uniform sampler2D u_cmdataPre;  // 2D pre-integrated TF — DVR segment composite
    uniform sampler3D u_occupancy;  // 32³ empty-space-skip grid
    uniform vec3      u_size;
    uniform vec3      u_voxelSize;
    uniform vec2      u_clim;
    uniform int       u_steps;
    uniform int       u_mode;
    uniform int       u_shading;
    uniform int       u_aoEnabled;
    uniform int       u_shadowEnabled;
    uniform vec3      u_camVoxel;
    uniform vec3      u_rayDirVox;
    uniform int       u_planeMode;
    uniform int       u_activePlane;
    uniform vec3      u_planePos;
    /** 0 = off, 1 = clip active plane (hide the camera-side half). */
    uniform int       u_clipMode;
    /** +1 = clip positive-axis side, -1 = clip negative-axis side.
     *  Frozen at enable time so the clip direction never jumps while orbiting. */
    uniform float     u_clipDir;

    varying vec3 vVoxelPos;

    // 384 = 256 baseline + 50% extra to absorb the perf savings from
    // empty-space skipping (most rays now skip 30-60 % of their steps).
    #define MAX_STEPS 384

    // ── Cinematic-light shading constants ────────────────────────────────────
    // KEY: fixed "studio key light" direction in voxel space (up + right + front).
    // Per-fragment we mix in a headlight bias toward the view vector so the
    // far side of the volume is never pitch-black — gives a softer, "studio"
    // look closer to what cinematic VRT does (vs the harsh single-sun feel
    // of a fixed Lambertian light).
    const vec3  KEY            = vec3(0.2673, 0.5345, 0.8018);
    const float HEADLIGHT_BIAS = 0.45;
    // Wrap-around lighting: instead of clipping at N·L < 0, falloff is smooth
    // across the terminator — approximates subsurface scattering for tissue,
    // which is a key part of the cinematic look.
    const float WRAP           = 0.40;
    const float KA             = 0.22;
    const float KD             = 0.78;
    const float KS             = 0.22;
    const float SHINE          = 32.0;
    // Pre-tonemap exposure boost — globally brightens the rendered colour
    // before ACES compresses it. 1.65 is the "punchy and bright" setting
    // that compensates for pre-integrated TF + AO darkening relative to
    // the original under-integrated 1D baseline.
    const float EXPOSURE       = 1.65;
    // Ambient occlusion: 4-tap perpendicular-disk sample around the surface
    // normal. A full hemisphere costs 5-6 extra fetches per shaded sample —
    // too much for mobile. The 4-tap disk captures ~80 % of the visual effect
    // (crevices/cavities go dark) at a fixed 4-fetch overhead.
    const float AO_RADIUS      = 2.8;   // voxels
    const float AO_STRENGTH    = 0.22;  // 0 = no AO, 1 = full crush-to-black
    // Fresnel rim — bright edges at silhouette where surface normal turns
    // perpendicular to view direction.  Adds depth to 3-D form, classic
    // cinematic VRT trick.  Cost: 1 pow + 1 add per shaded sample.
    const float FRESNEL_POWER  = 2.5;
    const float FRESNEL_GAIN   = 0.28;
    // Rim/back fill light — weak Lambert from the opposite hemisphere
    // (behind the volume).  Stops the un-lit side from going pitch-black
    // and reads as a subtle outline glow on overhanging features.
    // Cost: 1 dot + 1 add per shaded sample.
    const float RIM_GAIN       = 0.30;
    // Directional volumetric shadows — secondary ray march from each shaded
    // sample toward the key light, accumulating TF opacity.  Geometrically
    // growing stride (×GROWTH per tap): near-field taps are dense so contact
    // shadows stay crisp, far-field taps are sparse so distant occluders
    // cast progressively softer shadows — the volumetric analogue of an
    // area light, at SHADOW_TAPS fetches per shaded sample (~2× the AO disk;
    // the priciest feature in the stack, hence the low-power gate set from
    // volume-object.ts).
    //
    // Deliberately SHORT reach (~19 voxels): these are contact shadows for
    // crevices, tooth gaps and overhangs — not global sun shadows.  A long
    // march would let the whole body occlude the fixed key light and crush
    // every camera-facing surface of the (semi-opaque) Tissue preset to its
    // ambient floor; capping the reach keeps overall brightness while still
    // grounding nearby geometry.
    const int   SHADOW_TAPS     = 8;
    const float SHADOW_OFFSET   = 3.0;  // voxels — skip the sample's own shell
    const float SHADOW_GROWTH   = 1.30; // 8 taps ≈ 19-voxel reach
    const float SHADOW_DENSITY  = 0.45; // per-tap opacity weight
    const float SHADOW_STRENGTH = 0.55; // 0 = no shadows, 1 = full transmittance

    // ── Helpers ──────────────────────────────────────────────────────────────

    float sampleVol(vec3 vox) {
      return texture(u_data, vox / u_size).r;
    }

    // Pseudo-random hash on screen coords — drives ray-origin jitter.
    // Each fragment gets a unique sub-step offset in [0, dt) so adjacent
    // rays start at different depths, eliminating concentric-ring banding.
    float rand(vec2 co) {
      return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
    }

    // Central-difference gradient (voxel units).
    // D=2.5 widens the sampling footprint to smooth normals across the
    // per-pixel ray-start randomisation that jitter introduces — without
    // this, AO amplifies jitter into visible grain on otherwise-smooth
    // surfaces.  Trade-off: very fine surface detail (≤ 2 voxel ridges)
    // gets softened, which is the right side of the trade for cinematic
    // shading where overall form reads better than micro-detail.
    vec3 gradient(vec3 vox) {
      const float D = 2.5;
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

    // Map raw intensity through window/level then 1D TF — single-point sample.
    // Used by MIP (max-intensity then colour) and by cut-face overlays where
    // there is no "previous" intensity to integrate from.
    vec4 sampleTF(float intensity) {
      float mapped = clamp(
        (intensity - u_clim.x) / max(u_clim.y - u_clim.x, 0.0001),
        0.0, 1.0
      );
      return texture(u_cmdata, vec2(mapped, 0.5));
    }

    // Pre-integrated TF lookup: returns the composited RGBA contribution of
    // a ray segment whose intensity ramps from iFront to iBack.
    // The 2D LUT is rows = front, cols = back — texture coords (u, v) =
    // (back, front).  This removes "shell" banding at sharp TF transitions
    // without needing dense ray-stepping.
    vec4 sampleTFSegment(float iFront, float iBack) {
      float span = max(u_clim.y - u_clim.x, 0.0001);
      float u = clamp((iBack  - u_clim.x) / span, 0.0, 1.0);
      float v = clamp((iFront - u_clim.x) / span, 0.0, 1.0);
      return texture(u_cmdataPre, vec2(u, v));
    }

    // Key-light transmittance at vox: 1.0 = fully lit, → 0.0 = occluded.
    // Attenuates diffuse + specular only — ambient, rim and fresnel are
    // environment terms and stay unshadowed, so occluded regions dim toward
    // the "studio fill" level instead of crushing to black.
    float shadowTransmittance(vec3 vox, vec3 L) {
      float trans = 1.0;
      float dist  = SHADOW_OFFSET;
      for (int s = 0; s < SHADOW_TAPS; s++) {
        vec3 p = vox + L * dist;
        if (any(lessThan(p, vec3(0.0))) || any(greaterThan(p, u_size))) break;
        // Clipped-away tissue must not cast shadows onto the cut face.
        // An axis-aligned half-space is crossed at most once per straight
        // ray, so once we enter the hidden half there are no occluders left.
        if (u_clipMode == 1) {
          float pA  = u_activePlane == 0 ? p.y : u_activePlane == 1 ? p.x : p.z;
          float plA = u_activePlane == 0 ? u_planePos.y : u_activePlane == 1 ? u_planePos.x : u_planePos.z;
          if (u_clipDir > 0.0 && pA > plA) break;
          if (u_clipDir < 0.0 && pA < plA) break;
        }
        float a = sampleTF(sampleVol(p)).a;
        trans *= 1.0 - a * SHADOW_DENSITY;
        if (trans < 0.05) break;
        dist *= SHADOW_GROWTH;
      }
      return mix(1.0, trans, SHADOW_STRENGTH);
    }

    // Clip-mode cut face: faint plane tint so the extent is always visible, then
    // real tissue colour on top where the volume has data.
    void blendCutFace(vec3 cutVox, vec3 planeColor, inout vec4 acc) {
      // Always paint a subtle tint — keeps the panel visible even in empty/air regions.
      const float TINT = 0.10;
      float ta = (1.0 - acc.a) * TINT;
      acc.rgb += ta * planeColor; acc.a += ta;
      // Overlay actual tissue on top (only inside volume bounds).
      if (any(lessThan(cutVox, vec3(0.0))) || any(greaterThan(cutVox, u_size))) return;
      vec4 ptf = sampleTF(sampleVol(cutVox));
      if (ptf.a < 0.004) return;
      float contrib = (1.0 - acc.a) * ptf.a;
      acc.rgb += contrib * ptf.rgb;
      acc.a   += contrib;
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

      // Clip mode: always show the cut-face plane regardless of planeMode setting.
      if (u_clipMode == 1) {
        if (u_activePlane == 0) showCor = true;
        else if (u_activePlane == 1) showSag = true;
        else showAxi = true;
      }

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
        float maxI  = 0.0;
        float jitter = rand(gl_FragCoord.xy) * dt;
        for (int i = 0; i < MAX_STEPS; i++) {
          if (i >= u_steps) break;
          vec3 vox = rayOrigin + (tEntry + jitter + (float(i) + 0.5) * dt) * rayDir;
          if (any(lessThan(vox, vec3(0.0))) || any(greaterThan(vox, u_size))) continue;
          // Clip: skip voxels on the frozen clip-direction side of the active plane.
          if (u_clipMode == 1) {
            float voxA  = u_activePlane == 0 ? vox.y  : u_activePlane == 1 ? vox.x  : vox.z;
            float planA = u_activePlane == 0 ? u_planePos.y : u_activePlane == 1 ? u_planePos.x : u_planePos.z;
            if (u_clipDir > 0.0 && voxA > planA) continue;
            if (u_clipDir < 0.0 && voxA < planA) continue;
          }
          maxI = max(maxI, sampleVol(vox));
        }
        bool noTissue = maxI < u_clim.x + 0.001;
        bool anyPlane = tCor < 1.0e8 || tSag < 1.0e8 || tAxi < 1.0e8;
        if (noTissue && !anyPlane) { discard; }

        vec4 col = noTissue ? vec4(0.0) : sampleTF(maxI);
        // Active plane in clip mode gets a subtle tint only (tissue is already visible).
        // Non-active planes and normal mode keep the full accent colour.
        const float P_MIP      = 0.35;
        const float P_MIP_CLIP = 0.08;
        if (tCor < 1.0e8) { float f = (u_clipMode == 1 && u_activePlane == 0) ? P_MIP_CLIP : P_MIP; col.rgb = mix(col.rgb, P_COR, f); col.a = max(col.a, f); }
        if (tSag < 1.0e8) { float f = (u_clipMode == 1 && u_activePlane == 1) ? P_MIP_CLIP : P_MIP; col.rgb = mix(col.rgb, P_SAG, f); col.a = max(col.a, f); }
        if (tAxi < 1.0e8) { float f = (u_clipMode == 1 && u_activePlane == 2) ? P_MIP_CLIP : P_MIP; col.rgb = mix(col.rgb, P_AXI, f); col.a = max(col.a, f); }
        gl_FragColor = col;
        return;
      }

      // ── DVR – front-to-back compositing ──────────────────────────────────
      const float P_ALPHA = 0.45;
      vec4 acc = vec4(0.0);
      bool doneCor = false;
      bool doneSag = false;
      bool doneAxi = false;

      // Jitter + pre-integrated TF together: pre-integrated TF removes the
      // sharp-threshold banding at its source, and jitter additionally
      // decorrelates any residual artifacts (step-boundary alignment on
      // continuous gradients, low ray-step counts) across adjacent pixels.
      // The wider gradient stencil (D=2.5) keeps AO clean despite the
      // per-pixel ray-start differences jitter introduces.
      float tStart = tEntry + rand(gl_FragCoord.xy) * dt;
      // Pre-integrated TF state: intensity at the previous sample's voxel.
      // Starts as 0 (air) for the very first sample; reset to 0 whenever
      // the ray skips a step (out-of-bounds, clip-mode cull) so the next
      // valid sample's segment is read as "from air → tissue", which is
      // the visually correct treatment of a gap in the marched volume.
      float intensityPrev = 0.0;

      for (int i = 0; i < MAX_STEPS; i++) {
        if (i >= u_steps) break;

        float t_lo = tStart + float(i) * dt;
        float t_hi = t_lo + dt;

        // Blend any plane whose intersection t falls within this step interval.
        // Active plane in clip mode → real tissue cross-section (tint + sample).
        // Every other plane (including non-active in clip mode) → flat accent colour.
        if (!doneCor && tCor >= t_lo && tCor < t_hi) {
          if (u_clipMode == 1 && u_activePlane == 0) { blendCutFace(rayOrigin + tCor * rayDir, P_COR, acc); }
          else { float pa = (1.0 - acc.a) * P_ALPHA; acc.rgb += pa * P_COR; acc.a += pa; }
          doneCor = true;
        }
        if (!doneSag && tSag >= t_lo && tSag < t_hi) {
          if (u_clipMode == 1 && u_activePlane == 1) { blendCutFace(rayOrigin + tSag * rayDir, P_SAG, acc); }
          else { float pa = (1.0 - acc.a) * P_ALPHA; acc.rgb += pa * P_SAG; acc.a += pa; }
          doneSag = true;
        }
        if (!doneAxi && tAxi >= t_lo && tAxi < t_hi) {
          if (u_clipMode == 1 && u_activePlane == 2) { blendCutFace(rayOrigin + tAxi * rayDir, P_AXI, acc); }
          else { float pa = (1.0 - acc.a) * P_ALPHA; acc.rgb += pa * P_AXI; acc.a += pa; }
          doneAxi = true;
        }

        float t   = t_lo + 0.5 * dt;
        vec3  vox = rayOrigin + t * rayDir;
        if (any(lessThan(vox, vec3(0.0))) || any(greaterThan(vox, u_size))) {
          intensityPrev = 0.0; continue;
        }
        // Clip: skip voxels on the frozen clip-direction side of the active plane.
        if (u_clipMode == 1) {
          float voxA  = u_activePlane == 0 ? vox.y  : u_activePlane == 1 ? vox.x  : vox.z;
          float planA = u_activePlane == 0 ? u_planePos.y : u_activePlane == 1 ? u_planePos.x : u_planePos.z;
          if (u_clipDir > 0.0 && voxA > planA) { intensityPrev = 0.0; continue; }
          if (u_clipDir < 0.0 && voxA < planA) { intensityPrev = 0.0; continue; }
        }

        // ── Empty-space skip ───────────────────────────────────────────────
        // Coarse 32³ occupancy grid: if the cell containing this voxel has
        // no tissue above the air threshold, jump several steps ahead.
        // Only skip when no plane intersection is pending within the skip
        // range — otherwise we'd miss the cursor-plane overlay.
        float occ = texture(u_occupancy, vox / u_size).r;
        if (occ < 0.5) {
          intensityPrev = 0.0;
          float skipEnd = t_hi + 3.0 * dt;
          bool planeSafe =
            (doneCor || tCor > 1.0e8 || tCor > skipEnd) &&
            (doneSag || tSag > 1.0e8 || tSag > skipEnd) &&
            (doneAxi || tAxi > 1.0e8 || tAxi > skipEnd);
          if (planeSafe) i += 3;  // loop will increment to i+4
          continue;
        }

        float intensity = sampleVol(vox);
        // Pre-integrated TF: composited contribution of the segment from
        // the previous sample's intensity to this sample's, sampled from
        // the 2D LUT — eliminates banding at sharp TF transitions.
        vec4  tf        = sampleTFSegment(intensityPrev, intensity);
        intensityPrev   = intensity;

        if (tf.a < 0.004) continue;

        vec3  color = tf.rgb;
        float alpha = tf.a;

        // Cinematic-light shading — skip 6-fetch gradient for nearly-transparent voxels
        if (u_shading == 1 && alpha > 0.08) {
          vec3  grad = gradient(vox);
          // Anisotropy correction: gradient is ∂intensity/∂voxel, but a real
          // surface normal lives in physical space. Divide by spacing (mm/vox)
          // so a flat surface lit at an oblique angle isn't visually skewed
          // along the thick axis (typical CT: z spacing ≫ x/y spacing).
          grad /= u_voxelSize;
          float gLen = length(grad);
          if (gLen > 0.003) {
            vec3 N = normalize(grad);
            if (dot(N, V) < 0.0) N = -N;

            // Headlight bias: light direction follows the camera partially.
            // Pure headlight = flat, pure fixed key = harsh; the mix gives form
            // without leaving the far side in shadow.
            vec3 L = normalize(KEY + V * HEADLIGHT_BIAS);

            // Directional volumetric shadow: occluders between this sample
            // and the key light dim its diffuse + specular contribution.
            // Start 2 voxels along N (out of the surface) so a grazing light
            // angle doesn't immediately re-enter the sample's own surface
            // shell and read as full self-shadow.
            float shadow = u_shadowEnabled == 1 ? shadowTransmittance(vox + N * 2.0, L) : 1.0;

            // Wrap-around diffuse: smooth falloff across the terminator,
            // approximates the subsurface look real tissue has under light.
            float NdotL = dot(N, L);
            float diff  = (max(NdotL, -WRAP) + WRAP) / (1.0 + WRAP) * shadow;
            vec3  R     = reflect(-L, N);
            float spec  = pow(max(0.0, dot(R, V)), SHINE) * shadow;

            // ── Ambient occlusion (4-tap perpendicular disk) ─────────────────
            // Skip during interaction (u_aoEnabled = 0) to keep orbit smooth.
            // Build a tangent basis around N, sample density at 4 points on
            // a disk perpendicular to N, slightly tilted inward (-0.3 * N) so
            // we read the volume *behind* the surface — that's what gets dark
            // in real crevices.
            float aoFactor = 1.0;
            if (u_aoEnabled == 1) {
              vec3 T = abs(N.x) < 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
              vec3 B = normalize(cross(N, T));
              T = cross(B, N);
              float occ = 0.0;
              // 4 directions on the disk: 0°, 90°, 180°, 270°
              vec3 d0 = ( T          - N * 0.3) * AO_RADIUS;
              vec3 d1 = ( B          - N * 0.3) * AO_RADIUS;
              vec3 d2 = (-T          - N * 0.3) * AO_RADIUS;
              vec3 d3 = (-B          - N * 0.3) * AO_RADIUS;
              occ += sampleVol(clamp(vox + d0, vec3(0.0), u_size));
              occ += sampleVol(clamp(vox + d1, vec3(0.0), u_size));
              occ += sampleVol(clamp(vox + d2, vec3(0.0), u_size));
              occ += sampleVol(clamp(vox + d3, vec3(0.0), u_size));
              aoFactor = 1.0 - clamp(occ * 0.25, 0.0, 1.0) * AO_STRENGTH;
            }

            // Rim/back fill light: weak Lambert from -KEY direction.
            // Without this, parts of the volume facing away from the key
            // light go pitch-black; with it, they keep a subtle glow that
            // reads as silhouette detail.
            float NdotR = max(0.0, dot(N, -L));
            diff       += NdotR * RIM_GAIN;

            // AO modulates ambient + diffuse but NOT specular — specular
            // highlights are direct reflections off the surface and physically
            // should still pop even in shadowed regions.
            color = color * aoFactor * (KA + KD * diff) + vec3(KS * spec);

            // Fresnel rim — silhouette accent.  Added AFTER AO modulation
            // so it stays bright at edges even in occluded regions (rim
            // light comes from the environment, not the key, so AO of
            // surface crevices doesn't extinguish it).
            float fresnel = pow(1.0 - max(0.0, dot(N, V)), FRESNEL_POWER);
            color += vec3(fresnel * FRESNEL_GAIN);
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

      // ── Tone mapping (DVR only) ───────────────────────────────────────────
      // Apply ACES-approximation film curve to colour. Slight exposure boost
      // first so the curve has highlights to compress, otherwise the in-range
      // linear DVR output (acc.rgb ∈ [0,1]) just gets gently darkened with no
      // perceptible "filmic" feel. MIP is left raw — it's intentionally a
      // clinical-style projection, not a rendered surface.
      vec3 toned = acc.rgb * EXPOSURE;
      toned = (toned * (2.51 * toned + 0.03)) / (toned * (2.43 * toned + 0.59) + 0.14);
      toned = clamp(toned, 0.0, 1.0);

      // 8-bit dithering: triangular noise of amplitude ±1/255 breaks up
      // visible banding in smooth gradients (especially soft AO shadow
      // falloffs) that the 8-bit output buffer would otherwise quantise
      // into stepped contours.  Offset coord so the noise pattern doesn't
      // align with the ray-start jitter.
      float dither = (rand(gl_FragCoord.xy + 0.5) - 0.5) / 255.0;
      toned = clamp(toned + dither, 0.0, 1.0);
      gl_FragColor = vec4(toned, acc.a);
    }
  `,
} as const;
