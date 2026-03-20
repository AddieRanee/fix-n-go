import React, { useEffect, useState } from "react";
import { getLastApiError } from "../lib/api";

declare global {
  interface WindowEventMap {
    "fixngo:last-api-error": CustomEvent;
  }
}

function formatJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function ApiDebugToast() {
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState(() => getLastApiError());

  useEffect(() => {
    const onErr = (evt: CustomEvent) => {
      setSnapshot((evt.detail ?? null) as any);
      setOpen(true);
    };
    window.addEventListener("fixngo:last-api-error", onErr as any);
    return () => window.removeEventListener("fixngo:last-api-error", onErr as any);
  }, []);

  if (!open || !snapshot) return null;

  return (
    <div className="container">
      <div className="card" style={{ width: "100%", background: "#0b1220" }}>
        <div className="cardHeader">
          <div className="row">
            <h2 className="title" style={{ margin: 0 }}>
              Request failed
            </h2>
            <div className="spacer" />
            <button className="button" type="button" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        </div>
        <div className="cardBody" style={{ display: "grid", gap: 10 }}>
          <div className="muted" style={{ textAlign: "center" }}>
            {snapshot.message}
          </div>
          <div className="row" style={{ justifyContent: "center" }}>
            <span className="badge">
              {snapshot.method ?? "?"} {snapshot.url ?? ""}
            </span>
            <span className="badge">Status: {snapshot.status ?? "unknown"}</span>
          </div>
          <pre
            style={{
              margin: 0,
              padding: 12,
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "rgba(255,255,255,0.03)",
              fontSize: 12,
              lineHeight: 1.4,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              maxHeight: "min(360px, 50vh)",
              overflow: "auto"
            }}
          >
            {formatJson(snapshot.response)}
          </pre>
          <button
            className="button"
            type="button"
            onClick={async () => {
              const text = `${snapshot.method ?? "?"} ${snapshot.url ?? ""}\nStatus: ${
                snapshot.status ?? "unknown"
              }\n\n${formatJson(snapshot.response)}`;
              try {
                await navigator.clipboard.writeText(text);
              } catch {
                // ignore
              }
            }}
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            Copy details
          </button>
        </div>
      </div>
    </div>
  );
}
