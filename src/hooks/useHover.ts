import { useState } from 'react';

interface HoverHandlers {
  hover: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

/** Minimal hover state — replaces the repetitive [hover, setHover] + handlers pattern. */
export function useHover(): HoverHandlers {
  const [hover, setHover] = useState(false);
  return {
    hover,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
  };
}
