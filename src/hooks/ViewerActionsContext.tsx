import { useViewerApp } from '@/hooks/useViewerApp';
import { type ReactNode, createContext, useContext, useEffect } from 'react';

type ViewerActions = ReturnType<typeof useViewerApp>;

const Ctx = createContext<ViewerActions | null>(null);

export function ViewerActionsProvider({ children }: { children: ReactNode }) {
  const actions = useViewerApp();
  useEffect(() => {
    if (import.meta.env.DEV) {
      (window as unknown as { __prismaActions?: ViewerActions }).__prismaActions = actions;
    }
  }, [actions]);
  return <Ctx.Provider value={actions}>{children}</Ctx.Provider>;
}

export function useViewerActions(): ViewerActions {
  const v = useContext(Ctx);
  if (!v) throw new Error('useViewerActions must be used within ViewerActionsProvider');
  return v;
}
