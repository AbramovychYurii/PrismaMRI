import { type ActionId, actionsInGroup } from '@prisma-mri/viewer-core';
import { type Ref, useId, useState } from 'react';
import { ControlButton } from './ControlButton';
import { PANEL_GROUPS, type PanelGroup } from './Dock';
import { StepChip, ZoomLabel, useGroupVisible } from './chips';
import { useViewControls, useViewControlsMessages, useViewControlsState } from './context';
import { formatAngle, useViewReadout } from './hooks';
import { ResetIcon } from './icons';

/** Tabs layout, Rotate tab: the order of the 3 × 2 tile grid. */
const ROTATE_TILES: ActionId[] = [
  'pitchUp',
  'yawLeft',
  'rollCcw',
  'pitchDown',
  'yawRight',
  'rollCw',
];

export interface SheetProps {
  layout: 'rows' | 'tabs';
  keycaps: boolean;
  sheetRef?: Ref<HTMLElement>;
}

function RowsLayout({ keycaps }: { keycaps: boolean }) {
  const m = useViewControlsMessages();
  const showRotate = useGroupVisible('rotate');
  const showAlign = useGroupVisible('align');
  const showZoom = useGroupVisible('zoom');
  return (
    <>
      {showRotate && (
        <div className="pmv-vc-sheet__block">
          <div className="pmv-vc-sheet__head">
            <span className="pmv-vc-ghead">
              <span className="pmv-vc-label">{m.groups.rotate}</span>
              <StepChip />
            </span>
            <span className="pmv-vc-muted">{m.holdHint}</span>
          </div>
          <div className="pmv-vc-grid pmv-vc-grid--6">
            {actionsInGroup('rotate').map((a) => (
              <ControlButton key={a.id} id={a.id} keycaps={keycaps} variant="sheet" iconSize={22} />
            ))}
          </div>
        </div>
      )}
      {(showAlign || showZoom) && (
        <div className="pmv-vc-grid pmv-vc-grid--2">
          {showAlign && (
            <div className="pmv-vc-subgroup">
              <span className="pmv-vc-label">{m.alignShort}</span>
              <div className="pmv-vc-grid pmv-vc-grid--3">
                {actionsInGroup('align').map((a) => (
                  <ControlButton key={a.id} id={a.id} keycaps={keycaps} variant="sheet" />
                ))}
              </div>
            </div>
          )}
          {showZoom && (
            <div className="pmv-vc-subgroup">
              <ZoomLabel />
              <div className="pmv-vc-grid pmv-vc-grid--3">
                {actionsInGroup('zoom').map((a) => (
                  <ControlButton
                    key={a.id}
                    id={a.id}
                    keycaps={keycaps}
                    variant="sheet"
                    iconSize={22}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function TabsLayout({ keycaps }: { keycaps: boolean }) {
  const m = useViewControlsMessages();
  const visible = useViewControlsState((s) =>
    PANEL_GROUPS.filter((g) => actionsInGroup(g).some((a) => s.config.actions[a.id])).join(),
  );
  const groups = PANEL_GROUPS.filter((g) => visible.split(',').includes(g));
  const [picked, setPicked] = useState<PanelGroup>('rotate');
  const uid = useId();
  const tab = groups.includes(picked) ? picked : groups[0];
  const view = useViewReadout();
  const controller = useViewControls();
  const canReset = useViewControlsState((s) => s.config.actions.resetView);
  if (!tab) return null;
  const ids = tab === 'rotate' ? ROTATE_TILES : actionsInGroup(tab).map((a) => a.id);

  return (
    <>
      <div role="tablist" aria-label={m.panel} className="pmv-vc-tabs">
        {groups.map((g) => (
          <button
            key={g}
            id={`${uid}-${g}`}
            type="button"
            role="tab"
            aria-selected={tab === g}
            className="pmv-vc-tab"
            onClick={() => setPicked(g)}
          >
            {m.tabs[g]}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-labelledby={`${uid}-${tab}`} className="pmv-vc-tabpanel">
        {tab === 'rotate' && (
          <div className="pmv-vc-sheet__head">
            <span className="pmv-vc-mono pmv-vc-muted">
              {view
                ? `P ${formatAngle(view.pitch)} · Y ${formatAngle(view.yaw)} · R ${formatAngle(view.roll)}`
                : m.holdHint}
            </span>
            <StepChip />
          </div>
        )}
        <div className="pmv-vc-grid pmv-vc-grid--3">
          {ids.map((id) => (
            <ControlButton key={id} id={id} keycaps={keycaps} variant="tile" iconSize={22} />
          ))}
        </div>
      </div>
      {canReset && (
        <button
          type="button"
          className="pmv-vc-wide"
          onClick={() => controller.trigger('resetView', { source: 'pointer' })}
        >
          <ResetIcon size={18} />
          {m.actions.resetView}
        </button>
      )}
    </>
  );
}

/** Phone bottom sheet. rows = every group at once (default), tabs = one group per tab with big labelled tiles. */
export function Sheet({ layout, keycaps, sheetRef }: SheetProps) {
  const controller = useViewControls();
  const m = useViewControlsMessages();
  const canClose = useViewControlsState((s) => s.config.actions.togglePanel);
  return (
    <section ref={sheetRef} className="pmv-vc-sheet" aria-label={m.panel} data-layout={layout}>
      {canClose ? (
        <button
          type="button"
          className="pmv-vc-grabber"
          aria-label={m.hidePanel}
          aria-expanded="true"
          onClick={() => controller.setPanelOpen(false)}
        >
          <span />
        </button>
      ) : (
        <span className="pmv-vc-grabber" aria-hidden="true" />
      )}
      {layout === 'rows' ? <RowsLayout keycaps={keycaps} /> : <TabsLayout keycaps={keycaps} />}
    </section>
  );
}
