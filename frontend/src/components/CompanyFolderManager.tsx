import React, { useEffect, useRef, useState } from "react";
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

type ToastVariant = "warning" | "success" | "error";

type ToastState = {
  id: number;
  variant: ToastVariant;
  message: string;
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

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path
        d="M3.5 7.5A2.5 2.5 0 0 1 6 5h4.2c.8 0 1.3.2 1.8.8l1 1.2c.4.5.9.7 1.7.7H18a2.5 2.5 0 0 1 2.5 2.5v7.3A2.5 2.5 0 0 1 18 20H6a2.5 2.5 0 0 1-2.5-2.5V7.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
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
  const [selectedFolderId, setSelectedFolderId] = useState("");
  const [folderDraft, setFolderDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busyAttachmentId, setBusyAttachmentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId) ?? null;

  const selectedFolderAttachments = attachments
    .filter((attachment) => attachment.folder_id === selectedFolder?.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  function showToast(variant: ToastVariant, message: string) {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    const id = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 3600);
    toastTimerRef.current = id;
    setToast({ id, variant, message });
  }

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const supabase = requireSupabase();
      const [folderRes, attachmentRes] = await Promise.all([
        supabase
          .from("spare_part_folders")
          .select("id,company_name,company_slug,created_at,updated_at")
          .order("updated_at", { ascending: false }),
        supabase
          .from("spare_part_attachments")
          .select(
            "id,folder_id,company_name,company_slug,original_name,storage_path,mime_type,file_size,created_at"
          )
          .order("created_at", { ascending: false })
      ]);
      if (folderRes.error) throw folderRes.error;
      if (attachmentRes.error) throw attachmentRes.error;
      const nextFolders = (folderRes.data ?? []) as CompanyFolder[];
      setFolders(nextFolders);
      setAttachments((attachmentRes.data ?? []) as CompanyAttachment[]);
      setSelectedFolderId((current) =>
        current && nextFolders.some((folder) => folder.id === current) ? current : ""
      );
    } catch (err: any) {
      setError(err?.message ?? "Failed to load company folders");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function createFolder(companyName: string) {
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

  async function handleCreateFolder() {
    const companyName = normalizeCompany(folderDraft);
    if (!companyName) return;

    setError(null);
    setMessage(null);
    try {
      const folder = await createFolder(companyName);
      setFolderDraft("");
      await loadData();
      setSelectedFolderId("");
      setMessage(`Created folder "${folder.company_name}".`);
    } catch (err: any) {
      setError(err?.message ?? "Failed to create folder");
    }
  }

  async function handleUpload() {
    const folder = selectedFolder;
    const input = fileInputRef.current;
    const files = Array.from(input?.files ?? []);

    if (!folder) {
      setError("Create and select a folder first.");
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
          file_size: file.size,
          created_by_id: null
        });
        if (insertError) throw insertError;
      }

      if (input) input.value = "";
      await loadData();
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
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(attachment.storage_path, 60 * 10);
      if (error) throw error;
      const win = window.open(data.signedUrl, "_blank", "noopener,noreferrer");
      if (win) win.focus();
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

  async function deleteAttachment(attachment: CompanyAttachment) {
    const ok = window.confirm(
      `Delete "${attachment.original_name}"? This will remove the file from the folder and storage.`
    );
    if (!ok) return;

    showToast("warning", `Deleting file "${attachment.original_name}"...`);
    setBusyAttachmentId(attachment.id);
    setError(null);
    try {
      const supabase = requireSupabase();
      const { error: storageError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .remove([attachment.storage_path]);
      if (storageError) throw storageError;

      const { error: dbError } = await supabase
        .from("spare_part_attachments")
        .delete()
        .eq("id", attachment.id);
      if (dbError) throw dbError;

      await loadData();
      setMessage(`Deleted ${attachment.original_name}.`);
      showToast("success", `File deleted: ${attachment.original_name}`);
    } catch (err: any) {
      setError(err?.message ?? "Failed to delete file");
      showToast("error", err?.message ?? "Failed to delete file");
    } finally {
      setBusyAttachmentId(null);
    }
  }

  async function deleteFolder(folder: CompanyFolder) {
    const folderAttachmentCount = attachments.filter((attachment) => attachment.folder_id === folder.id).length;
    const ok = window.confirm(
      `Delete folder "${folder.company_name}"? This will permanently remove the folder and ${folderAttachmentCount} file${folderAttachmentCount === 1 ? "" : "s"} inside it.`
    );
    if (!ok) return;

    showToast("warning", `Deleting folder "${folder.company_name}" and its files...`);
    setError(null);
    try {
      const supabase = requireSupabase();
      const folderAttachments = attachments.filter((attachment) => attachment.folder_id === folder.id);
      const storagePaths = folderAttachments.map((attachment) => attachment.storage_path);
      if (storagePaths.length) {
        const { error: storageError } = await supabase.storage.from(STORAGE_BUCKET).remove(storagePaths);
        if (storageError) throw storageError;
      }

      const { error: attachmentDeleteError } = await supabase
        .from("spare_part_attachments")
        .delete()
        .eq("folder_id", folder.id);
      if (attachmentDeleteError) throw attachmentDeleteError;

      const { error: folderDeleteError } = await supabase
        .from("spare_part_folders")
        .delete()
        .eq("id", folder.id);
      if (folderDeleteError) throw folderDeleteError;

      if (selectedFolderId === folder.id) {
        setSelectedFolderId("");
      }
      await loadData();
      setMessage(`Deleted folder "${folder.company_name}".`);
      showToast("success", `Folder deleted: ${folder.company_name}`);
    } catch (err: any) {
      setError(err?.message ?? "Failed to delete folder");
      showToast("error", err?.message ?? "Failed to delete folder");
    }
  }

  return (
    <div className="folderShell">
      {toast ? (
        <div key={toast.id} className={`toastBanner toastBanner${toast.variant}`}>
          {toast.message}
        </div>
      ) : null}

      <div className="folderHero">
        <div>
          <div className="row" style={{ alignItems: "center", gap: 10 }}>
            <h2 className="title" style={{ fontSize: 18, margin: 0 }}>
              Company Folders
            </h2>
            <span className="folderBadge">Folders first</span>
          </div>
          <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
            Each company acts like its own folder and keeps its documents together.
          </div>
        </div>
        <div className="folderHeroSide">
          <div className="folderHeroStat">
            <span className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Total folders
            </span>
            <strong>{folders.length}</strong>
          </div>
          <div className="folderHeroStat">
            <span className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Ready files
            </span>
            <strong>{attachments.length}</strong>
          </div>
        </div>
      </div>

      <div className="folderCreateBar">
        <div style={{ minWidth: 260 }}>
          <div className="formLabel">New Folder Name</div>
          <input
            className="input"
            placeholder="Type company name, then create the folder"
            value={folderDraft}
            onChange={(e) => setFolderDraft(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>
        <button className="button" type="button" onClick={() => void handleCreateFolder()}>
          Create Folder
        </button>
      </div>

      <div className="folderGrid">
        {folders.length ? (
          folders.map((folder) => {
            const count = attachments.filter((attachment) => attachment.folder_id === folder.id).length;
            const selected = selectedFolderId === folder.id;
            return (
              <div
                key={folder.id}
                className={`folderCard${selected ? " folderCardActive" : ""}`}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                onClick={() => setSelectedFolderId(folder.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedFolderId(folder.id);
                  }
                }}
              >
                <div className="folderCardInner">
                  <div className="folderIconWrap">
                    <FolderIcon />
                  </div>
                  <div className="folderCardBody">
                    <div className="folderName">{folder.company_name}</div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      Click to open and manage files
                    </div>
                  </div>
                  <div className="folderCardMeta">
                    <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
                      <span className="folderBadge">{count} file{count === 1 ? "" : "s"}</span>
                      <button
                        className="button buttonDanger folderDeleteButton"
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void deleteFolder(folder);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="folderEmpty">No folders yet. Create one above to start storing files.</div>
        )}
      </div>

      <div className="folderPanel">
        <div className="folderPanelHeader">
          <h3 className="title" style={{ fontSize: 16, margin: 0 }}>
            {selectedFolder ? selectedFolder.company_name : "Pick a folder to view files"}
          </h3>
          <div className="row" style={{ gap: 8 }}>
            <span className="muted">
              {selectedFolderAttachments.length} file
              {selectedFolderAttachments.length === 1 ? "" : "s"}
            </span>
            {selectedFolder ? (
              <button
                className="button buttonDanger folderDeleteButton"
                type="button"
                onClick={() => void deleteFolder(selectedFolder)}
              >
                Delete Folder
              </button>
            ) : null}
          </div>
        </div>

        {!selectedFolder ? (
          <div className="folderPanelEmpty">
            Click a folder card above to open it, then upload PDF or image files inside.
          </div>
        ) : (
          <>
            <div className="folderUploadBar">
              <div style={{ minWidth: 280 }}>
                <div className="formLabel">Upload PDF or Image into this folder</div>
                <input
                  ref={fileInputRef}
                  className="input"
                  type="file"
                  accept="application/pdf,image/*"
                  multiple
                  disabled={uploading}
                  style={{ width: "100%" }}
                />
              </div>
              <button
                className="button"
                type="button"
                onClick={() => void handleUpload()}
                disabled={uploading}
              >
                {uploading ? "Uploading..." : "Upload File"}
              </button>
            </div>

            <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
              Files go into the selected folder only.
            </div>

            {selectedFolderAttachments.length ? (
              <div className="tableWrap" style={{ marginTop: 14 }}>
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
                    {selectedFolderAttachments.map((attachment) => (
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
                            <button
                              className="button buttonDanger"
                              type="button"
                              onClick={() => void deleteAttachment(attachment)}
                              disabled={busyAttachmentId === attachment.id}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="folderPanelEmpty">
                This folder is empty. Upload PDF or image files to keep company documents together.
              </div>
            )}
          </>
        )}
      </div>

      {loading ? <div className="muted" style={{ marginTop: 12 }}>Loading folders...</div> : null}
      {message ? <div className="muted" style={{ marginTop: 12 }}>{message}</div> : null}
      {error ? (
        <div className="muted" style={{ color: "rgba(255,88,118,0.92)", marginTop: 12 }}>
          {error}
        </div>
      ) : null}
    </div>
  );
}
