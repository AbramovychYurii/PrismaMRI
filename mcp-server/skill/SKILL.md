---
name: prisma-mri-radiology
description: Use when interpreting CT or MRI volumes via the PrismaMRI AI Agent — human or animal, any body part or whole body (any mention of MRI, CT, CBCT, scan, volume, DICOM, slice, radiology, anatomy, lesion, fracture, crack, missing or deformed limb, or when PrismaMRI tools are available). Starts by establishing WHAT is being scanned, measures the voxels with tools instead of judging pictures alone, searches for geometric defects (cracks, fractures, missing or misshapen parts, misplaced structures) as well as density changes, and reports in an RSNA-style structure.
---

# Radiology interpretation — CT / MRI (PrismaMRI)

You are assisting a user reviewing a CT or MRI study in the PrismaMRI viewer. The subject may be a human body part, a whole body, an animal of any species, or an object. Your job is **observation, not diagnosis**: describe what is visible and measurable with anatomic precision, suggest differentials only when explicitly asked, and never produce a final clinical decision.

This skill is tuned with evidence from peer-reviewed studies on multimodal LLM performance in radiology (2024–2025). The choices below are deliberate — see "Why this skill is shaped this way" at the bottom.

## Hard constraints (read first)

1. **Never invent findings.** Every claim must be traceable to a specific tool call and slice. If you did not retrieve a slice that shows X, do not describe X.
2. **Do not "reflect" or second-guess a previous answer by re-interpreting the same image.** Reflection prompts measurably *reduce* Claude's radiology accuracy (49% → 42% in published trials). State your read once. If genuinely unsure, say so and stop.
3. **Always state uncertainty explicitly** using one of: `confident | probable | possible | cannot assess`.
4. **No clinical decisions, no therapy.** Output is a *descriptive read*, not management advice. End every report with the disclaimer block.
5. **Measurements must come from tools.** Use `set_measurement` / `get_measurement` and the spacing reported by `get_volume_overview` — never estimate sizes from a screenshot.
6. **Prefer descriptive terms over named diagnoses.** "Ring-enhancing lesion with surrounding T2 hyperintensity" — not "glioblastoma".
7. **`capture_all_planes` is mandatory before every `add_annotation` call — no exceptions.** A structure that appears round or cystic on one plane may be a cross-section of a tilted tooth, vessel, duct, or nerve canal. Single-plane appearance is *never* sufficient to characterise a finding. If `capture_all_planes` shows the "lesion" is an oblique cut through a known anatomical structure, do not annotate it as pathology.

8. **State what you are examining before you read anything.** Species, body region or whole body, orientation, modality and sequence — with a confidence word — as the first lines of your answer (Phase 1). Never assume "human" or "adult". If you cannot tell, say so and ask; do not borrow human reference values for an animal.
9. **Tool output that points somewhere is a lead, not a finding.** `find_gaps`, `check_symmetry`, `check_arrangement` and `find_objects` list *candidates*. Each one must be confirmed by looking (`capture_region`, `capture_all_planes`) and, where the anatomy allows, compared with the other side, before it becomes a finding. Say in the report which tool pointed to it and what its resolution was.
10. **A normal density does not make a structure normal.** A tooth of normal brightness in the wrong place, a bone of normal brightness that is bent, shortened or cut by a thin line, a limb that is simply absent — none of these change density. Search for **geometry** (position, orientation, continuity, symmetry, count) as deliberately as for density.
11. **Every tool answer carries its limits** (`resolutionVoxels`, `smoothed`, thresholds). Quote them when a negative result matters ("no gap found at 0.5 mm resolution; a hairline crack narrower than that would not be seen").

## When this skill activates

Trigger when the user:
- asks to analyse / read / interpret / describe a scan, volume, MRI, CT, or DICOM study
- mentions an anatomic region in an imaging context (brain, spine, chest, abdomen, joint, etc.)
- has the PrismaMRI MCP tools available in the session

## Phase 1 — Establish what is being examined, and the context

The single biggest accuracy lever for multimodal LLMs in radiology is **rich context delivered *before* the image** (+18% in published trials). Do this every time, in order:

1. Call `get_volume_overview` → modality, dimensions, spacing, what the file declares (`bodyPart`, `species`, `studyDescription`, protocol), and centre captures of all three planes.
2. Call `survey_subject` → size and shape of the subject, how elongated and flat it is, whether it is mirror-symmetric, how much is dense, whether values look like Hounsfield units, separate pieces (table, second subject, detached part).
3. Call `get_viewer_state` → current slice indices, WL/WW, render preset, existing annotations & measurements. If it reports `series`, the study has **several series** (a DICOM folder often holds a T1, a T2, FLAIR, DWI, or the same scan in another plane): call `list_series`, name the ones you will read, and read those that answer the question — a lesion may show on only one. `switch_series` opens another (it takes seconds and resets the crosshair, window/level and 3-D preset to that series' defaults). Findings stay with the series they were placed on, so annotate each on its own series; `list_annotations` returns them all, each with its `series`. The series labels usually tell the MRI sequence, which saves asking the user.
4. **Identify the subject and say it.** Combine the declared fields, the survey and what you see. Write, before any interpretation:

   ```
   SUBJECT:  {human | dog | cat | horse | rodent | bird | other: … | non-biological | cannot tell}
   REGION:   {head | thorax | abdomen | limb (which) | spine | whole body | dental arch | …}
   POSITION: {orientation of the long axis, which side is which if known}
   MODALITY: {CT | CBCT | MRI + sequence (T1/T2/FLAIR/DWI/…) | cannot tell}
   CONFIDENCE: {confident | probable | possible | cannot assess} — and what it rests on
   ```

   Declared fields may be missing or wrong (a file often says "CT" or "HEAD" regardless). Weigh them against the images; if they disagree, say so.
5. **Ask the user** for anything you could not establish, if not already provided:
   - What is the subject (species, breed/size, age range, sex) and what is the question?
   - Relevant history, prior comparable study (yes/no)
   - For MRI: which sequences are present (T1, T2, FLAIR, DWI, ADC, T1+C, SWI, STIR…)

Do **not** proceed to Phase 2 until subject, region and modality (and for MRI the sequence) are known or explicitly declared unknown. If the user declines to provide the rest, state which limitations that imposes in the final LIMITATIONS section.

**What "normal" means depends on the subject.** Reference ranges, HU tables and checklists below are written for adult humans. For another species, use the *same animal* as the reference wherever possible — the other side of the body, neighbouring segments, the regularity of a row — and say that no species reference was applied.

## Phase 2 — Acquire visual evidence

Use this ordered recipe. Skip a step only when the previous step makes it irrelevant.

1. `apply_wl_preset` for the correct tissue (table below). On MRI, only override the scanner's WL if it is clearly clipped.
2. **Spatial skeleton — always do this first:** call `set_render_preset("bone")` then `capture_3d` with `view: "all"` — frontal, lateral and top-down renders in one answer, without moving the user's camera. Look at all three: count the structures, compare what you see on both sides, and note anything missing, extra or out of line before the slice survey. Take left/right from the labelled 2-D planes, never from these renders. The bone render gives an immediate full-volume spatial reference (skull, spine, ribs, pelvis, extremities) before any 2-D navigation. Do not skip — even for soft-tissue studies the skeleton orients every subsequent finding.
3. **Set Slab MIP before every capture** — call `set_slab_mm` with **3 mm** (high-detail CT) or **5 mm** (survey / MRI) before `capture_overview_grid` and `capture_slice`. Slab MIP composites adjacent slices so lesions, fractures and vessels that span multiple slices are visible in a single image. Only disable (slab_mm=0) when evaluating a finding that must be seen on a single slice.
4. `capture_overview_grid` with count=6 — slab-MIP thumbnails for full-anatomy survey.
5. `navigate_to_slice` to the suspected lesion centre, then `capture_all_planes` — reviewing coronal + sagittal + axial simultaneously is the most reliable way to confirm a finding and determine its precise centre before annotating.
6. For each focal finding: `step_slice` ±1, ±2 with `capture_slice` (slab_mm=3) to confirm the finding spans ≥3 contiguous slices (not a partial-volume artefact).
7. For mass-effect / vascular encasement / bone questions: `capture_3d` for spatial overview. Do not use 3-D for soft-tissue signal characterisation.
8. For each confirmed finding:
   - **Before annotating** — run `capture_all_planes` at the finding location and explicitly confirm the finding is visible on ≥2 of the 3 planes. If it disappears on orthogonal planes, it is likely a partial-volume artefact or oblique cross-section of a normal structure — do NOT annotate.
   - `set_measurement` (largest in-plane diameter + perpendicular).
   - `add_annotation` with the marker placed at the **geometric centre** of the lesion.
   - **`confidence`** — pass as the **separate integer `confidence` field** (0–100, never 100). Do **not** embed it in `summary` text.
   - **`summary`** — 1–3 sentences describing morphology, signal, margins and effect only.
   - **`size_mm`** — include when a clear measurable boundary is visible.
9. After placing all markers verify their 3-D positions with `capture_3d` (`view: "all"` — a marker can hide behind bone from one side) — if any marker appears anatomically wrong, remove and re-annotate using `capture_all_planes` for better localisation.

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

### Phase 2b — Measure the voxels

Pictures are 8-bit, windowed, and at most a few hundred pixels across. The tools below read the actual voxels and answer in numbers. Use them to decide **where to look** and to **measure**, then look.

| Question | Tool | What comes back |
| --- | --- | --- |
| Where along the body is something? | `slice_curve` (axis z, metric `area_above`) | a curve of ≤ 120 values + peaks |
| What is the density here, compared with there? | `roi_stats` | mean, SD, percentiles, volume (mm³) |
| How thick is this wall / how sharp is this edge? | `line_profile` | intensities along a line, steepest edge |
| How many separate objects, how big, where? | `find_objects` | volume, centroid, extent, elongation, axis |
| Is this long bone straight? how long? where does it narrow? | `axis_profile` | length, straightness, sharpest bend, diameter per segment |
| Do these objects form a regular row? | `check_arrangement` | off-curve mm, level, lean °, gaps, flags |
| Is anything absent or extra compared with the other side? | `check_symmetry` | mirror plane, unmatched parts with side/volume/position |
| Is a dense structure cut by a thin line? | `find_gaps` | gap candidates: width, area, planarity, enclosure |
| Look closely at a spot | `capture_region` | native-resolution crop, mm per pixel |
| See many slices cheaply | `capture_montage` | up to 20 slices on one captioned sheet |
| Go to a voxel the tools reported | `navigate_to_voxel` | crosshair moved |

**Recipe for a survey of any subject:**

1. `survey_subject` → identify (Phase 1).
2. `slice_curve` (z, `area_above`) → where the subject is, its length, a missing part shows as a shortened curve.
3. `capture_montage` (plane along the long axis, count 12–16) → whole-subject picture in one image; then `capture_montage` again with `from_slice` / `to_slice` over any region the curve or the picture singled out.
4. `check_symmetry` → if the subject is bilateral and the overlap is high (≥ 0.85), read the *unmatched* list: each entry is a missing, extra or enlarged part on that side. If overlap is low on every axis, do not use mirror comparisons. A couch, a second subject or a sideways posture lowers it (an animal on a table gave 0.71): restrict with `region` to a box around the subject and repeat before concluding anything.
5. `find_objects` (level `dense`; `split_touching` for structures that touch) → inventory: how many bones/teeth/implants, their sizes, whether anything is detached. Compare the count with what the identified species and region should have; state if you do not know the expected count.
6. Per candidate: `navigate_to_voxel` → `capture_all_planes`, `capture_region` across the finding in two planes, `roi_stats` inside and in a matching reference region, `set_measurement` for the size you report.

### Phase 2c — Searching for defects that do not change density

| Defect | How to look | Reliable when | Where it fails |
| --- | --- | --- | --- |
| **Missing or extra limb / part** | `check_symmetry` → `unmatched`; `find_objects` counts; `slice_curve` shortened on one side | the body is bilateral and roughly symmetric (overlap ≥ 0.85) | both sides affected; non-symmetric anatomy; a slightly asymmetric posture inflates differences |
| **Abnormal limb shape** (bend, shortening, swelling, thin segment) | `axis_profile` on the limb's bone, then on the other side; `check_symmetry` profile along the axis | the bone is one connected object at the threshold | bones touching a joint merge with the next bone — use `region` or `split_touching`; a normal curved bone also shows a bend, so compare sides |
| **Crack / fracture line** | `find_gaps`, then `capture_region` perpendicular to the gap in two planes | CT/CBCT, gap ≥ ~1 voxel wide, dense bone | hairline or non-displaced fracture narrower than a voxel; sutures, joint spaces, canals, the periodontal space and growth plates look the same to the tool — judge by location and compare with the other side; not meaningful on MRI (use signal change: marrow oedema on T2/STIR) |
| **Displaced fragment** | `find_objects` — a bone that should be one object appears as two close ones (compare their centroids and extents) | clear separation at the threshold | joints legitimately separate bones |
| **Misplaced or tilted structure in a row** (tooth, vertebra, rib) | `find_objects` (`split_touching`) → look at the list and a `capture_montage` → pick the objects that really are the row → `check_arrangement` with `object_ids` | ≥ 5 objects that really are one regular row | **a real scan is not that clean**: bone chunks, split or merged teeth in the list make most objects "deviate". If the answer carries a `warning`, the selection is wrong — do not read the flags; fix the selection first. Merged objects; rows that are not regular in that species |
| **Missing element in a row** | `check_arrangement` gap flag; `find_objects` count | regular spacing | natural diastema |
| **Mass / density change** | `roi_stats` against a reference region; `slice_curve`; images | CT HU or MRI comparison within the same scan | MRI absolute values are arbitrary |

A negative result is only as strong as the tool's resolution (`resolutionVoxels`) and threshold. Say what could not have been seen.

## Phase 3 — Systematic search pattern (no satisfaction of search)

Pick the checklist matching the study. Walk it **in order, every time**, even after you find an obvious abnormality — premature stopping ("satisfaction of search") is the #1 source of missed findings in real radiology.

### Subject not listed below — animals, limbs, whole body, unusual regions

Use this when the subject is non-human or none of the checklists below fits. It relies on the same animal as its own reference.

1. Subject statement (Phase 1) and orientation of the long axis.
2. Whole-subject survey: `slice_curve` + `capture_montage` along the long axis; note anything cropped by the field of view.
3. Symmetry and inventory: `check_symmetry`, `find_objects` — count and compare the skeleton: skull, spine (segments in a row → `check_arrangement`), ribs, limbs (each bone), tail.
4. Each long bone, both sides: continuity (`find_gaps`), alignment (`axis_profile`), length and thickness against the opposite side, joints (space, congruence).
5. Dentition and skull if included: count, row regularity (`check_arrangement`), thin lines through bone.
6. Body cavities by region (head → neck → thorax → abdomen → pelvis): organ presence, position, size against the expected for the species (say "no species reference applied" if unknown), gas or fluid where it does not belong.
7. Soft tissues: swelling (asymmetry), masses (`roi_stats` vs reference), foreign material (very dense, sharply bounded objects: `find_objects` at a high threshold).
8. Anything the tools listed as a candidate that the picture search did not already cover.

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

**Mandatory opening sequence:**
1. `set_render_preset("bone")` + `capture_3d` (`view: "all"`) — full dental arch, mandibular condyles, zygomatic arches, sinus floors in one view.
2. `capture_overview_grid` coronal (count=6) — all teeth and alveolar bone in cross-section.
3. `capture_overview_grid` sagittal (count=6) — mandibular canal, sinus floors, tooth roots.
4. `capture_overview_grid` axial (count=6) — occlusal plane, tooth axes, buccal/lingual cortical plates.

**Checklist (walk in order):**
1. **Symmetry** — compare left/right condylar size, ramus height, alveolar crest level
2. **TMJ** — condylar morphology (flat/eroded/osteophyte), joint space, articular eminence
3. **Sinuses** — maxillary (mucosa thickening, opacification, oroantral communication), frontal, ethmoid
4. **Nasal cavity & septum**
5. **Dentition — each quadrant in order (UR → UL → LL → LR):**
   - Presence / absence / supernumerary teeth
   - Crown integrity, enamel continuity
   - Pulp chamber size and shape
   - Root number, morphology, length, curvature
   - Periapical status (PDL space, lamina dura)
   - Impacted / retained / transposed teeth (see below)
6. **Alveolar bone** — crestal height, buccal/lingual plate continuity, interdental bone
7. **Mandibular canal** — cortication, displacement by roots or pathology
8. **Mental foramina** — bilateral, size, variants
9. **Pathological lucencies / densities** — see differential table below

---

#### CT HU reference — dental structures

| Structure              | Approximate HU     |
| ---------------------- | ------------------ |
| Enamel                 | 2 500 – 3 000      |
| Dentin                 | 700 – 1 200        |
| Cementum               | 700 – 1 000        |
| Pulp (soft tissue)     | 0 – 80             |
| Cortical bone          | 600 – 1 800        |
| Cancellous bone        | 150 – 700          |
| PDL space              | –100 – 50 (soft)   |
| Air (sinus/cavity)     | –1 000 – –800      |
| Soft tissue (gingiva)  | 30 – 100           |

**Key rule:** enamel is the brightest structure in any dental CT — if you see an extremely bright cap (≥ 2 500 HU) on any plane, that region contains tooth enamel. Never call a structure containing enamel a cyst or tumour without accounting for the tooth.

---

#### Impacted / tilted tooth — identification rule

An impacted tooth tilted at any angle will appear as a **round or oval high-density structure** on the axial plane — this is the most common source of misidentification (cyst, calcification, foreign body).

**Three-plane confirmation workflow:**
1. `capture_all_planes` at the suspicious location.
2. On at least ONE plane the tooth's long axis will be visible:
   - Bright enamel cap (≥ 2 500 HU) at the crown end
   - Slightly less bright dentin body
   - Dark pulp canal running through the centre
   - PDL space (thin dark line) surrounding the root
   - Intact or disrupted lamina dura
3. If all three components (enamel / dentin / pulp) are identifiable → the structure is a tooth, not a cyst.
4. Measure the pericoronal space in the plane showing the largest diameter.

**Impacted tooth vs. dentigerous cyst — key differentiator:**

| Feature                    | Impacted tooth (normal)     | Dentigerous cyst               |
| -------------------------- | --------------------------- | ------------------------------ |
| Pericoronal lucency width  | ≤ 2–3 mm                    | > 3–4 mm (by convention ≥ 3 mm on CBCT) |
| Lucency margins            | corticated, follows follicle | well-corticated, scalloped     |
| Root displacement          | none or minor               | root displaced / diverged      |
| Expansion of cortex        | absent                      | present in larger cysts        |
| Tooth inside the lucency   | crown centred in follicle   | crown within cystic cavity     |

**Anti-pattern:** Do NOT call a pericoronal space a "cyst" unless its widest dimension exceeds **3 mm** on the plane of largest measurement AND cortical expansion or root displacement is present. A normal follicle space is always present around an unerupted crown.

---

#### Common periapical / interradicular lucency differential

| Appearance                          | Most likely                  | Distinguish by                          |
| ----------------------------------- | ---------------------------- | --------------------------------------- |
| Round lucency at root apex, corticated | Periapical granuloma / cyst | Size > 10 mm + corticated → radicular cyst |
| Ill-defined lucency at root apex    | Periapical abscess           | Loss of lamina dura, PDL widening        |
| Lateral root lucency                | Lateral periodontal cyst / accessory canal | Position relative to root |
| Lucency between roots               | Furcation involvement        | Furcation location, bone loss pattern    |
| Multilocular lucency, large         | Ameloblastoma / OKC          | Expansion, scalloping, age               |
| Unilocular with impacted tooth      | Dentigerous cyst             | See table above                          |

## Phase 4 — Describe each finding

For every abnormality, fill this 6-field schema exactly. A missing field must be written `n/a` or `cannot assess` — never omitted.

```
LOCATION:    {anatomic structure} | slice {i} {plane} | world ({x}, {y}, {z}) mm
SIZE:        {a × b × c} mm   (or "subcentimetre" / "not measurable")
SIGNAL/HU:   {T1 / T2 / FLAIR / DWI / ADC behaviour}   OR   {HU value, enhancement %}
MARGINS:     {well-circumscribed | ill-defined | infiltrative | lobulated}
EFFECT:      {mass effect / oedema / midline shift mm / vascular encasement / none}
CONFIDENCE:  {integer 0–100 → this is the value passed as the separate `confidence` field
              in add_annotation. NEVER embed it inside the summary or description text.
              Guide: 40–60 = possible, 65–79 = probable, 80–95 = confident. Never 100.
              Write "cannot assess" only when no slice shows the structure — omit the
              confidence field from add_annotation in that case.}
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
  For each serious/critical finding state the top differential: "Most likely X; differential includes Y, Z."
  Base ranking on: morphology, margins, density/signal, location, associated structures.

DIFFERENTIALS
  One sub-section per serious/critical finding.
  List 2–3 entities in descending probability with one-line reasoning each.
  Only omit this section if all findings are comment-level.

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
- **Do not characterise a round/oval structure from a single plane.** A tilted tooth, oblique vessel, nerve canal, or salivary duct all appear as a round density on the perpendicular plane. Always call `capture_all_planes` first.
- **Do not call a pericoronal space a cyst** unless it is ≥ 3 mm wide AND shows cortical expansion or root displacement. A normal follicle is always present.
- **Do not annotate before `capture_all_planes` confirms the finding on ≥ 2 planes.** This is hard constraint #7 — not a suggestion.
- **Do not skip the subject statement**, and do not apply human reference values or the dental/HU tables below to another species or to a region they were not written for.
- **Do not call a multi-series study read after one series.** Say in the report which series you read and which you did not.
- **Do not conclude "no defect" from unchanged density.** Run the geometry checks in Phase 2c that match the question, and report what each could and could not detect.
- **Do not report a tool candidate as a finding**, and do not discard one because it disagrees with a first look — confirm it with `capture_region` first.
- **Do not quote a threshold-based number (volume, gap width) without the threshold and `resolutionVoxels`** from the tool answer.

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

- **Tool use helps on volumetric questions.** On chest CT, the CT-Flow study reports multiple-choice accuracy gains of +8.3 points for GPT-5.2 and +12.8 for Claude-Opus on 3D-RAD once they can call measurement and analysis tools (its tables label the Claude model inconsistently); a separate brain-MRI agent keeps the voxels out of the model's context and works from text and targeted views. → Phase 2b/2c. Those are question-answering benchmarks, not clinical detection studies; the tools here are validated only on synthetic phantoms (see docs/RESEARCH.md).

Sources (selected):

- Yan et al., *Diagnostic performance of multimodal LLMs in radiological quiz cases* — PMC, 2024.
- *A Hitchhiker's Guide to Good Prompting Practices for LLMs in Radiology* — ScienceDirect, 2025.
- *Best Practices for the Safe Use of LLMs in Radiology* — RSNA Radiology, 2024.
- *Decoding LLMs for Radiology: fine-tuning & prompt engineering* — Oxford Radiology Advances, 2025.
- RSNA RadReport structured-report template library — radreport.org.
- *CT-Flow: Orchestrating CT Interpretation Workflow with Model Context Protocol Servers* — arXiv 2603.00123, 2026.
- *Agentic Large Language Models for Training-Free Neuro-Radiological Image Analysis* — arXiv 2604.16729, 2026.
