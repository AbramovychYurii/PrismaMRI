import { useState } from "react";
import { useViewerActions } from "@/hooks/ViewerActionsContext";

interface ExampleMeta {
  id: string;
  file: string;
  title: string;
  subtitle: string;
  dims: string;
  spacing: string;
  size: string;
  description: string;
  tag: string;
  thumbnailPath: string;
}

const EXAMPLES: ExampleMeta[] = [
  {
    id: "maxillofacial_CBCT",
    file: "maxillofacial_CBCT.nrrd",
    title: "Maxilla",
    subtitle: "upper jaw",
    dims: "401 × 401 × 201",
    spacing: "0.25 mm",
    size: "32 MB",
    description: "Upper jaw — high-resolution dental CT.",
    tag: "CT",
    thumbnailPath: "/examples/thumbnails/maxillofacial_CBCT.jpg",
  },
  {
    id: "dog_frontal_thorax_injured_paw_CT",
    file: "dog_frontal_thorax_injured_paw_CT.nrrd",
    title: "Canine",
    subtitle: "thorax",
    dims: "512 × 512 × 459",
    spacing: "0.73 mm",
    size: "131 MB",
    description: "Canine forequarters with injured front paw.",
    tag: "CT",
    thumbnailPath: "/examples/thumbnails/dog_frontal_thorax_injured_paw.jpg",
  },
  {
    id: "full_body",
    file: "full_body.nrrd",
    title: "Full body",
    subtitle: "torso + pelvis",
    dims: "512 × 512 × 996",
    spacing: "0.83 mm",
    size: "290 MB",
    description: "Whole-body scan — sagittal view.",
    tag: "CT",
    thumbnailPath: "/examples/thumbnails/full_body.png",
  },
];

function ExampleCard({
  example,
  onLoad,
}: {
  example: ExampleMeta;
  onLoad: () => void;
}) {
  const [hover, setHover] = useState(false);

  return (
    <button
      type="button"
      onClick={onLoad}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        background: hover ? "var(--panel-2)" : "var(--panel)",
        border: `1px solid ${hover ? "var(--amber)" : "var(--rule)"}`,
        borderRadius: 4,
        overflow: "hidden",
        cursor: "pointer",
        textAlign: "left",
        padding: 0,
        transition: "border-color 150ms, background 150ms",
        boxShadow: hover ? "0 0 0 1px rgba(255,181,71,0.08)" : "none",
      }}
    >
      {/* Corner brackets */}
      <span
        style={{
          position: "absolute",
          top: 8,
          left: 8,
          width: 14,
          height: 14,
          borderTop: "1px solid var(--amber)",
          borderLeft: "1px solid var(--amber)",
          opacity: hover ? 1 : 0.5,
          transition: "opacity 150ms",
          zIndex: 2,
          pointerEvents: "none",
        }}
      />
      <span
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          width: 14,
          height: 14,
          borderTop: "1px solid var(--rule-2)",
          borderRight: "1px solid var(--rule-2)",
          zIndex: 2,
          pointerEvents: "none",
        }}
      />

      {/* CT badge */}
      <span
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          fontFamily: "var(--mono)",
          fontSize: 9,
          letterSpacing: "0.12em",
          color: "var(--ink-4)",
          background: "rgba(12,11,9,0.75)",
          border: "1px solid var(--rule)",
          borderRadius: 2,
          padding: "2px 5px",
          zIndex: 3,
        }}
      >
        {example.tag}
      </span>

      {/* Thumbnail */}
      <div
        style={{
          width: "100%",
          aspectRatio: "1",
          background: "#0a0907",
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        <img
          src={example.thumbnailPath}
          alt={`${example.title} preview`}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
            filter: hover
              ? "brightness(1.1) contrast(1.05)"
              : "brightness(0.95)",
            transition: "filter 150ms",
          }}
        />
      </div>

      {/* Meta */}
      <div style={{ padding: "10px 12px 12px" }}>
        <div
          style={{
            fontFamily: "var(--serif)",
            fontSize: 14,
            fontWeight: 400,
            color: "var(--ink)",
            marginBottom: 1,
          }}
        >
          {example.title}
          <em
            style={{
              fontStyle: "italic",
              color: "var(--ink-3)",
              marginLeft: 6,
              fontSize: 13,
            }}
          >
            · {example.subtitle}
          </em>
        </div>
        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: 10,
            color: "var(--ink-4)",
            letterSpacing: "0.04em",
            marginBottom: 4,
          }}
        >
          {example.dims} · {example.spacing} · {example.size}
        </div>
        <div
          style={{
            fontFamily: "var(--sans)",
            fontSize: 11,
            color: "var(--ink-3)",
            lineHeight: 1.4,
          }}
        >
          {example.description}
        </div>
      </div>
    </button>
  );
}

export function ExamplesSection() {
  const { loadFromUrl } = useViewerActions();

  return (
    <div
      style={{
        width: "100%",
        marginTop: 48,
        borderTop: "1px solid var(--rule)",
        paddingTop: 28,
      }}
    >
      {/* Section header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              fontFamily: "var(--serif)",
              fontStyle: "italic",
              fontSize: 15,
              color: "var(--ink)",
            }}
          >
            Examples
          </span>
        </div>
        <span
          style={{
            fontFamily: "var(--mono)",
            fontSize: 9.5,
            color: "var(--ink-4)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          Pre-loaded · Click to open
        </span>
      </div>

      {/* Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 12,
        }}
      >
        {EXAMPLES.map((ex) => (
          <ExampleCard
            key={ex.id}
            example={ex}
            onLoad={() => loadFromUrl(`/examples/${ex.file}`, ex.file)}
          />
        ))}
      </div>
    </div>
  );
}
