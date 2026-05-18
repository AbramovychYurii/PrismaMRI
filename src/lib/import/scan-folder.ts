import type { ImportFile, ImportSource } from '@/lib/import/types';

function toImportFile(file: File, path: string): ImportFile {
  const clean = path.replace(/^\.?\//, '');
  return { path: clean, name: clean.split('/').pop()!.toLowerCase(), file };
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
