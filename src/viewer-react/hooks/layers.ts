/**
 * The modal layers open on the page, oldest first. Only the top one answers
 * the keyboard: Tab is trapped and Esc is taken by it alone, so a dialog in one
 * viewer — or one opened over another — never has its keys read by the layer
 * beneath it, and two viewers on a page can't fight over focus.
 */
const layers: Element[] = [];

export function pushLayer(layer: Element): void {
  layers.push(layer);
}

export function removeLayer(layer: Element): void {
  const i = layers.lastIndexOf(layer);
  if (i !== -1) layers.splice(i, 1);
}

/** True when `layer` is the newest layer open — or the only one. */
export function isTopLayer(layer: Element | null): boolean {
  return layer !== null && layers[layers.length - 1] === layer;
}
