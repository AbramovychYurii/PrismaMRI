import { useEffect, useState } from 'react';

const BRIDGE_LOCK = 'prismamri-mcp-bridge';

/**
 * Elects a single tab to own the bridge. The lock is held for the tab's whole
 * lifetime; when the leader closes, the next tab in the queue takes over.
 */
export function useBridgeLeadership(): boolean {
  const [isLeader, setIsLeader] = useState(false);

  useEffect(() => {
    const abort = new AbortController();
    let releaseLock: (() => void) | null = null;
    const heldUntilUnmount = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    if (!('locks' in navigator)) {
      setIsLeader(true);
    } else {
      navigator.locks
        .request(BRIDGE_LOCK, { signal: abort.signal }, async () => {
          setIsLeader(true);
          await heldUntilUnmount;
          setIsLeader(false);
        })
        .catch(() => {
          /* AbortError — unmounted before the lock was granted */
        });
    }

    return () => {
      abort.abort();
      releaseLock?.();
    };
  }, []);

  return isLeader;
}
