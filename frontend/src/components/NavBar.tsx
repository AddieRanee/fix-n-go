import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../state/auth";
import { Modal } from "./Modal";

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function NavItem(props: { to: string; label: string }) {
  const loc = useLocation();
  const active = loc.pathname === props.to;
  return (
    <Link
      to={props.to}
      className="navLink"
      style={active ? { borderColor: "rgba(234,240,255,0.22)" } : undefined}
    >
      {props.label}
    </Link>
  );
}

export function NavBar() {
  const { user, logout } = useAuth();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const displayName = user?.firstName?.trim() || user?.email || "Staff";
  const roleLabel = user?.providerType?.trim() || user?.role || "Staff";
  return (
    <div className="nav">
      <div className="navInner">
        <div className="navBrand" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <img src="/favicon.svg" alt="Fix n Go" style={{ width: 28, height: 28 }} />
          Fix n Go Garage
        </div>
        <NavItem to="/" label="Home" />
        <NavItem to="/inventory" label="Inventory" />
        <NavItem to="/spare-parts" label="Spare Parts" />
        <NavItem to="/use" label="Cash Bills" />
        <NavItem to="/sales" label="Total Sales" />
        <NavItem to="/profile" label="Profile" />
        <div className="spacer" />
        {user ? (
          <div className="row navProfile" style={{ gap: 10 }}>
            <div className="navAvatar">{initialsFromName(displayName)}</div>
            <div className="navProfileMeta">
              <div className="navProfileName">{displayName}</div>
              <span className={`badge badgeRole ${user.role === "Admin" ? "badgeRoleAdmin" : "badgeRoleStaff"}`}>
                {roleLabel}
              </span>
            </div>
            <button
              className="button"
              type="button"
              onClick={() => setConfirmOpen(true)}
            >
              Logout
            </button>
          </div>
        ) : null}
      </div>

      <Modal
        open={confirmOpen}
        title="Log out"
        showCloseButton={false}
        solid
        onClose={() => setConfirmOpen(false)}
      >
        <div className="muted" style={{ textAlign: "center", marginBottom: 14 }}>
          Are you sure you want to log out?
        </div>
        <div className="row" style={{ justifyContent: "center" }}>
          <button
            className="button buttonDanger"
            type="button"
            onClick={() => {
              setConfirmOpen(false);
              logout();
            }}
          >
            Yes, log out
          </button>
          <button
            className="button"
            type="button"
            onClick={() => setConfirmOpen(false)}
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            No
          </button>
        </div>
      </Modal>
    </div>
  );
}
