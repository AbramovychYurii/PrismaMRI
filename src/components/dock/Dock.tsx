import { useState, type ReactNode } from "react";
import { useVolumeStore } from "@/store/volumeStore";
import { DisplayCell } from "@/components/dock/DisplayCell";
import { StudyCell } from "@/components/dock/StudyCell";
import { NavigationCell } from "@/components/dock/NavigationCell";
import { SessionCell } from "@/components/dock/SessionCell";

const DOCK_H = 200;

function prefersReduced() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

function CellHead({ title }: { title: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 12,
      }}
    >
      <span
        style={{
          fontFamily: "var(--serif)",
          fontStyle: "italic",
          fontSize: 15,
          color: "var(--ink)",
          letterSpacing: "0.005em",
        }}
      >
        {title}
      </span>
      <span style={{ flex: 1, height: 1, background: "var(--rule)" }} />
    </div>
  );
}

function DockCell({
  title,
  children,
  last,
}: {
  title: string;
  children: ReactNode;
  last?: boolean;
}) {
  return (
    <div
      style={{
        padding: "14px 22px 16px",
        borderRight: last ? "none" : "1px solid var(--rule)",
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
      }}
    >
      <CellHead title={title} />
      {children}
    </div>
  );
}

function PanelsToggle({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  const [hover, setHover] = useState(false);
  const reduced = prefersReduced();

  return (
    <button
      type="button"
      aria-label={open ? "Hide control panels" : "Show control panels"}
      aria-expanded={open}
      onClick={onToggle}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "fixed",
        bottom: open ? DOCK_H + 10 : 10,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 20,
        transition: reduced
          ? "none"
          : "bottom 260ms ease, background 100ms, border-color 100ms",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 32,
        height: 32,
        background: hover ? "rgba(28,22,14,0.97)" : "rgba(15,12,8,0.88)",
        border: `1px solid ${hover ? "var(--amber)" : "var(--amber-dim)"}`,
        borderRadius: "50%",
        color: hover ? "var(--amber)" : "var(--ink-3)",
        cursor: "pointer",
        boxShadow: "0 2px 10px rgba(0,0,0,0.55)",
        backdropFilter: "blur(8px)",
      }}
    >
      <svg
        width={12}
        height={12}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={{
          transform: open ? "rotate(0deg)" : "rotate(180deg)",
          transition: reduced ? "none" : "transform 260ms ease",
        }}
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>
  );
}

export function Dock() {
  const dockOpen = useVolumeStore((s) => s.toolbar.dock);
  const toggleToolbar = useVolumeStore((s) => s.toggleToolbar);
  const view = useVolumeStore((s) => s.view);
  const reduced = prefersReduced();

  if (view !== "viewer") return null;

  return (
    <>
      <PanelsToggle open={dockOpen} onToggle={() => toggleToolbar("dock")} />

      {/* Fixed panel — slides over the stage, never resizes it */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          height: DOCK_H,
          transform: dockOpen ? "translateY(0)" : `translateY(${DOCK_H}px)`,
          transition: reduced ? "none" : "transform 260ms ease",
          zIndex: 15,
          background: "var(--panel)",
          borderTop: "1px solid var(--rule)",
          display: "grid",
          gridTemplateColumns: "1.1fr 1.4fr 1fr 0.9fr",
          alignItems: "stretch",
          paddingBottom: "12px",
        }}
      >
        <DockCell title="Display">
          <DisplayCell />
        </DockCell>
        <DockCell title="Study">
          <StudyCell />
        </DockCell>
        <DockCell title="Navigation">
          <NavigationCell />
        </DockCell>
        <DockCell title="Session" last>
          <SessionCell />
        </DockCell>
      </div>
    </>
  );
}
