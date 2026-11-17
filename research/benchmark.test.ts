/**
 * Tool-level benchmark: how well the analysis finds defects whose answer is
 * known exactly, as the defect gets subtler and the noise louder.
 *
 *   npm run research            # run the sweeps and print the tables
 *   npm run research:write   # also write research/results/tool-level.md
 *
 * Skipped in the normal test run (it takes a while). Synthetic phantoms only:
 * this measures the algorithms, not the clinical usefulness — see docs/RESEARCH.md.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  animalPhantom,
  axisProfile,
  checkArrangement,
  checkSymmetry,
  crackPhantom,
  findGaps,
  jawPhantom,
  labelComponents,
  splitTouching,
  thresholdMask,
} from '@prisma-mri/viewer-core/analysis';
import { describe, expect, it } from 'vitest';

const RUN = process.env.RESEARCH === '1';
const WRITE = process.env.RESEARCH_WRITE === '1';
const report: string[] = [];

function table(title: string, head: string[], rows: (string | number)[][], note?: string) {
  const md = [
    `### ${title}`,
    '',
    `| ${head.join(' | ')} |`,
    `| ${head.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.join(' | ')} |`),
    ...(note ? ['', note] : []),
    '',
  ].join('\n');
  report.push(md);
  console.log(md);
}

describe.skipIf(!RUN)('tool-level benchmark', () => {
  it('cracks: sensitivity by width, angle and noise; false alarms on clean bone', () => {
    const widths = [0.5, 1, 1.5, 2];
    const angles = [0, 25, 45];
    const noises = [0, 150, 400];
    const seeds = [1, 2, 3];
    const rows: (string | number)[][] = [];
    for (const noise of noises) {
      for (const width of widths) {
        const cells: string[] = [];
        for (const angle of angles) {
          let hits = 0;
          for (const seed of seeds) {
            const r = findGaps(
              crackPhantom({
                widthMm: width,
                angleDeg: angle,
                noiseSd: noise,
                seed,
                canal: true,
                void: true,
              }),
            );
            // The crack passes through (25, 20, 25) mm; a hit is a candidate within 12 mm of that point.
            if (
              r.candidates.some(
                (c) =>
                  Math.hypot(
                    c.centroidVoxel[0] * 0.5 - 25,
                    c.centroidVoxel[1] * 0.5 - 20,
                    c.centroidVoxel[2] * 0.5 - 25,
                  ) < 12,
              )
            )
              hits++;
          }
          cells.push(`${hits}/${seeds.length}`);
        }
        rows.push([noise, width, ...cells]);
      }
    }
    table(
      'Cracks — found, by width, angle and noise (3 noise seeds per cell; canal and void present)',
      ['noise SD (HU)', 'width (mm)', ...angles.map((a) => `${a}°`)],
      rows,
      'Widths are nominal: the phantom is voxelised at 0.5 mm, so a 1 mm crack is 2–3 voxels wide. The search closes gaps up to 2 mm.',
    );

    const fp: (string | number)[][] = [];
    for (const noise of noises) {
      let alarms = 0;
      let n = 0;
      for (const seed of [1, 2, 3, 4, 5]) {
        const r = findGaps(crackPhantom({ noiseSd: noise, seed, canal: true, void: true }));
        n++;
        alarms += r.candidates.length;
      }
      fp.push([noise, `${(alarms / n).toFixed(1)} per scan`]);
    }
    table(
      'Cracks — false alarms on intact bone with a canal and a void',
      ['noise SD (HU)', 'candidates'],
      fp,
    );
    expect(rows.length).toBeGreaterThan(0);
  }, 600_000);

  it('teeth: an out-of-row, leaning tooth', () => {
    const rows: (string | number)[][] = [];
    const flaggedAt = (opts: Parameters<typeof jawPhantom>[0], index: number) => {
      const { volume, teeth } = jawPhantom(opts);
      const objects = splitTouching(thresholdMask(volume, { lo: 1000 })).objects;
      const r = checkArrangement(objects, { plane: 'axial' });
      if (!r) return { found: false, falsely: 0 };
      const target = teeth[index];
      // The tooth keeps its place along the arch (x) however far it is moved off it.
      const near = (c: number[]) => Math.abs(c[0] * 0.5 - target[0]) < 2.3;
      const flagged = r.items.filter((i) => i.flags.length > 0);
      const found = flagged.some((i) => near(i.centroidVoxel));
      return { found, falsely: flagged.filter((i) => !near(i.centroidVoxel)).length };
    };
    for (const off of [0, 3, 5, 7]) {
      for (const tilt of [0, 30, 50]) {
        const { found, falsely } = flaggedAt(
          { ectopic: { index: 4, offCurveMm: off, tiltDeg: tilt } },
          4,
        );
        rows.push([
          off,
          tilt,
          off === 0 && tilt === 0 ? '(normal)' : found ? 'flagged' : 'MISSED',
          falsely,
        ]);
      }
    }
    table(
      'Teeth — one tooth displaced and tilted',
      ['off the arch (mm)', 'tilt (°)', 'the tooth', 'other teeth flagged'],
      rows,
      'Row (0, 0) is the normal jaw: any flag there is a false alarm.',
    );
    const missing = flaggedAt({ missing: [5] }, 5);
    table(
      'Teeth — one tooth missing',
      ['case', 'gap reported'],
      [['tooth 6 missing', missing.found || missing.falsely > 0 ? 'yes' : 'no']],
    );
    expect(rows.length).toBeGreaterThan(0);
  }, 600_000);

  it('limbs: missing, bent, swollen', () => {
    const rows: (string | number)[][] = [];
    const intact = checkSymmetry(animalPhantom());
    rows.push(['none (control)', `${intact.dice}`, `${intact.unmatched.length}`, '—']);
    for (const limb of ['frontLeft', 'frontRight', 'hindLeft', 'hindRight'] as const) {
      const r = checkSymmetry(animalPhantom({ missing: [limb] }));
      rows.push([
        `${limb} missing`,
        `${r.dice}`,
        `${r.unmatched.length}`,
        r.unmatched[0] ? `${r.unmatched[0].side}, ${r.unmatched[0].volumeMm3} mm³` : 'nothing',
      ]);
    }
    for (const r of [4, 6, 9]) {
      const s = checkSymmetry(animalPhantom({ swellingMm: r }));
      rows.push([
        `swelling radius ${r} mm`,
        `${s.dice}`,
        `${s.unmatched.length}`,
        s.unmatched[0] ? `${s.unmatched[0].side}, ${s.unmatched[0].volumeMm3} mm³` : 'nothing',
      ]);
    }
    table('Limbs — symmetry report', ['case', 'overlap', 'unmatched parts', 'largest'], rows);

    const bends: (string | number)[][] = [];
    for (const bend of [0, 10, 20, 40]) {
      const v = animalPhantom({ bendHindRightDeg: bend });
      const l = labelComponents(
        thresholdMask(v, { lo: 600, region: { min: [30, 40, 100], max: [50, 129, 124] } }),
        { minVoxels: 30 },
      );
      const p = axisProfile(l, 1);
      bends.push([bend, p?.maxBend ? `${p.maxBend.angleDeg}°` : '—', p ? p.straightness : '—']);
    }
    table(
      'Limbs — bend of the hind-right bone',
      ['true bend (°)', 'measured max bend', 'straightness'],
      bends,
    );
    expect(rows.length).toBeGreaterThan(0);
  }, 600_000);

  it('writes the report', () => {
    if (!WRITE) return;
    mkdirSync('research/results', { recursive: true });
    const header =
      '# Tool-level benchmark\n\nSynthetic phantoms with known defects. Generated by `npm run research:write`; see docs/RESEARCH.md for what this does and does not show.\n\n';
    writeFileSync('research/results/tool-level.md', header + report.join('\n'));
  });
});
