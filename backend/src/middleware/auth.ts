import type { Request, Response, NextFunction } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";

export type UserRole = "Admin" | "Staff";

export type AuthUser = {
  id: string;
  email: string;
  role: UserRole;
  firstName: string | null;
  phone: string | null;
  providerType: string | null;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function authenticateSupabase(supabase: SupabaseClient) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const authHeader = req.header("authorization") ?? "";
    const match = authHeader.match(/^Bearer (.+)$/i);
    if (!match) return next();

    try {
      const token = match[1];
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data.user) return next();

      const user = data.user;
      const confirmedAt =
        (user.email_confirmed_at as string | null | undefined) ??
        (user.confirmed_at as string | null | undefined);
      if (!confirmedAt) return next();

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role,first_name,phone,provider_type")
        .eq("id", user.id)
        .maybeSingle();

      const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
      const metaFirstName =
        typeof meta.first_name === "string" && meta.first_name.trim()
          ? meta.first_name.trim()
          : null;
      const metaPhone =
        typeof meta.phone === "string" && meta.phone.trim()
          ? meta.phone.trim()
          : null;
      const metaProviderType =
        typeof meta.provider_type === "string" && meta.provider_type.trim()
          ? meta.provider_type.trim()
          : null;

      // If the `profiles` trigger wasn't installed (or was installed later),
      // create a default profile on first authenticated request.
      if (!profile && !profileError) {
        await supabase.from("profiles").insert({
          id: user.id,
          role: "Staff",
          first_name: metaFirstName,
          phone: metaPhone,
          provider_type: metaProviderType
        });
      } else if (profile && !profileError) {
        // Backfill missing profile fields from signup metadata (if present).
        const nextFirstName = profile.first_name ?? metaFirstName;
        const nextPhone = profile.phone ?? metaPhone;
        const nextProviderType = profile.provider_type ?? metaProviderType;
        if (
          nextFirstName !== profile.first_name ||
          nextPhone !== profile.phone ||
          nextProviderType !== profile.provider_type
        ) {
          await supabase
            .from("profiles")
            .update({
              first_name: nextFirstName,
              phone: nextPhone,
              provider_type: nextProviderType
            })
            .eq("id", user.id);
        }
      }

      const role: UserRole = profile?.role === "Admin" ? "Admin" : "Staff";
      req.user = {
        id: user.id,
        email: user.email ?? "",
        role,
        firstName: profile?.first_name ?? metaFirstName,
        phone: profile?.phone ?? metaPhone,
        providerType: profile?.provider_type ?? metaProviderType
      };
    } catch {
      req.user = undefined;
    }

    next();
  };
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  next();
}

export function requireRole(role: UserRole) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    if (req.user.role !== role)
      return res.status(403).json({ error: "Forbidden" });
    next();
  };
}
