import React, { useEffect, useMemo, useRef, useState } from "react";
import { requireSupabase } from "../lib/supabase";

type CompanyFolder = {
  id: string;
  company_name: string;
  company_slug: string;
  created_at: string;
  updated_at: string;
};

type CompanyAttachment = {
  id: string;
  folder_id: string;
  company_name: string;
  company_slug: string;
  original_name: string;
  storage_path: string;
  mime_type: string;
  file_size: number;
  created_at: string;
};

type Props = {
  companySuggestions: string[];
};

const STORAGE_BUCKET = "spare-part-docs";

function slugifyCompany(name: string) {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "company"
  );
}

function normalizeCompany(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

function sanitizeFileName(name: string) {
  return (
    name
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, " ")
      .trim() || "file"
  );
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

async function downloadBlob(blob: Blob, suggestedName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function CompanyFolderManager({ companySuggestions }: Props) {
  const [folders, setFolders] = useState<CompanyFolder[]>([]);
  const [attachments, setAttachments] = useState<CompanyAttachment[]>([]);
  const [activeSlug, setActiveSlug] = useState("");
  const [folderDraft, setFolderDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busyAttachmentId, setBusyAttachmentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const companies = useMemo(() => {
    const map = new Map<string, { slug: string; name: string; source: "suggestion" | "folder" }>();

    for (const raw of companySuggestions) {
      const name = normalizeCompany(raw);
      if (!name) continue;
      const slug = slugifyCompany(name);
      map.set(slug, { slug, name, source: "suggestion" });
    }

    for (const folder of folders) {
      map.set(folder.company_slug, {
        slug: folder.company_slug,
        name: folder.company_name,
        source: "folder"
      });
    }

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [companySuggestions, folders]);

  const activeCompany = companies.find((company) => company.slug === activeSlug) ?? null;
  const activeAttachments = attachments
    .filter((attachment) => attachment.company_slug === activeSlug)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const supabase = requireSupabase();
      const [folderRes, attachmentRes] = await Promise.all([
        supabase
          .from("spare_part_folders")
          .select("id,company_name,company_slug,created_at,updated_at")
          .order("company_name", { ascending: true }),
        supabase
          .from("spare_part_attachments")
          .select(
            "id,folder_id,company_name,company_slug,original_name,storage_path,mime_type,file_size,created_at"
          )
          .order("created_at", { ascending: false })
      ]);
      if (folderRes.error) throw folderRes.error;
      if (attachmentRes.error) throw attachmentRes.error;
      setFolders((folderRes.data ?? []) as CompanyFolder[]);
      setAttachments((attachmentRes.data ?? []) as CompanyAttachment[]);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load company folders");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!companies.length) {
      setActiveSlug("");
      return;
    }
    if (!activeSlug || !companies.some((company) => company.slug === activeSlug)) {
      setActiveSlug(companies[0].slug);
    }
  }, [activeSlug, companies]);

  async function ensureFolder(companyName: string) {
    const trimmed = normalizeCompany(companyName);
    if (!trimmed) {
      throw new Error("Company name is required.");
    }

    const slug = slugifyCompany(trimmed);
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from("spare_part_folders")
      .upsert(
        {
          company_name: trimmed,
          company_slug: slug,
          updated_at: new Date().toISOString()
        },
        { onConflict: "company_slug" }
      )
      .select("id,company_name,company_slug,created_at,updated_at")
      .single();
    if (error) throw error;
    return data as CompanyFolder;
  }

  async function createFolderFromDraft() {
    const companyName = normalizeCompany(folderDraft);
    if (!companyName) return;

    setError(null);
    setMessage(null);
    try {
      const folder = await ensureFolder(companyName);
      setFolderDraft("");
      setActiveSlug(folder.company_slug);
      await loadData();
      setMessage(`Folder ready for ${folder.company_name}.`);
    } catch (err: any) {
      setError(err?.message ?? "Failed to create folder");
    }
  }

  async function uploadFiles() {
    const input = fileInputRef.current;
    const files = Array.from(input?.files ?? []);
    const companyName = activeCompany?.name ?? normalizeCompany(folderDraft);

    if (!companyName) {
      setError("Choose or create a company folder first.");
      return;
    }
    if (!files.length) {
      setError("Choose a PDF or image file first.");
      return;
    }

    setUploading(true);
    setError(null);
    setMessage(null);
    try {
      const folder = await ensureFolder(companyName);
      const supabase = requireSupabase();

      for (const file of files) {
        const safeName = sanitizeFileName(file.name);
        const storagePath = `${folder.company_slug}/${Date.now()}-${crypto.randomUUID()}-${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(storagePath, file, {
            upsert: false,
            contentType: file.type || undefined
          });
        if (uploadError) throw uploadError;

        const { error: insertError } = await supabase.from("spare_part_attachments").insert({
          folder_id: folder.id,
          company_name: folder.company_name,
          company_slug: folder.company_slug,
          original_name: file.name,
          storage_path: storagePath,
          mime_type: file.type || "application/octet-stream",
          file_size: file.size
        });
        if (insertError) throw insertError;
      }

      if (input) input.value = "";
      await loadData();
      setActiveSlug(folder.company_slug);
      setMessage("File upload complete.");
    } catch (err: any) {
      setError(
        err?.message ??
          "Upload failed. Make sure the spare-part-docs bucket and tables exist in Supabase."
      );
    } finally {
      setUploading(false);
    }
  }

  async function openAttachment(attachment: CompanyAttachment) {
    try {
      const supabase = requireSupabase();
      const popup = window.open("", "_blank", "noopener,noreferrer");
      if (!popup) throw new Error("Popup blocked. Please allow popups to view the file.");
      popup.document.write("Loading...");

      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(attachment.storage_path, 60 * 10);
      if (error) throw error;
      popup.location.href = data.signedUrl;
      popup.focus();
    } catch (err: any) {
      setError(err?.message ?? "Failed to open file");
    }
  }

  async function downloadAttachment(attachment: CompanyAttachment) {
    setBusyAttachmentId(attachment.id);
    setError(null);
    try {
      const supabase = requireSupabase();
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .download(attachment.storage_path);
      if (error) throw error;
      await downloadBlob(data, attachment.original_name);
      setMessage(`Downloaded ${attachment.original_name}.`);
    } catch (err: any) {
      setError(err?.message ?? "Failed to download file");
    } finally {
      setBusyAttachmentId(null);
    }
  }

  const canUpload = Boolean(activeCompany?.name || folderDraft.trim());

  return (
    <div>
      <div className="cardHeader">
        <div className="row">
          <h2 className="title" style={{ fontSize: 18 }}>
            Company Files
          </h2>
          <span className="muted">PDF and image uploads grouped by company folder</span>
        </div>
      </div>
      <div className="cardBody">
        <div className="row" style={{ flexWrap: "wrap", alignItems: "flex-end", gap: 10 }}>
          <div style={{ minWidth: 260, flex: 1 }}>
            <div className="formLabel">Company / Folder Name</div>
            <input
              className="input"
              placeholder="Type a company name"
              value={folderDraft}
              onChange={(e) => setFolderDraft(e.target.value)}
              style={{ width: "100%" }}
            />
          </div>
          <button className="button" type="button" onClick={() => void createFolderFromDraft()}>
            Create Folder
          </button>
        </div>

        <div
          className="row"
          style={{
            marginTop: 14,
            flexWrap: "wrap",
            gap: 8
          }}
        >
          {companies.length ? (
            companies.map((company) => (
              <button
                key={company.slug}
                className="button"
                type="button"
                onClick={() => setActiveSlug(company.slug)}
                style={
                  activeSlug === company.slug
                    ? undefined
                    : { background: "rgba(255,255,255,0.06)" }
                }
              >
                {company.name}
              </button>
            ))
          ) : (
            <div className="muted">No company folders yet.</div>
          )}
        </div>

        <div className="hr" />

        <div className="row" style={{ flexWrap: "wrap", alignItems: "flex-end", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div className="formLabel">Upload PDF or Image</div>
            <input
              ref={fileInputRef}
              className="input"
              type="file"
              accept="application/pdf,image/*"
              multiple
              disabled={!canUpload || uploading}
              style={{ width: "100%" }}
            />
          </div>
          <button
            className="button"
            type="button"
            onClick={() => void uploadFiles()}
            disabled={!canUpload || uploading}
          >
            {uploading ? "Uploading..." : "Upload File"}
          </button>
        </div>

        <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
          Files are stored inside the selected company folder and can be viewed or downloaded
          again later.
        </div>

        {loading ? <div className="muted" style={{ marginTop: 12 }}>Loading files...</div> : null}
        {message ? <div className="muted" style={{ marginTop: 12 }}>{message}</div> : null}
        {error ? (
          <div className="muted" style={{ color: "rgba(255,88,118,0.92)", marginTop: 12 }}>
            {error}
          </div>
        ) : null}

        <div className="hr" />

        <div style={{ display: "grid", gap: 12 }}>
          <div className="row" style={{ alignItems: "baseline" }}>
            <h3 className="title" style={{ fontSize: 16, margin: 0 }}>
              {activeCompany ? activeCompany.name : "Select a folder"}
            </h3>
            <span className="muted">
              {activeAttachments.length} file{activeAttachments.length === 1 ? "" : "s"}
            </span>
          </div>

          {!activeCompany ? (
            <div className="muted">Create or select a company folder to see its files.</div>
          ) : !folders.some((folder) => folder.company_slug === activeSlug) ? (
            <div className="muted">
              This company folder will be created automatically the first time you upload a file.
            </div>
          ) : null}

          {activeAttachments.length ? (
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Type</th>
                    <th>Size</th>
                    <th>Uploaded</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {activeAttachments.map((attachment) => (
                    <tr key={attachment.id}>
                      <td>{attachment.original_name}</td>
                      <td>{attachment.mime_type || "file"}</td>
                      <td>{formatBytes(attachment.file_size)}</td>
                      <td>{new Date(attachment.created_at).toLocaleString()}</td>
                      <td>
                        <div className="row">
                          <button
                            className="button"
                            type="button"
                            onClick={() => void openAttachment(attachment)}
                          >
                            View
                          </button>
                          <button
                            className="button"
                            type="button"
                            style={{ background: "rgba(255,255,255,0.06)" }}
                            onClick={() => void downloadAttachment(attachment)}
                            disabled={busyAttachmentId === attachment.id}
                          >
                            {busyAttachmentId === attachment.id ? "Downloading..." : "Download"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="muted">No files uploaded yet for this company.</div>
          )}
        </div>
      </div>
    </div>
  );
}
