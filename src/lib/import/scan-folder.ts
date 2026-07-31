import type { ImportFile, ImportSource } from '@/lib/import/types';

function toImportFile(file: File, path: string): ImportFile {
  const clean = path.replace(/^\.?\//, '');
  // After leading-slash strip `clean` is always non-empty for a real file,
  // so `pop()` returns a string. Fall back to `clean` rather than assert.
  const name = (clean.split('/').pop() ?? clean).toLowerCase();
  return { path: clean, name, file };
}

/** Build a source from a flat FileList (from <input> with webkitdirectory or multiple). */
export function fromFileList(files: FileList | File[]): ImportSource {
  const arr = Array.from(files);
  const rootName =
    arr[0] && 'webkitRelativePath' in arr[0] && (arr[0] as File).webkitRelativePath
      ? (arr[0] as File).webkitRelativePath.split('/')[0]
      : (arr[0]?.name ?? 'volume');
  return {
    rootName,
    files: arr.map((f) => toImportFile(f, (f as File).webkitRelativePath || f.name)),
  };
}

/** Recursively walk a File System Access directory handle. */
export async function fromDirectoryHandle(
  handle: FileSystemDirectoryHandle,
): Promise<ImportSource> {
  const files: ImportFile[] = [];
  async function walk(dir: FileSystemDirectoryHandle, prefix: string) {
    // @ts-expect-error - values() exists at runtime on directory handles
    for await (const entry of dir.values()) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.kind === 'file') {
        const f = await (entry as FileSystemFileHandle).getFile();
        files.push(toImportFile(f, path));
      } else {
        await walk(entry as FileSystemDirectoryHandle, path);
      }
    }
  }
  await walk(handle, '');
  return { rootName: handle.name, files };
}

/**
 * Minimal surface of the FileSystem Entry API. Only the properties used by
 * {@link collectFilesFromEntry} are declared — the full spec is not needed.
 */
export interface FsEntry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file: (cb: (f: File) => void) => void;
  createReader: () => {
    readEntries: (cb: (entries: FsEntry[]) => void) => void;
  };
}

/**
 * Recursively collects File objects from a drag-and-drop FileSystem Entry,
 * stamping each file with a `webkitRelativePath`-compatible relative path.
 */
export async function collectFilesFromEntry(
  entry: FsEntry,
  path: string,
  out: File[],
): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve) => entry.file(resolve));
    Object.defineProperty(file, 'webkitRelativePath', {
      value: path ? `${path}/${file.name}` : file.name,
      configurable: true,
    });
    out.push(file);
    return;
  }

  if (entry.isDirectory) {
    const reader = entry.createReader();
    const readBatch = () => new Promise<FsEntry[]>((resolve) => reader.readEntries(resolve));
    let batch = await readBatch();
    while (batch.length > 0) {
      for (const child of batch) {
        await collectFilesFromEntry(child, path ? `${path}/${child.name}` : child.name, out);
      }
      batch = await readBatch();
    }
  }
}
