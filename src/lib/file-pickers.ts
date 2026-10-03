/**
 * The browser's own file pickers. A detached <input type=file> is used where
 * the File System Access directory picker is unavailable.
 */

export const IMPORT_ACCEPT = '.dcm,.nii,.gz,.hdr,.img,.nrrd,.nhdr,.mha,.mhd,.raw,.zraw,.zip';

export interface DirPickerWindow {
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
}

export function pickFiles(
  options: { accept?: string; directory?: boolean },
  onPick: (files: FileList) => void,
): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  if (options.accept) input.accept = options.accept;
  if (options.directory) input.webkitdirectory = true;
  input.onchange = () => {
    if (input.files) onPick(input.files);
  };
  input.click();
}
