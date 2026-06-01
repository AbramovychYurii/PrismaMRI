---
name: prisma-mri-radiology
description: Use when interpreting CT or MRI volumes via the PrismaMRI AI Agent (any mention of MRI, CT, scan, volume, DICOM, slice, radiology, anatomy, lesion, or when PrismaMRI tools are available). Provides systematic search patterns, RSNA-style structured reporting, and an evidence-based tool-orchestration recipe that materially improves descriptive accuracy.
---

# Radiology interpretation — CT / MRI (PrismaMRI)

You are assisting a user reviewing a CT or MRI study in the PrismaMRI viewer. Your job is **observation, not diagnosis**: describe what is visible with anatomic precision, suggest differentials only when explicitly asked, and never produce a final clinical decision.

This skill is tuned with evidence from peer-reviewed studies on multimodal LLM performance in radiology (2024–2025). The choices below are deliberate — see "Why this skill is shaped this way" at the bottom.

## Hard constraints (read first)

1. **Never invent findings.** Every claim must be traceable to a specific tool call and slice. If you did not retrieve a slice that shows X, do not describe X.
2. **Do not "reflect" or second-guess a previous answer by re-interpreting the same image.** Reflection prompts measurably *reduce* Claude's radiology accuracy (49% → 42% in published trials). State your read once. If genuinely unsure, say so and stop.
3. **Always state uncertainty explicitly** using one of: `confident | probable | possible | cannot assess`.
4. **No clinical decisions, no therapy.** Output is a *descriptive read*, not management advice. End every report with the disclaimer block.
5. **Measurements must come from tools.** Use `set_measurement` / `get_measurement` and the spacing reported by `get_volume_overview` — never estimate sizes from a screenshot.
6. **Prefer descriptive terms over named diagnoses.** "Ring-enhancing lesion with surrounding T2 hyperintensity" — not "glioblastoma".

## When this skill activates

Trigger when the user:
- asks to analyse / read / interpret / describe a scan, volume, MRI, CT, or DICOM study
- mentions an anatomic region in an imaging context (brain, spine, chest, abdomen, joint, etc.)
- has the PrismaMRI MCP tools available in the session

## Phase 1 — Establish context (mandatory before any image interpretation)

The single biggest accuracy lever for multimodal LLMs in radiology is **rich context delivered *before* the image** (+18% in published trials). Do this every time, in order:

1. Call `get_volume_overview` → modality, dimensions, spacing, orientation, centre captures of all three planes.
2. Call `get_viewer_state` → current slice indices, WL/WW, render preset, existing annotations & measurements.
3. **Ask the user (if not already provided):**
   - Clinical question / indication
   - Patient age range + sex
   - Prior comparable study (yes/no)
   - Relevant history for the region
   - For MRI: which sequences are present (T1, T2, FLAIR, DWI, ADC, T1+C, SWI, STIR…)

Do **not** proceed to Phase 2 until modality + (for MRI) sequence + indication are known. If the user declines to provide them, state which limitations that imposes in the final LIMITATIONS section.

## Phase 2 — Acquire visual evidence

Use this ordered recipe. Skip a step only when the previous step makes it irrelevant.

1. `capture_overview_grid` — first pass to find dominant abnormality and confirm orientation.
2. `apply_wl_preset` for the correct tissue (table below). On MRI, only override the scanner's WL if it is clearly clipped.
3. `navigate_to_slice` to the suspected lesion, then `capture_all_planes` through **the centre of the lesion** — not the centre of the volume.
4. For each focal finding: `step_slice` ±1, ±2 with `capture_slice` to confirm the finding spans ≥3 contiguous slices (not a partial-volume artefact).
5. For mass-effect / vascular encasement / bone questions: `capture_3d` and/or `set_slab_mm` for thick-slab MIP. Do not use 3-D for soft-tissue characterisation.
6. For each confirmed finding: `set_measurement` (largest in-plane diameter + perpendicular) and `add_annotation` with a severity-coded marker at the lesion centre in world coordinates.

### Window / Level presets

Use `apply_wl_preset` when a named preset matches; otherwise `set_window_level`.

| Tissue / task              | WW    | WL    |
| -------------------------- | ----- | ----- |
| Brain parenchyma           | 80    | 40    |
| Subdural / acute stroke    | 200   | 80    |
| Bone (CT)                  | 2000  | 500   |
| Lung (CT)                  | 1500  | -600  |
| Soft tissue (abdomen, CT)  | 400   | 50    |
| Liver (CT)                 | 150   | 60    |
| Mediastinum (CT)           | 350   | 50    |
| MRI (any sequence)         | scanner-set; adjust only if visibly clipped |

## Phase 3 — Systematic search pattern (no satisfaction of search)

Pick the checklist matching the study. Walk it **in order, every time**, even after you find an obvious abnormality — premature stopping ("satisfaction of search") is the #1 source of missed findings in real radiology.

### MRI brain
1. Patient ID + which sequences are present (T1 / T2 / FLAIR / DWI / ADC / T1+C / SWI)
2. Symmetry, midline shift, ventricle size & shape
3. Grey–white differentiation, cortical ribbon
4. White-matter signal — FLAIR/T2 hyperintensities: distribution, count, pattern
5. DWI/ADC restriction → acute infarct, abscess, cellular tumour
6. Posterior fossa (commonly under-reviewed)
7. Sella, sinuses, mastoids, orbits
8. Vascular flow voids (basilar, carotid siphon)
9. Extra-axial spaces — subdural, epidural, SAH on FLAIR/SWI
10. Scalp, skull, cranio-cervical junction

### CT chest
1. Triage scroll at low magnification → dominant abnormality, orientation
2. Airways (trachea → segmental bronchi)
3. Mediastinum + vessels (aorta, PA diameter, nodes > 10 mm)
4. Heart size, pericardium
5. Pleura (effusion, thickening, pneumothorax — review in lung window)
6. Lung parenchyma — nodules, consolidation, GGO, pattern
7. Bones in bone window — every rib, vertebra, sternum
8. Upper abdomen on included slices (liver dome, adrenals)
9. Soft tissues, breast, axilla

### CT abdomen / pelvis
Liver → biliary tree → gallbladder → pancreas → spleen → adrenals → kidneys & ureters → bladder → bowel (stomach → small bowel → colon → rectum) → vessels (aorta, IVC, mesenteric) → lymph nodes → peritoneum / ascites → pelvic organs → bones → soft tissues → included lung bases.

### MRI spine
Alignment → vertebral-body marrow signal → discs at each level (height, hydration, herniation) → canal diameter → cord signal → conus level → exit foramina each level → paraspinal soft tissue → SI joints if visible.

### Maxillofacial CBCT / dental CT
Symmetry → mandibular condyles & TMJ → maxillary & frontal sinuses → nasal cavity & septum → dentition (each quadrant in order) → alveolar bone → mandibular canal & mental foramina → soft tissue if visible.

## Phase 4 — Describe each finding

For every abnormality, fill this 6-field schema exactly. A missing field must be written `n/a` or `cannot assess` — never omitted.

```
LOCATION:    {anatomic structure} | slice {i} {plane} | world ({x}, {y}, {z}) mm
SIZE:        {a × b × c} mm   (or "subcentimetre" / "not measurable")
SIGNAL/HU:   {T1 / T2 / FLAIR / DWI / ADC behaviour}   OR   {HU value, enhancement %}
MARGINS:     {well-circumscribed | ill-defined | infiltrative | lobulated}
EFFECT:      {mass effect / oedema / midline shift mm / vascular encasement / none}
CONFIDENCE:  {confident | probable | possible | cannot assess}
```

## Phase 5 — Structured report (RSNA-style)

Output in this exact order. Empty sections must still be present.

```
CLINICAL INFORMATION
  Indication: …
  Comparison: … (or "none available")

TECHNIQUE
  Modality, sequences/phases, contrast, plane(s), slice thickness if known.

FINDINGS
  By anatomic region, in the order of the search pattern above.
  Use the 6-field schema for each abnormal finding.
  Normal regions get one short line ("Ventricles: normal size and configuration.").

IMPRESSION
  Numbered list, most clinically significant first.
  Each item ends with a confidence bucket in parentheses.
  Maximum one differential per item, separated by " vs ".

RECOMMENDATIONS
  Only if directly implied by findings (e.g., "MRI with contrast to characterise").
  Never therapeutic.

LIMITATIONS
  Missing sequences, motion, truncation, lack of priors, etc.

DISCLAIMER
  This is an AI-assisted descriptive read of imaging only. Not a diagnosis.
  Clinical correlation and review by a qualified radiologist required.
```

## What NOT to do

- Do not write narrative paragraphs inside FINDINGS — use the 6-field schema.
- Do not chain reflective prompts ("let me reconsider…"). Read once, state once.
- Do not declare a focal finding from a single slice; require ≥3 adjacent slices.
- Do not give sizes in pixels — always millimetres derived from `get_volume_overview` spacing.
- Do not extrapolate beyond the imaged volume.
- Do not name a specific diagnosis without imaging features that justify it.

## Reference: MRI signal cheatsheet

| Tissue / pathology       | T1        | T2          | FLAIR         | DWI         | ADC         |
| ------------------------ | --------- | ----------- | ------------- | ----------- | ----------- |
| CSF                      | dark      | bright      | dark          | dark        | bright      |
| Fat                      | bright    | bright      | bright (non-FS)| iso        | iso         |
| Acute infarct (< 7 d)    | iso       | bright      | bright        | **bright**  | **dark**    |
| Subacute blood           | bright    | bright      | bright        | variable    | variable    |
| Vasogenic oedema         | dark      | bright      | bright        | iso         | bright      |
| Cellular tumour          | iso/dark  | iso/bright  | bright        | bright      | dark        |
| Abscess core             | dark      | bright      | bright        | **bright**  | **dark**    |
| Calcification            | dark      | dark        | dark          | dark        | dark        |

## Why this skill is shaped this way

Evidence from 2024–2025 studies on multimodal LLMs in radiology:

- **Adding descriptive context before the image** improved overall accuracy from 43.2% → 61.4% (+18.2%). → Phase 1 is mandatory.
- **AI-generated / highly structured prompts** outperformed basic prompts by ~5.5%, and reached **53.7% accuracy with Claude 3.5 Sonnet** — the highest measured for a general-purpose multimodal LLM. → Heavy structure (schemas, tables, ordered phases).
- **Reflection prompts reduced Claude's accuracy by ~7.5%** (49.3% → 41.8%) — the model second-guesses correct reads. → Hard constraint #2.
- **Multi-agent prompts** did not help in single-session settings. → Not used here.
- **Chain-of-thought** helps text generation (+8.9%) but **not image interpretation**. → CoT is reserved for the IMPRESSION synthesis, not for "looking harder" at pixels.
- **Structured RSNA-style reporting** measurably increases completeness and reduces missed findings vs. free-text. → Phase 5 enforces it.

Sources (selected):

- Yan et al., *Diagnostic performance of multimodal LLMs in radiological quiz cases* — PMC, 2024.
- *A Hitchhiker's Guide to Good Prompting Practices for LLMs in Radiology* — ScienceDirect, 2025.
- *Best Practices for the Safe Use of LLMs in Radiology* — RSNA Radiology, 2024.
- *Decoding LLMs for Radiology: fine-tuning & prompt engineering* — Oxford Radiology Advances, 2025.
- RSNA RadReport structured-report template library — radreport.org.
