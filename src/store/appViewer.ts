import * as annotationsStorage from '@/lib/annotationsStorage';
import { createThrottledStorage } from '@/lib/throttledStorage';
import { createViewer } from '@/viewer';

/**
 * The PrismaMRI app's one viewer. UI state goes to sessionStorage — per tab,
 * matching the per-tab IDB volume cache — throttled so 60 Hz drags don't
 * stringify on every frame; findings go to localStorage per volume.
 */
export const appViewer = createViewer({
  persistence: {
    key: 'prisma-mri-ui-state',
    storage: createThrottledStorage(sessionStorage),
  },
  annotationStorage: annotationsStorage,
});
