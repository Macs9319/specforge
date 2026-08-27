"use client";

import mermaid from "mermaid";
import { useEffect, useId, useRef, useState } from "react";

let mermaidInitialized = false;

export function MermaidDiagram({ chart }: { chart: string }) {
  const rawId = useId().replace(/[^a-zA-Z0-9-]/g, "");
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mermaidInitialized) {
      mermaid.initialize({ startOnLoad: false, theme: "neutral" });
      mermaidInitialized = true;
    }

    let cancelled = false;

    mermaid
      .render(`mermaid-${rawId}`, chart)
      .then(({ svg }) => {
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          setError(null);
        }
      })
      .catch((renderError: unknown) => {
        if (!cancelled) {
          setError(
            renderError instanceof Error
              ? renderError.message
              : "Failed to render diagram.",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [chart, rawId]);

  if (error) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <p>Could not render this diagram: {error}</p>
        <pre className="mt-2 overflow-x-auto text-xs">{chart}</pre>
      </div>
    );
  }

  return <div ref={containerRef} className="overflow-x-auto" />;
}
