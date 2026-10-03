/**
 * The unit of a volume's scalar values: Hounsfield units for CT. MR (and any
 * other modality) intensities are relative and have no unit to show — so every
 * place that prints a value or range asks here instead of writing "HU".
 */
export function intensityUnit(modality: string | undefined): 'HU' | '' {
  return modality === 'CT' ? 'HU' : '';
}
