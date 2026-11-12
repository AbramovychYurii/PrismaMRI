/**
 * Measurement-dot sizing shared by the slice panels. Their styles live in
 * SlicePanel.module.css: the rail panel and the fullscreen view share the
 * same chrome (header, button tray, crosshair, measurement).
 */

/** Fixed pixel size of measurement dots on 2-D slice panels. */
export const MEASURE_DOT_PX = 8;

/** Pre-computed box-shadow for measurement dots (constant size). */
export const MEASURE_DOT_SHADOW = `0 0 ${MEASURE_DOT_PX * 0.7}px var(--pmri-measure), 0 0 ${MEASURE_DOT_PX * 1.6}px var(--pmri-measure-glow)`;
