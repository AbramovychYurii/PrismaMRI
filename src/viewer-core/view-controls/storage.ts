/**
 * Persistence is injected, so the package does not assume localStorage
 * (the host may store settings in a user profile instead).
 */
import { DEFAULT_CONFIG, type ViewControlsConfig, normalizeConfig } from './config';

export interface ConfigStorage {
  load(): unknown;
  save(config: ViewControlsConfig): void;
}

export function localStorageConfigStorage(key = 'prismamri.viewControls'): ConfigStorage {
  return {
    load() {
      try {
        const raw = globalThis.localStorage?.getItem(key);
        return raw ? JSON.parse(raw) : undefined;
      } catch {
        return undefined;
      }
    },
    save(config) {
      try {
        globalThis.localStorage?.setItem(key, JSON.stringify(config));
      } catch {
        // storage full or blocked (private mode): settings simply won't persist
      }
    },
  };
}

export const memoryConfigStorage = (initial?: unknown): ConfigStorage => {
  let value = initial;
  return {
    load: () => value,
    save: (c) => {
      value = c;
    },
  };
};

export const loadConfig = (
  storage: ConfigStorage | undefined,
  base = DEFAULT_CONFIG,
): ViewControlsConfig => normalizeConfig(storage?.load(), base);
