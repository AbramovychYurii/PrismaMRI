import { useCallback, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Exposes PWA installation state and a trigger function.
 *
 * - `canInstall`  — true when the browser has a deferred install prompt ready
 * - `isInstalled` — true when already running as a standalone PWA
 * - `install()`   — shows the native install dialog; resolves with the outcome
 */
export function usePwaInstall() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(
    () => window.matchMedia('(display-mode: standalone)').matches,
  );

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);

    const mq = window.matchMedia('(display-mode: standalone)');
    const onMqChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setIsInstalled(true);
        setPrompt(null);
      }
    };
    mq.addEventListener('change', onMqChange);

    // iOS Safari fires 'appinstalled' when the user adds to Home Screen.
    const onInstalled = () => {
      setIsInstalled(true);
      setPrompt(null);
    };
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      mq.removeEventListener('change', onMqChange);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!prompt) return 'unavailable';
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    setPrompt(null);
    return outcome;
  }, [prompt]);

  return {
    canInstall: prompt !== null,
    isInstalled,
    install,
  };
}
