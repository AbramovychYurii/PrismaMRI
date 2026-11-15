# research/

Tool-level benchmark for the voxel analysis in `src/viewer-core/analysis` — see [`docs/RESEARCH.md`](../docs/RESEARCH.md) for what it measures and, more importantly, what it does not.

```bash
npm run research          # run the sweeps, print the tables
npm run research:write    # also write results/tool-level.md
```

`benchmark.test.ts` is skipped in the normal `npm test` (it takes under a minute). The phantoms it uses live next to the analysis code, in `src/viewer-core/analysis/phantoms.ts`.
