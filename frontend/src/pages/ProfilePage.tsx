import React, { useEffect, useMemo, useState } from "react";
import { requireSupabase } from "../lib/supabase";
import { getApiErrorMessage } from "../lib/errors";
import { useAuth } from "../state/auth";
import { useNavigate } from "react-router-dom";

type Profile = {
  display_name: string | null;
  email: string | null;
  phone: string | null;
  provider_type: string | null;
  notes_signature: string | null;
  avatar_type: "auto" | "icon" | "upload" | null;
  avatar_icon: string | null;
  avatar_url: string | null;
};

type Stats = {
  receiptsCount: number;
  itemsUsedCount: number;
  lastLogin: string | null;
};

const avatarIcons = [
  { id: "wrench", label: "Wrench" },
  { id: "tire", label: "Tire" },
  { id: "spark", label: "Spark" },
  { id: "bolt", label: "Bolt" },
  { id: "gear", label: "Gear" },
  { id: "car", label: "Car" },
  { id: "fuel", label: "Fuel" },
  { id: "shield", label: "Shield" }
];

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function stringHue(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) % 360;
  }
  return hash;
}

function iconSvg(id: string) {
  if (id === "tire") {
    return (
      <svg viewBox="0 0 24 24" width="26" height="26">
        <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="12" cy="12" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M12 4v3M12 17v3M4 12h3M17 12h3" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    );
  }
  if (id === "spark") {
    return (
      <svg viewBox="0 0 24 24" width="26" height="26">
        <path
          d="M12 2l2.2 5.5L20 9l-5.2 2.3L12 22l-2.2-10.7L4 9l5.8-1.5z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (id === "bolt") {
    return (
      <svg viewBox="0 0 24 24" width="26" height="26">
        <path
          d="M13 2L5 13h6l-1 9 8-12h-6z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (id === "gear") {
    return (
      <svg viewBox="0 0 24 24" width="26" height="26">
        <circle cx="12" cy="12" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M12 2v3M12 19v3M2 12h3M19 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (id === "car") {
    return (
      <svg viewBox="0 0 24 24" width="26" height="26">
        <path
          d="M4 14l2-5h12l2 5M3 14h18v4H3zM7 18h2M15 18h2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (id === "fuel") {
    return (
      <svg viewBox="0 0 24 24" width="26" height="26">
        <path
          d="M6 3h7v18H6zM13 6h2l3 4v8a2 2 0 0 1-2 2h-1"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (id === "shield") {
    return (
      <svg viewBox="0 0 24 24" width="26" height="26">
        <path
          d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="26" height="26">
      <path
        d="M4 18l4-2 2-6 5-5 5 5-5 5-6 2z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ProfilePage() {
  const { user, refreshUser, logout } = useAuth();
  const nav = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<Stats>({
    receiptsCount: 0,
    itemsUsedCount: 0,
    lastLogin: null
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const displayName = profile?.display_name || user?.firstName || user?.email || "Staff";
  const avatarType = profile?.avatar_type || "auto";
  const avatarIcon = profile?.avatar_icon || "wrench";
  const avatarUrl = profile?.avatar_url || "";

  useEffect(() => {
    const load = async () => {
      if (!user?.id) return;
      setLoading(true);
      setError(null);
      try {
        const supabase = requireSupabase();
        await supabase.rpc("sync_profile");
        const { data, error: profileError } = await supabase
          .from("profiles")
          .select(
            "display_name,email,phone,provider_type,notes_signature,avatar_type,avatar_icon,avatar_url"
          )
          .eq("id", user.id)
          .maybeSingle();
        if (profileError) throw profileError;
        setProfile({
          display_name: data?.display_name ?? user.firstName ?? null,
          email: data?.email ?? user.email ?? null,
          phone: data?.phone ?? null,
          provider_type: data?.provider_type ?? user.providerType ?? null,
          notes_signature: data?.notes_signature ?? null,
          avatar_type: data?.avatar_type ?? "auto",
          avatar_icon: data?.avatar_icon ?? "wrench",
          avatar_url: data?.avatar_url ?? null
        });

        const { data: authUserData } = await supabase.auth.getUser();
        const lastLogin = authUserData?.user?.last_sign_in_at ?? null;

        let receiptsCount = 0;
        let itemsUsedCount = 0;
        if (user.id) {
          const receiptsRes = await supabase
            .from("receipts")
            .select("id", { count: "exact", head: true })
            .eq("created_by_id", user.id);
          if (!receiptsRes.error && typeof receiptsRes.count === "number") {
            receiptsCount = receiptsRes.count;
          }
          const receiptIdsRes = await supabase
            .from("receipts")
            .select("id")
            .eq("created_by_id", user.id);
          if (!receiptIdsRes.error && receiptIdsRes.data?.length) {
            const ids = receiptIdsRes.data.map((r: any) => r.id);
            const linesRes = await supabase
              .from("receipt_lines")
              .select("id", { count: "exact", head: true })
              .in("receipt_id", ids);
            if (!linesRes.error && typeof linesRes.count === "number") {
              itemsUsedCount = linesRes.count;
            }
          }
        }
        setStats({ receiptsCount, itemsUsedCount, lastLogin });
      } catch (err: any) {
        setError(getApiErrorMessage(err, "Failed to load profile"));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [user?.id]);

  const avatarStyle = useMemo(() => {
    const hue = stringHue(displayName);
    return {
      background: `radial-gradient(circle at top, hsla(${hue}, 80%, 66%, 0.9), rgba(10, 16, 30, 0.95))`
    };
  }, [displayName]);

  async function saveProfile(next?: Partial<Profile>) {
    if (!user?.id || !profile) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const supabase = requireSupabase();
      const payload = {
        id: user.id,
        email: user.email ?? profile.email,
        display_name: (next?.display_name ?? profile.display_name)?.trim() || null,
        phone: (next?.phone ?? profile.phone)?.trim() || null,
        provider_type:
          (next?.provider_type ?? profile.provider_type)?.trim() || null,
        notes_signature:
          (next?.notes_signature ?? profile.notes_signature)?.trim() || null,
        avatar_type: next?.avatar_type ?? profile.avatar_type,
        avatar_icon: next?.avatar_icon ?? profile.avatar_icon,
        avatar_url: next?.avatar_url ?? profile.avatar_url,
        updated_at: new Date().toISOString()
      };
      const { data, error } = await supabase
        .from("profiles")
        .upsert(payload)
        .select(
          "display_name,email,phone,provider_type,notes_signature,avatar_type,avatar_icon,avatar_url"
        )
        .single();
      if (error) throw error;
      setProfile({
        display_name: data?.display_name ?? payload.display_name,
        email: data?.email ?? payload.email,
        phone: data?.phone ?? payload.phone,
        provider_type: data?.provider_type ?? payload.provider_type,
        notes_signature: data?.notes_signature ?? payload.notes_signature,
        avatar_type: data?.avatar_type ?? payload.avatar_type ?? "auto",
        avatar_icon: data?.avatar_icon ?? payload.avatar_icon ?? "wrench",
        avatar_url: data?.avatar_url ?? payload.avatar_url ?? null
      });
      await refreshUser();
      setMessage("Profile saved.");
    } catch (err: any) {
      setError(getApiErrorMessage(err, "Save failed"));
    } finally {
      setSaving(false);
    }
  }

  async function uploadAvatar(file: File) {
    if (!user?.id || !profile) return;
    setUploading(true);
    setError(null);
    try {
      const supabase = requireSupabase();
      const ext = file.name.split(".").pop() || "png";
      const path = `${user.id}/avatar.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = data.publicUrl;
      setProfile((prev) =>
        prev
          ? { ...prev, avatar_type: "upload", avatar_url: url }
          : prev
      );
      await saveProfile({ avatar_type: "upload", avatar_url: url });
    } catch (err: any) {
      setError(getApiErrorMessage(err, "Upload failed. Create an 'avatars' storage bucket and try again."));
    } finally {
      setUploading(false);
    }
  }

  async function sendResetEmail() {
    if (!user?.email) return;
    setError(null);
    setMessage(null);
    try {
      const supabase = requireSupabase();
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/reset-password`
      });
      if (error) throw error;
      setMessage("Password reset email sent.");
    } catch (err: any) {
      setError(getApiErrorMessage(err, "Failed to send reset email"));
    }
  }

  async function logoutAll() {
    const supabase = requireSupabase();
    await supabase.auth.signOut({ scope: "global" });
    logout();
    nav("/login", { replace: true });
  }

  if (loading) {
    return (
      <div className="container">
        <div className="muted">Loading profile...</div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="profileHero">
        <div className="profileAvatar" style={avatarStyle}>
          {avatarType === "upload" && avatarUrl ? (
            <img src={avatarUrl} alt="Avatar" />
          ) : avatarType === "icon" ? (
            <span className="profileIcon">{iconSvg(avatarIcon)}</span>
          ) : (
            <span className="profileInitials">{initialsFromName(displayName)}</span>
          )}
        </div>
        <div className="profileHeroInfo">
          <h1 className="title" style={{ fontSize: 26 }}>
            {displayName}
          </h1>
          <div className="row" style={{ gap: 10, alignItems: "center" }}>
            <div className="muted">{profile?.email || user?.email}</div>
            <span
              className={`badge badgeRole ${
                user?.role === "Admin" ? "badgeRoleAdmin" : "badgeRoleStaff"
              }`}
            >
              {profile?.provider_type || user?.providerType || "Staff"}
            </span>
          </div>
        </div>
        <div className="profileHeroActions">
          <button className="button" type="button" onClick={() => saveProfile()} disabled={saving}>
            {saving ? "Saving..." : "Save Profile"}
          </button>
          {message ? <div className="muted">{message}</div> : null}
          {error ? <div className="muted" style={{ color: "#ff7a92" }}>{error}</div> : null}
        </div>
      </div>

      <div className="profileGrid">
        <div className="card profileCard profileCardWide">
          <div className="cardHeader">
            <h2 className="title" style={{ fontSize: 18 }}>Security</h2>
          </div>
          <div className="cardBody">
            <div className="profileSecurityRow">
              <button className="button" type="button" onClick={sendResetEmail}>
                Send password reset link
              </button>
              <button className="button buttonDanger" type="button" onClick={logoutAll}>
                Log out all devices
              </button>
            </div>
            <div className="muted" style={{ marginTop: 10 }}>
              Password reset email will be sent to {user?.email}.
            </div>
          </div>
        </div>
        <div className="card profileCard">
          <div className="cardHeader">
            <h2 className="title" style={{ fontSize: 18 }}>Basic Info</h2>
          </div>
          <div className="cardBody">
            <label className="formLabel">Display Name</label>
            <input
              className="input"
              value={profile?.display_name ?? ""}
              onChange={(e) =>
                setProfile((p) => (p ? { ...p, display_name: e.target.value } : p))
              }
            />
            <label className="formLabel">Email</label>
            <input className="input" value={profile?.email ?? user?.email ?? ""} disabled />
            <label className="formLabel">Phone</label>
            <input
              className="input"
              value={profile?.phone ?? ""}
              onChange={(e) =>
                setProfile((p) => (p ? { ...p, phone: e.target.value } : p))
              }
            />
            <label className="formLabel">Provider Type</label>
            <div className="muted">{profile?.provider_type || "Staff"}</div>
          </div>
        </div>

        <div className="card profileCard">
          <div className="cardHeader">
            <h2 className="title" style={{ fontSize: 18 }}>Avatar Studio</h2>
          </div>
          <div className="cardBody">
            <div className="profileAvatarOptions">
              <button
                className={`button profileAvatarChoice${avatarType === "auto" ? " active" : ""}`}
                type="button"
                onClick={() => {
                  setProfile((p) => (p ? { ...p, avatar_type: "auto" } : p));
                  void saveProfile({ avatar_type: "auto" });
                }}
              >
                Auto
              </button>
              <button
                className={`button profileAvatarChoice${avatarType === "icon" ? " active" : ""}`}
                type="button"
                onClick={() => {
                  setProfile((p) => (p ? { ...p, avatar_type: "icon" } : p));
                  void saveProfile({ avatar_type: "icon", avatar_icon: avatarIcon });
                }}
              >
                Icon
              </button>
              <label className={`button profileAvatarChoice${avatarType === "upload" ? " active" : ""}`}>
                {uploading ? "Uploading..." : "Upload"}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadAvatar(file);
                  }}
                  style={{ display: "none" }}
                />
              </label>
            </div>

            <div className="profileIconGrid">
              {avatarIcons.map((icon) => (
                <button
                  key={icon.id}
                  className={`profileIconTile${avatarIcon === icon.id ? " active" : ""}`}
                  type="button"
                  onClick={() => {
                    setProfile((p) => (p ? { ...p, avatar_type: "icon", avatar_icon: icon.id } : p));
                    void saveProfile({ avatar_type: "icon", avatar_icon: icon.id });
                  }}
                >
                  {iconSvg(icon.id)}
                  <span>{icon.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="card profileCard">
          <div className="cardHeader">
            <h2 className="title" style={{ fontSize: 18 }}>Activity Summary</h2>
          </div>
          <div className="cardBody">
            <div className="profileStatRow">
              <div className="muted">Receipts under your name</div>
              <strong>{stats.receiptsCount}</strong>
            </div>
            <div className="profileStatRow">
              <div className="muted">Items issued on those receipts</div>
              <strong>{stats.itemsUsedCount}</strong>
            </div>
            <div className="profileStatRow">
              <div className="muted">Last login</div>
              <strong>
                {stats.lastLogin ? new Date(stats.lastLogin).toLocaleString() : "Unknown"}
              </strong>
            </div>
          </div>
        </div>

        <div className="card profileCard">
          <div className="cardHeader">
            <h2 className="title" style={{ fontSize: 18 }}>Notes Signature</h2>
          </div>
          <div className="cardBody">
            <label className="formLabel">Signature</label>
            <input
              className="input"
              value={profile?.notes_signature ?? ""}
              onChange={(e) =>
                setProfile((p) => (p ? { ...p, notes_signature: e.target.value } : p))
              }
              placeholder="e.g. Mike (Bay 2)"
            />
            <div className="muted" style={{ marginTop: 8 }}>
              This name is used when you post notes or comments.
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
