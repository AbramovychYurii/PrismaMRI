# PrismaMRI

A browser-based viewer for volumetric MRI (and compatible studies). All data stays on your device — no cloud, no server upload.

**Live demo:** [https://abramovychyurii.github.io/PrismaMRI/](https://abramovychyurii.github.io/PrismaMRI/)

## Why this project exists

After receiving my own MRI results, I only had a letter with a brief description of my condition and the findings. That was valuable for clinicians, but it did not fully satisfy my curiosity about _what was actually shown on the scans_.

I ran into a situation many patients know well:

- **No easy way to review scans on my own** — viewing the MRI visually without booking a doctor’s appointment was difficult.
- **Limited time during visits** — the doctor rarely had time to go through the images in detail with me.
- **Clunky clinical software UX** — a Windows desktop app focused on **a single plane with a 2D slice**, which is hard to interpret without medical training.

So I built a **simpler way to review results for personal use**: three orthogonal slices at once, a synchronized cursor, and a 3D volume overview — in a normal browser.

> **Important:** PrismaMRI is for **personal exploration and learning**, not a medical device. It **does not diagnose** and **does not replace** a physician’s consultation or an official radiology report.

## Features

- **Three planes at once** — coronal, sagittal, and axial with a synchronized crosshair.
- **3D volume view** — volumetric rendering with slice reference planes.
- **Window / Level** — contrast adjustment for slices and 3D.
- **Local processing** — parsing in a Web Worker; data lives only in browser memory for the session.
- **Folder import or drag-and-drop** — convenient for DICOM series and archives.

## Supported formats

| Format    | Extensions / notes                          |
| --------- | ------------------------------------------- |
| DICOM     | Folder of `.dcm` files (slice series)       |
| NIfTI     | `.nii`, `.nii.gz`                           |
| MetaImage | `.mha`, `.mhd`                              |
| NRRD      | `.nrrd`, `.nhdr`                            |
| ZIP       | Archive containing any of the formats above |

## Example data

Sample volumes are included so you can try the viewer without your own files:

| File                                                                                                 | Description                         | Source                                                                                                                     |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [`examples/maxillofacial_CBCT.nrrd`](examples/maxillofacial_CBCT.nrrd)                               | Maxillofacial CBCT                  | **[Tamas Bistey](https://www.embodi3d.com/)** — [CT scan](https://www.embodi3d.com/files/file/61544-ct-scan/)              |
| [`examples/dog_frontal_thorax_injured_paw_CT.nrrd`](examples/dog_frontal_thorax_injured_paw_CT.nrrd) | Dog frontal thorax CT (injured paw) | **[Gagghi](https://www.embodi3d.com/profile/27661-gagghi/)** — [gomito](https://www.embodi3d.com/files/file/60671-gomito/) |

After `npm run dev`, drag a file onto the import screen or use **Open file**. See [`examples/README.md`](examples/README.md) for details.

## Quick start

**Requirements:** Node.js 18+

```bash
npm install
npm run dev
```

Open the URL printed in the terminal (usually http://localhost:5173).

### Other commands

```bash
npm run build    # production build
npm run preview  # preview production build
npm run lint     # Biome check
npm run typecheck
```

## How to use

1. Start the app and on the import screen **drag a folder** of DICOM files or a study file.
2. Or click **Open folder** / **Open file** (or `⌘O` / `Ctrl+O` for a folder).
3. Click a slice panel to set the active plane; scroll with the mouse wheel or `↑` / `↓` to step through slices.
4. Adjust **Window** and **Level** in the Display panel.
5. Press `Esc` to return to the import screen and load another study.

## Privacy

- Data is **never sent** to a server.
- No analytics or telemetry in the app itself.
- Closing the tab clears the volume from browser memory.

Obtain imaging only through official channels (clinic, PACS, media handoff) and follow local laws on personal health data.

## Tech stack

- [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vitejs.dev/)
- [Three.js](https://threejs.org/) — 3D viewing
- [Zustand](https://github.com/pmndrs/zustand) — UI state
- Web Workers — parsing large volumes

## License

PrismaMRI is released under the [MIT License](LICENSE).
