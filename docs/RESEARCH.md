# Voxel-level analysis through MCP — research notes

**Question.** An AI agent connected to PrismaMRI used to see a scan only as a handful of 512 px JPEG slices. Can it do better by *measuring the voxels themselves* — and notice defects that do not change density: a tooth in the wrong place, a bent or cracked bone, a limb that is not there?

> **Status: research prototype.** Validated on **synthetic phantoms** only. There is no clinical validation. The tools return *candidates* for a person (or an agent that then looks) to check; none of them diagnoses.

**In short**

- The measuring tools (survey, region statistics, profiles, close-ups, contact sheets) behave sensibly on phantoms and on real scans.
- The candidate-finding tools (cracks, misplaced teeth, missing limbs) work on phantoms. On real scans they need a person or the agent to choose their input and confirm each result.
- Whether the *agent* reads scans better with these tools has not been measured yet.

## 1. Why pictures alone are a weak interface

- A capture is 8-bit and fixed to one window/level, so 12–16 bits of intensity are squeezed into one band chosen in advance.
- It is at most 512 px on the long edge: a 0.3 mm structure in a 300 mm field is a fraction of a pixel.
- Finding something in 300 slices depends on the model's attention. "Looks normal" after scrolling does not show that nothing is there.

Image size is not the limit — a 512 px JPEG costs about 350 tokens ([vision docs](https://platform.claude.com/docs/en/build-with-claude/vision)). What the picture leaves out is.

## 2. Design

The approach follows two published agent frameworks for 3-D imaging: [CT-Flow](https://arxiv.org/html/2603.00123) (MCP tools over a queryable 3-D state) and a [training-free brain-MRI agent](https://arxiv.org/html/2604.16729v1) whose model never receives voxels, only text and pointers.

1. **The voxels stay in the browser tab.** The model sends a question and gets a few lines back, whatever the volume size.
2. **Numbers first, pictures to confirm.** Numeric tools say where to look and how big things are; images are then requested for those places only.
3. **Candidates, not findings.** A tool that points somewhere says how it decided, at what resolution and threshold, and what else would look the same.
4. **State the subject first.** Species, region, orientation and modality are written down before anything is read. Human reference values are not applied to animals; the body is its own reference (other side, neighbours, regularity of a row).
5. **Geometry as well as density.** Position, orientation, continuity, symmetry and count are searched on purpose.

## 3. Tools

All run in the browser (`viewer-core/analysis`, pure functions) and are exposed as MCP tools. Protocol details: [`PROTOCOL.md`](PROTOCOL.md#voxel-analysis). When to use each is in the skill shipped with the extension: [`SKILL.md`](../mcp-server/skill/SKILL.md).

| Tool | Question it answers | How |
| --- | --- | --- |
| `survey_subject` | What is in the volume? | Otsu thresholds, subject mask, principal axes, mirror overlap, declared DICOM fields |
| `roi_stats` | What is the density here, against there? | Mean, SD, percentiles in a sphere or box |
| `line_profile` | How thick is this wall? Where is the edge? | Samples along a line |
| `slice_curve` | Where along the axis is something? | One number per slice |
| `find_objects` | How many separate things, how big, which way? | Connected components; optional splitting of touching objects |
| `axis_profile` | Is this bone straight? Where does it narrow? | Centre line along the long axis, bend angle, diameter |
| `check_arrangement` | Does a row of objects keep its order? | Robust curve through the centroids; offset, lean and spacing of each object |
| `check_symmetry` | What has no counterpart on the other side? | Best mirror plane; what is left after removing the mirror image |
| `find_gaps` | Is dense material cut by a thin line? | Morphological closing; keeps thin, flat gaps with dense material on both faces |
| `capture_region` | Look closely | Crop from the full-resolution slice |
| `capture_montage` | Look at many slices cheaply | Up to 20 captioned slices on one sheet |
| `navigate_to_voxel` | Go there | — |

## 4. Evaluation

### Synthetic phantoms (done)

[`phantoms.ts`](../src/viewer-core/analysis/phantoms.ts) builds volumes whose answer is known exactly: a jaw with eleven teeth, a four-legged body, a bone block with a crack, plus canals, voids and noise as distractors. Run `npm run research` for the tables, or see [`research/results/tool-level.md`](../research/results/tool-level.md).

| Defect | Result |
| --- | --- |
| Crack 0.5–1.5 mm, any angle, noise up to SD 150 HU | Found in nearly all cases; **0 false alarms** on intact bone |
| Crack ≥ 2 mm, aligned with the grid | **Missed** — wider than the default 2 mm search width |
| Crack at noise SD 400 HU | Unreliable: 2 to 7 of 9 runs, depending on width |
| Tooth ≥ 5 mm off the arch, or leaning ≥ 30° | Flagged; no neighbour flagged |
| Tooth 3 mm off the arch, not tilted | **Missed** — below the default threshold |
| Missing tooth | Reported as a gap in the row |
| Missing limb | Found on the correct side; volume ≈ 8 000 of 10 000 mm³ |
| Swelling | Radius 4 mm not seen, 6 mm marginal, 9 mm found — symmetry works on a coarse grid |
| Bent bone | Bend within ~1° of the true value for 10°–40° |

These numbers describe the algorithms on idealised shapes, not their behaviour on real anatomy, noise, metal artefacts or other species.

### Real scans (smoke test, no ground truth)

The tools were run once on the example volumes bundled with the repository. This checks that they run, how long they take, and whether the answers are *sane* — not whether they are right.

- **Maxillofacial CBCT** (401×401×201, 0.25 mm). Survey, symmetry, close-ups and contact sheets gave plausible answers in under a second: mirror plane at x = 199.5 (the centre is 200), overlap 0.90. `find_gaps` took 2.3 s and returned 4 small unverified candidates — in a jaw, exactly what a suture or the periodontal space produces.
- **`find_objects` + `check_arrangement` on the same jaw did not work.** Thresholding gave 46 objects — teeth, fragments of teeth and chunks of bone — and 20 of 45 were flagged. The tool cannot tell which objects are teeth, so the row has to be selected first; it returns a `warning` when more than a quarter of the objects are flagged. The clean phantom result does **not** transfer.
- **Dog CT with an injured paw** (512×512×459, 120 M voxels). Every tool ran in 0.4–1 s on a coarser grid. Whole-volume symmetry was only **0.71**: the couch and the posture dominate. The `region` option exists for this; its effect on this scan was not measured.

### Not done yet

- **Agent level.** The question that matters is whether the agent does better *with* the tools. Plan: the same volumes and questions, the same model, three conditions — (A) captures only, (B) plus the measuring tools, (C) plus the candidate-finding tools — repeated several times. Score the subject, defect location, false findings and measurement error, and check for **anchoring**: does a candidate list make the agent miss what is not on it? This needs paid API runs.
- **Labelled real data.** Candidates: [ToothFairy2](https://zenodo.org/records/10990960) and [ToothFairy3](https://ditto.ing.unimore.it/toothfairy3) (CBCT with individually labelled teeth); a [dog and cat skull CT database](https://communities.springernature.com/posts/unique-digital-dog-and-cat-skull-database) and the [Edinburgh 3-D skeleton scans](https://open.ed.ac.uk/?p=1487) (real animal CT, no defect labels). Not verified here: BraTS, Medical Segmentation Decathlon, LIDC-IDRI, KiTS, RibFrac, VerSe. Check each licence before use. No labelled public set was found for animal fractures or missing limbs.

## 5. Can this reach the goal?

The goal: an agent that works out what it is looking at and finds cracks, fractures, and missing or abnormal limbs, not only density changes.

| Goal | Verdict | Why |
| --- | --- | --- |
| Knowing what it is looking at | Partly | The tools give size, shape, symmetry and declared fields; recognising species or region still rests on the model reading images. Unvalidated. |
| Missing or extra parts | Plausible for bilateral bodies | Fails when both sides are affected or the anatomy is asymmetric; real postures are less symmetric than a phantom. |
| Abnormal limb shape | Measurable, not interpretable alone | Length and bends are computed; whether a bend is abnormal needs the other side or a species norm. |
| Cracks and fractures | Candidates only, CT only | Finds gaps wider than a voxel. Joints, sutures and canals look the same. On MRI a fracture is a signal change, not a gap. |
| Misplaced or tilted structures in a row | Works on clean rows | Touching teeth merged with bone and metal artefact are where it is likeliest to fail. |

So: a useful *screening aid and measuring instrument* is achievable and partly shown on phantoms. A dependable detector across species and anatomies is **not** shown, and nothing here is a basis for a clinical decision.

## 6. Limitations

- **Synthetic ≠ real.** Phantoms are smooth ellipsoids with Gaussian noise. Real scans have beam hardening, metal streaks, partial volume and overlapping anatomy.
- **Thresholds.** Otsu on the histogram is reasonable on CT, fragile on CBCT (not true Hounsfield units) and unsuitable for MRI.
- **Working resolution.** Volumes above ~24 million voxels are analysed on a coarser grid (symmetry always at ≤ 96 voxels per edge), so small structures can be lost. Every result reports `resolutionVoxels`.
- **Main thread.** A large volume can freeze the UI for seconds; the command timeout is 60 s.
- **Untuned defaults.** 2 mm closing, 3 mm off-row, 20° tilt and 0.7 neck ratio were set on the phantoms only.
- **The agent is a second unknown.** A perfect tool list can still be misread, or make the agent stop early. The skill forbids stopping at the list; the agent-level test should check that the rule holds.

## 7. Next steps

1. Run the agent-level test on the phantoms, then on a few real volumes.
2. Move the analysis into a Web Worker, with progress for long operations.
3. Calibrate the thresholds against real labels; report sensitivity and false alarms per scan.
4. Add a species-aware layer (expected counts and proportions) only if there is data to build it from.
5. Fractures on MRI through signal (STIR/T2 oedema) — a separate tool, not an extension of `find_gaps`.
