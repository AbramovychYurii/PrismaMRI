/**
 * Reference prompt template shown in the SessionPanel's "Prompt example" card.
 *
 * Lives in its own module so the 90-line markdown string doesn't bloat
 * SessionPanel.tsx, and so it can be reused (e.g. copied verbatim, embedded
 * into docs, fed to evals) without dragging in any UI dependencies.
 */

export const EXAMPLE_PROMPT = `Using the PrismaMRI tools, perform a systematic review of the medical volume currently open in the viewer and produce a structured report.

⚠️ Research and educational use only — not a substitute for clinical judgment.

## Core principle: MIP-first, three-plane confirmation before every annotation
**Always use Slab MIP as the default capture mode.** A 3–5 mm slab composites adjacent slices, dramatically improving lesion conspicuity, filling partial-volume gaps, and revealing fine structures (vessels, hairline fractures, subtle cortical breaks) that single slices routinely miss. Drop to a thinner slab or single slice only when you have a specific reason.

**Slab thickness decision ladder:**
- **5 mm MIP** → default for all survey captures and overview grids (maximum sensitivity, fewest missed findings)
- **3 mm MIP** → targeted detail on a known region of interest; use when 5 mm obscures fine margins
- **Single slice (slab_mm=0)** → only for: (a) precise boundary delineation before measuring, or (b) structures < 2 mm where slab averaging degrades them

Set the slab once with \`set_slab_mm\` before each capture group; it persists until you change it.

---

## Step 1 · Volume and spatial context
1. Call \`get_viewer_state\`. If \`volumeLoaded\` is false, stop and ask the user to open a file first.
   Record: modality (CT / MRI / CBCT), dims [W×H×D], voxel spacing in mm. Every size estimate depends on spacing.
2. Call \`set_render_preset "bone"\`, then \`capture_3d\` — this gives the full 3-D spatial skeleton before any 2-D navigation. Use it to understand the global anatomy, identify dominant structures, and orient your slice survey.

## Step 2 · Volume overview and windowing
Call \`get_volume_overview\` — this returns metadata and centre-slice captures of all three planes in one call. These centre slices are your anatomical reference point; no additional navigation needed at this stage.

**Default W/L is usually correct — do not change it unless you have a clear reason.**
The viewer auto-calibrates W/L on load. Only override if images are visibly clipped, washed-out, or flat:
- CT bone / dental / skeletal → \`apply_wl_preset "bone"\`
- CT soft tissue / abdomen → \`apply_wl_preset "soft_tissue"\`
- CT lung → \`apply_wl_preset "lung"\`
- MRI T1 → \`apply_wl_preset "t1"\` · MRI T2/FLAIR → \`apply_wl_preset "t2"\`

**Never call \`set_window_level\` with arbitrary values** — always use named presets or the file default.

## Step 3 · Systematic MIP survey — all three planes
Work plane by plane: **coronal → sagittal → axial**.

For each plane:
1. \`set_slab_mm 5\`
2. \`capture_overview_grid\` count=4 — full-extent screening pass with 5 mm MIP thumbnails.
3. List every region with a potential finding before moving on.
4. For each flagged region: \`navigate_to_slice\` → \`capture_slice\` (slab 5 mm) for detail.
5. If 5 mm obscures fine margins: \`set_slab_mm 3\`, recapture, restore to 5 mm.

After all three planes: cross-check your findings list — does every suspected lesion appear on more than one plane? A structure visible only on one plane is likely an artefact or an oblique cross-section of a normal structure.

## Step 4 · Three-plane confirmation (mandatory before any annotation)

**This step cannot be skipped.** Before calling \`add_annotation\` for any finding:

1. \`navigate_to_slice\` to the finding centre, then **\`capture_all_planes\`** — view the finding simultaneously on coronal, sagittal and axial.
2. Ask yourself:
   - Is the finding visible on **at least 2 of the 3 planes**? If no → do not annotate; it is likely an artefact or partial-volume effect.
   - On each plane where it appears, does the shape and density make sense for the proposed diagnosis?
   - Could this be an **oblique cross-section of a normal structure** — a tilted tooth, vessel, nerve canal, duct, or tendon? A tilted tubular structure always appears round or oval on the perpendicular plane.
3. \`step_slice\` ±1, ±2 with \`capture_slice\` (slab_mm=3) to confirm the finding spans ≥3 contiguous slices.
4. Only after confirming on multiple planes and multiple slices → proceed to annotate.

### Annotating confirmed findings — \`add_annotation\` fields
- **Plane** — use the plane where the finding is most clearly centred and measurable.
- \`fx\` / \`fy\` — geometric centre of the finding (0–1 fraction of image width/height).
- \`severity\`: \`critical\` immediate risk · \`serious\` timely attention · \`moderate\` monitor · \`comment\` incidental
- \`label\` — concise anatomical name, ≤ 5 words
- \`summary\` — 3–5 sentences: (1) morphology + margins, (2) size if measurable, (3) precise location, (4) top 2–3 differentials with one-line reasoning each, (5) clinical relevance. **Do not include "confidence: X%" in summary text.**
- \`confidence\` — integer 0–100 as a **separate field**, never embedded in summary. Never exceed 92 for pathological findings.
- \`size_mm\` — largest in-plane diameter in mm (omit for diffuse or ill-defined findings)

### Differential ranking rule
Rank by: morphology → margins → density/signal → location → associated structures → patient age (if known).
State reasoning explicitly: *"Most likely X because [one feature]; Y is possible if [condition]."*

### Common misidentification traps
- **Round structure on one plane** — may be an oblique cut through a tube (vessel, duct, nerve, root canal, impacted tooth). Always verify on orthogonal planes.
- **Hyperdense rim around a dark centre** — may be cortical bone + cancellous interior, not a cystic wall.
- **Partial-volume at a bone edge** — appears as a soft-tissue density "lesion" adjacent to dense cortex. Check ≥3 slices and orthogonal planes.
- **MIP projection artefact** — a vessel running parallel to the slab can mimic a nodule. Switch to slab_mm=0 on that slice to resolve.

## Step 5 · 3-D spatial verification
After all annotations are placed:
1. \`set_render_preset "bone"\` (skeletal/dental CT) or \`"mip"\` (angiography/airway).
2. \`capture_3d\` — confirm every marker lands at the correct anatomical site.
3. If a marker looks misplaced: remove it, re-examine with \`capture_all_planes\` + slab_mm 3, re-annotate.

## Step 6 · Structured report
Present the final report in this exact structure:

**Technique** — modality, dims, voxel spacing mm, W/L preset applied, slab thickness used.

**Findings** — one paragraph per anatomical region, most-severe first. Each abnormal finding must include: anatomical location (name + approximate voxel coords), size if measurable, morphology, top differential.

**Impression** — 3–5 sentences. Lead with the most clinically significant conclusion. Include confidence levels for critical/serious findings.

**Differentials** — for each serious/critical finding: numbered list with likelihood reasoning.

**Recommendations** — specific next steps: additional sequences or planes, clinical correlation, specialist referral type, urgency (routine / urgent / emergent).`;
