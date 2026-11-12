import { useMenuKeyboard } from '@/hooks/useMenuKeyboard';
import { usePortalContainer } from '@/viewer';
import { Eye, MapPin, Ruler, Trash2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import styles from './MeasureMenu.module.css';

interface Props {
  x: number;
  y: number;
  /** False when measuring is turned off: only "View from this side" remains. */
  canMeasure: boolean;
  hasMeasurementFrom: boolean;
  onMeasureFrom: () => void;
  onMeasureTo: () => void;
  onSnapToView: () => void;
  onClear: () => void;
  onClose: () => void;
}

export function MeasureMenu({
  x,
  y,
  canMeasure,
  hasMeasurementFrom: hasFrom,
  onMeasureFrom,
  onMeasureTo,
  onSnapToView,
  onClear,
  onClose,
}: Props) {
  const portalContainer = usePortalContainer();
  const ref = useRef<HTMLDivElement>(null);

  // Clamp to viewport so menu never overflows edge — items: measure-from (+
  // optional measure-to) → divider → view-from-here → optional clear group.
  const menuW = 200;
  const hasMeasurementFrom = canMeasure && hasFrom;
  const baseH = canMeasure ? 44 + 8 + 36 : 44; // measure-from + divider + view-from-here
  const menuH = hasMeasurementFrom ? baseH + 36 + 8 + 36 : baseH;
  const safeX = Math.min(x, window.innerWidth - menuW - 8);
  const safeY = Math.min(y, window.innerHeight - menuH - 8);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [onClose]);
  useMenuKeyboard(ref, onClose);

  function wrap(fn: () => void) {
    return () => {
      fn();
      onClose();
    };
  }

  return createPortal(
    // biome-ignore lint/a11y/useKeyWithClickEvents: the click handler only stops clicks reaching the panel below; keys go through useMenuKeyboard
    <div
      className={styles.menu}
      ref={ref}
      role="menu"
      aria-label="Slice actions"
      style={{ left: safeX, top: safeY }}
      onClick={(e) => e.stopPropagation()}
    >
      {canMeasure && (
        <>
          <button
            className={styles.item}
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={wrap(onMeasureFrom)}
          >
            <MapPin size={12} />
            Measure from here
          </button>
          {hasMeasurementFrom && (
            <button
              className={styles.item}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={wrap(onMeasureTo)}
            >
              <Ruler size={12} />
              Measure to here
            </button>
          )}
          <div className={styles.divider} aria-hidden />
        </>
      )}
      <button
        className={styles.item}
        type="button"
        role="menuitem"
        tabIndex={-1}
        onClick={wrap(onSnapToView)}
      >
        <Eye size={12} />
        View from this side
      </button>
      {hasMeasurementFrom && (
        <>
          <div className={styles.divider} aria-hidden />
          <button
            className={`${styles.item} ${styles.dangerItem}`}
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={wrap(onClear)}
          >
            <Trash2 size={12} />
            Clear measurement
          </button>
        </>
      )}
    </div>,
    portalContainer,
  );
}
