import React from "react";
import { createPortal } from "react-dom";

export function Modal(props: {
  open: boolean;
  title: string;
  onClose: () => void;
  showCloseButton?: boolean;
  solid?: boolean;
  width?: string;
  maxHeight?: string;
  cardClassName?: string;
  cardStyle?: React.CSSProperties;
  children: React.ReactNode;
}) {
  if (!props.open) return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: props.solid ? "rgba(0,0,0,0.82)" : "rgba(0,0,0,0.55)",
        display: "grid",
        placeItems: "center",
        padding: 16,
        zIndex: 5000,
        overflowY: "auto"
      }}
    >
      <div
        className={`card${props.cardClassName ? ` ${props.cardClassName}` : ""}`}
        style={{
          width: props.width ?? "min(560px, 100%)",
          background: props.solid ? "#0b1220" : undefined,
          maxHeight: props.maxHeight ?? "calc(100vh - 48px)",
          display: "flex",
          flexDirection: "column",
          ...props.cardStyle
        }}
      >
        <div className="cardHeader">
          <div className="row">
            <h2 className="title" style={{ margin: 0 }}>
              {props.title}
            </h2>
            <div className="spacer" />
            {props.showCloseButton === false ? null : (
              <button className="button" onClick={props.onClose} type="button">
                Close
              </button>
            )}
          </div>
        </div>
        <div className="cardBody" style={{ overflow: "auto" }}>
          {props.children}
        </div>
      </div>
    </div>
  , document.body);
}
