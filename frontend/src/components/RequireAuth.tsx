import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth, type UserRole } from "../state/auth";

export function RequireAuth(props: { children: React.ReactNode; role?: UserRole }) {
  const { token, user, initializing, authError, refreshUser, logout } = useAuth();
  if (initializing) return <div className="container">Loading...</div>;
  if (!token) return <Navigate to="/login" replace />;
  if (!user) {
    if (!authError) return <div className="container">Loading...</div>;
    return (
      <div className="container" style={{ paddingTop: 24 }}>
        <div className="card" style={{ width: "min(680px, 100%)", margin: "0 auto" }}>
          <div className="cardHeader">
            <h2 className="title">Authentication error</h2>
            <p className="muted" style={{ marginTop: 8 }}>
              {authError}
            </p>
          </div>
          <div className="cardBody">
            <div className="row" style={{ gap: 12 }}>
              <button className="button" onClick={() => void refreshUser()}>
                Retry
              </button>
              <button
                className="button"
                onClick={logout}
                style={{ background: "rgba(255,255,255,0.06)" }}
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (props.role && user.role !== props.role) return <Navigate to="/" replace />;
  return <>{props.children}</>;
}
