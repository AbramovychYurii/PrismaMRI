import {
  type ActionId,
  type ActionSource,
  type ConfigStorage,
  type KeyboardAttachOptions,
  type KeyboardScope,
  type ViewControlsConfig,
  type ViewControlsController,
  type ViewControlsState,
  type ViewControlsTarget,
  createViewControlsController,
} from '@prisma-mri/viewer-core';
import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { type DeepPartial, type ViewControlsMessages, mergeMessages } from './messages';

interface Ctx {
  controller: ViewControlsController;
  messages: ViewControlsMessages;
}

const ViewControlsContext = createContext<Ctx | null>(null);

export interface ViewControlsProviderProps {
  /**
   * The viewer's adapter. May be null until the scene is ready; buttons then do
   * nothing. Leave it undefined when the viewer calls `controller.setTarget` itself.
   */
  target?: ViewControlsTarget | null;
  /**
   * Controlled config (memoise it). Omitted: the stored config, else defaults.
   * Every change the user makes still arrives through `onConfigChange`.
   */
  config?: unknown;
  /** Where the config is kept between visits. Omitted: nowhere. */
  storage?: ConfigStorage;
  onConfigChange?: (config: ViewControlsConfig) => void;
  /** Every dispatched action, for analytics. */
  onAction?: (id: ActionId, source: ActionSource) => void;
  /**
   * Where keydown is listened for: 'document' (default), the viewer element
   * (shortcuts only while focus is inside it), window, or null for none.
   */
  keyboardScope?: 'document' | KeyboardScope | null;
  /** The viewer element — with several viewers on a page, keys go to the focused or hovered one. */
  viewerElement?: HTMLElement | null;
  /** Veto a key, e.g. while a modal of the host is open. */
  shouldHandleKey?: KeyboardAttachOptions['shouldHandle'];
  messages?: DeepPartial<ViewControlsMessages>;
  /** Supply your own controller (e.g. created outside React). */
  controller?: ViewControlsController;
  children: ReactNode;
}

export function ViewControlsProvider(props: ViewControlsProviderProps) {
  // Callbacks change identity freely; the controller is built once and reads the latest.
  const callbacks = useRef({ onAction: props.onAction, onConfigChange: props.onConfigChange });
  callbacks.current = { onAction: props.onAction, onConfigChange: props.onConfigChange };

  const [ownController] = useState(
    () =>
      props.controller ??
      createViewControlsController({
        target: props.target ?? null,
        config: props.config,
        storage: props.storage,
        onConfigChange: (c) => callbacks.current.onConfigChange?.(c),
        onAction: (id, source) => callbacks.current.onAction?.(id, source),
      }),
  );
  const controller = props.controller ?? ownController;

  useEffect(() => {
    if (props.target !== undefined) controller.setTarget(props.target);
  }, [controller, props.target]);

  useEffect(() => {
    if (props.config !== undefined) controller.replaceConfig(props.config, { silent: true });
  }, [controller, props.config]);

  const { keyboardScope = 'document', shouldHandleKey, viewerElement } = props;
  useEffect(() => {
    if (keyboardScope === null) return;
    const scope = keyboardScope === 'document' ? document : keyboardScope;
    return controller.attachKeyboard(scope, {
      shouldHandle: shouldHandleKey,
      element: viewerElement,
    });
  }, [controller, keyboardScope, shouldHandleKey, viewerElement]);

  // Only a controller we built is ours to tear down.
  useEffect(
    () => (props.controller ? undefined : () => ownController.destroy()),
    [ownController, props.controller],
  );

  const messages = useMemo(() => mergeMessages(props.messages), [props.messages]);
  const value = useMemo(() => ({ controller, messages }), [controller, messages]);
  return (
    <ViewControlsContext.Provider value={value}>{props.children}</ViewControlsContext.Provider>
  );
}

function useCtx(): Ctx {
  const ctx = useContext(ViewControlsContext);
  if (!ctx) throw new Error('View controls hooks must be used inside <ViewControlsProvider>.');
  return ctx;
}

/** The controller, or null outside a provider — for host chrome that may render without one. */
export const useOptionalViewControls = (): ViewControlsController | null =>
  useContext(ViewControlsContext)?.controller ?? null;

export const useViewControls = (): ViewControlsController => useCtx().controller;
export const useViewControlsMessages = (): ViewControlsMessages => useCtx().messages;

export function useViewControlsState<T>(selector: (s: ViewControlsState) => T): T {
  const controller = useViewControls();
  return useSyncExternalStore(
    controller.subscribe,
    () => selector(controller.getState()),
    () => selector(controller.getState()),
  );
}
