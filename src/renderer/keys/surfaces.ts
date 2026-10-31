import { commandById, type Surface } from '@shared/commands/catalog';
import type { CommandId } from '@shared/commands/ids';

export type SurfaceHandlers = Partial<Record<CommandId, () => void>>;

const mounted = new Map<Surface, SurfaceHandlers>();

/**
 * A mounted surface lends its actions to `dispatch`. The viewer's paging lives
 * in component state and DOM refs, so lifting all of it into the store would be
 * a rewrite; lending the handlers keeps the state where it is and still lets a
 * key, a menu item or a button reach it.
 */
export function registerSurface(surface: Surface, handlers: SurfaceHandlers): () => void {
  mounted.set(surface, handlers);
  return () => { if (mounted.get(surface) === handlers) mounted.delete(surface); };
}

export function surfaceHandler(id: CommandId): (() => void) | null {
  const surface = commandById(id)?.surface;
  if (!surface) return null;
  return mounted.get(surface)?.[id] ?? null;
}

export function mountedSurfaces(): Surface[] {
  return [...mounted.keys()];
}
