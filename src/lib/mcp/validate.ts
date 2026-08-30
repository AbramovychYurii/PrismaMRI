import { isSlicePlane } from '@/constants';
import type { AnnotationSeverity, SlicePlane } from '@/types';
import { SEVERITIES } from './constants';

/**
 * Argument checks for MCP commands.
 *
 * Everything arriving over the socket is `unknown`. The handlers used to cast
 * and hope, so a bad `plane` reached `PLANE_GEOMETRY[undefined]` and the agent
 * was told "Cannot read properties of undefined" — true, and useless to act on.
 *
 * These throw instead. `useMcpBridge` already wraps every handler in a
 * try/catch that turns a thrown Error into a `fail` reply, so a handler stays
 * one expression per argument while the agent gets a sentence naming the
 * field, what it expects, and what it actually sent.
 */

type Args = Record<string, unknown>;

/** Renders a rejected value compactly enough to sit inside an error message. */
function describe(value: unknown): string {
  if (value === undefined) return 'nothing';
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'object') return JSON.stringify(value) ?? String(value);
  return String(value);
}

function reject(key: string, expected: string, got: unknown): never {
  throw new Error(`\`${key}\` must be ${expected} — got ${describe(got)}`);
}

export function requirePlane(args: Args, key = 'plane'): SlicePlane {
  const value = args[key];
  if (typeof value !== 'string' || !isSlicePlane(value)) {
    reject(key, 'one of "coronal", "sagittal", "axial"', value);
  }
  return value;
}

export function requireNumber(args: Args, key: string): number {
  const value = args[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) reject(key, 'a finite number', value);
  return value;
}

/** Absent means "use the default"; present but unusable is still an error. */
export function optionalNumber(args: Args, key: string, fallback: number): number {
  if (args[key] === undefined || args[key] === null) return fallback;
  return requireNumber(args, key);
}

/** A 0–1 image fraction, as produced by the capture the agent is looking at. */
export function requireFraction(args: Args, key: string): number {
  const value = requireNumber(args, key);
  if (value < 0 || value > 1) reject(key, 'a fraction between 0 and 1', value);
  return value;
}

export function requireString(args: Args, key: string): string {
  const value = args[key];
  if (typeof value !== 'string' || value.trim() === '') reject(key, 'a non-empty string', value);
  return value;
}

export function optionalString(args: Args, key: string): string | undefined {
  if (args[key] === undefined || args[key] === null) return undefined;
  return requireString(args, key);
}

/** Names the alternatives in the error — the agent cannot guess them. */
export function requireOneOf<T extends string>(args: Args, key: string, allowed: readonly T[]): T {
  const value = args[key];
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    reject(key, `one of ${allowed.map((a) => `"${a}"`).join(', ')}`, value);
  }
  return value as T;
}

/**
 * Severity keeps its old forgiving behaviour: an unrecognised value falls back
 * to "serious" rather than dropping the finding. Losing a finding the agent
 * meant to record is worse than mislabelling its urgency.
 */
export function optionalSeverity(args: Args, key = 'severity'): AnnotationSeverity {
  const value = args[key];
  return typeof value === 'string' && (SEVERITIES as readonly string[]).includes(value)
    ? (value as AnnotationSeverity)
    : 'serious';
}
