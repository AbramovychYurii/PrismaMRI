/**
 * sampleReports — pre-recorded AI analysis reports for the curated demo volumes
 * shipped with the app.  Used by the SessionPanel's "Show example AI report"
 * button to demonstrate the agent's output without requiring the user to install
 * the Claude Desktop extension first.
 *
 * Gating:
 *  • Only the volumes listed in SAMPLE_REPORTS are eligible.
 *  • Each key is the `deriveVolumeId(volume)` string of a curated sample file —
 *    matching is exact, so user-imported scans never trigger the button.
 *
 * To add a new demo report:
 *  1. Open the file in the viewer.
 *  2. Copy `volumeStore.getState().activeVolumeId` from the console.
 *  3. Add a new entry below with the recorded annotations array.
 */

import type { AiAnnotation } from '@/types';

/** Annotations recorded for a specific demo volume. */
export interface SampleReport {
  /** Annotations to load when the button is clicked. */
  annotations: Omit<AiAnnotation, 'volumeId'>[];
}

/**
 * Allow-list of demo volume IDs the example report button works for.
 * Keys must match `deriveVolumeId(volume)` exactly.
 */
export const SAMPLE_REPORTS: Record<string, SampleReport> = {
  'nrrd:401x401x201:0.2500x0.2500x0.2500:16:-1992:3699:maxillofacial_cbct.nrrd': {
    annotations: [
      {
        id: '65d3622c-473e-40b1-a6a9-ac8456b53469',
        plane: 'coronal',
        fx: 0.72,
        fy: 0.62,
        voxel: { x: 288, y: 146, z: 76 },
        label: 'Angulated impacted tooth',
        summary:
          'Tooth on the upper left arch (likely canine or first premolar) is positioned at approximately 45° to the normal occlusal axis, with the crown tilted laterally/buccally and the root angled toward the alveolar bone. The tooth lies outside the normal arch alignment, consistent with ectopic eruption secondary to insufficient eruption space (crowding). Visible across multiple slices (coronal 143-151). Top differentials: (1) ectopic/impacted canine — most likely given the steep angulation and lateral displacement, classic for canine impaction; (2) impacted supernumerary tooth — possible but less common; (3) developmental malposition. Recommend orthodontic and oral surgery consultation; without intervention this tooth may damage adjacent root structures, fail to erupt fully, or cause occlusal interference.',
        severity: 'serious',
        confidence: 88,
        sizeMm: 14,
      },
      {
        id: '7bea9328-391c-4592-a8aa-39f2fbe2c132',
        plane: 'axial',
        fx: 0.32,
        fy: 0.18,
        voxel: { x: 128, y: 72, z: 56 },
        label: 'Anterior tooth crowding',
        summary:
          'Anterior tooth in the right upper incisor/canine region shows mild rotation/malposition consistent with slight space insufficiency in the dental arch. Tooth axis is mildly deviated from the smooth arch curve seen with adjacent teeth, suggesting mild crowding rather than significant impaction. No periapical lucency or root resorption visible at this level. This is a minor orthodontic finding — most likely developmental crowding requiring no urgent intervention. Consider orthodontic consultation if cosmetically or functionally bothersome to the patient.',
        severity: 'comment',
        confidence: 68,
      },
      {
        id: 'cffc403e-4d97-4575-ade8-78a1e048cef2',
        plane: 'axial',
        fx: 0.31,
        fy: 0.45,
        voxel: { x: 124, y: 180, z: 104 },
        label: 'Periapical radiolucency',
        summary:
          'Well-defined oval radiolucent zone (~8.75 mm) in the alveolar bone surrounding the apical region of the right maxillary canine/first premolar. Visible across multiple contiguous axial slices (100-110) and corresponding to a defect at the root apex level on coronal and sagittal views. The lesion has well-circumscribed borders with possible mild sclerotic margin, classic for a chronic periapical process. Top differentials: (1) radicular (apical) cyst — most likely given size >5 mm and well-defined borders, typically associated with a non-vital tooth; (2) periapical granuloma — possible, usually smaller (<5 mm) but can be larger; (3) residual cyst — if the tooth has been previously extracted. Clinical correlation needed: vitality testing of the associated tooth, periapical radiograph, and consideration of endodontic treatment vs. apicoectomy vs. extraction depending on tooth condition.',
        severity: 'serious',
        confidence: 78,
        sizeMm: 9,
      },
      {
        id: '690f8fd9-f3b6-403c-bf08-3815ac3149bb',
        plane: 'sagittal',
        fx: 0.58,
        fy: 0.38,
        voxel: { x: 286, y: 232, z: 124 },
        label: 'Partially erupted wisdom tooth',
        summary:
          'Upper left third molar (tooth 28) with crown clearly visible but positioned significantly superior to the occlusal plane of the adjacent erupted molars, indicating arrested or partial eruption. The tooth crown sits at the level of the maxillary sinus floor with a mesioangular orientation. Roots appear partially developed on multiple sagittal slices (visible from ~285 to 291). Classic presentation of partially erupted/impacted upper third molar with insufficient eruption space. Recommend dental review for monitoring; extraction may be considered if symptomatic, associated with pericoronitis, or if the position threatens the adjacent second molar.',
        severity: 'moderate',
        confidence: 85,
        sizeMm: 10,
      },
    ],
  },
};

/** Return the sample report for the given volume id, or null when not allow-listed. */
export function getSampleReport(volumeId: string | null): SampleReport | null {
  if (!volumeId) return null;
  return SAMPLE_REPORTS[volumeId] ?? null;
}
