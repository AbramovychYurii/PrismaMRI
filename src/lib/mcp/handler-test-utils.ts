import type { ViewerInstance } from '@prisma-mri/viewer-react';
import type { Handler } from './handler-base';

export interface HandlerResult {
  ok?: unknown;
  error?: string;
}

/** For tests: runs one command and resolves with what the agent would receive. */
export async function runHandler(
  handler: Handler,
  viewer: ViewerInstance,
  action: string,
  msg: Record<string, unknown> = {},
): Promise<HandlerResult> {
  let result: HandlerResult = {};
  await handler({
    msg: { id: '1', action, ...msg },
    ok: (data) => {
      result = { ok: data };
    },
    fail: (error) => {
      result = { error };
    },
    viewer,
  });
  return result;
}
