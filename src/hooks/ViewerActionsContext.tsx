import { useViewerApp } from '@/hooks/useViewerApp';
import { type ReactNode, createContext, useContext } from 'react';

type ViewerActions = ReturnType<typeof useViewerApp>;

const Ctx = createContext<ViewerActions | null>(null);

export function ViewerActionsProvider({ children }: { children: ReactNode }) {
  const actions = useViewerApp();
  return <Ctx.Provider value={actions}>{children}</Ctx.Provider>;
}

export function useViewerActions(): ViewerActions {
  const v = useContext(Ctx);
  if (!v) throw new Error('useViewerActions must be used within ViewerActionsProvider');
  return v;
}
