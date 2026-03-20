import React, { useEffect, useMemo, useState } from "react";
import { formatMYR } from "../lib/money";
import { getApiErrorMessage } from "../lib/errors";
import { useAuth } from "../state/auth";
import { requireSupabase } from "../lib/supabase";
import { Modal } from "../components/Modal";
import { LOW_STOCK_THRESHOLD } from "../constants/stock";

type InventoryItem = {
  id: string;
  item_code: string;
  item_name: string;
  category: string;
  stock_quantity: number;
  price: number;
};

type SparePart = {
  id: string;
  item_code: string | null;
  item_name: string | null;
  company: string | null;
  stock_quantity: number;
  price: number;
  payment_status: "paid" | "unpaid";
};

type Note = {
  id: string;
  note_date: string;
  content: string;
  created_by_id: string | null;
  created_by_name: string | null;
  created_at: string;
  likes: number;
  likedByMe: boolean;
  comments: { id: string; content: string; user_name: string | null; created_at: string }[];
};

function mapNoteRecord(record: any): Omit<Note, "likes" | "likedByMe" | "comments"> {
  return {
    id: record.id,
    note_date: record.note_date,
    content: record.content ?? "",
    created_by_id: record.created_by_id ?? record.updated_by_id ?? null,
    created_by_name: record.created_by_name ?? record.updated_by_name ?? null,
    created_at: record.created_at ?? record.updated_at ?? new Date().toISOString()
  };
}

export function HomePage() {
  const { user } = useAuth();
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [spareParts, setSpareParts] = useState<SparePart[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<Note | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [likeNamesByNote, setLikeNamesByNote] = useState<Record<string, string[]>>({});
  const [viewLikesNote, setViewLikesNote] = useState<Note | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const supabase = requireSupabase();
      const [invRes, spRes, noteRes, likeRes, commentRes] = await Promise.all([
        supabase
          .from("inventory")
          .select("id,item_code,item_name,category,stock_quantity,price")
          .order("created_at", { ascending: false }),
        supabase
          .from("spare_parts")
          .select("id,item_code,item_name,company,stock_quantity,price,payment_status")
          .order("created_at", { ascending: false }),
        supabase
          .from("daily_notes")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase
          .from("note_likes")
          .select("*")
          .neq("note_id", "00000000-0000-0000-0000-000000000000"),
        supabase
          .from("note_comments")
          .select("id,note_id,content,user_name,created_at")
          .neq("note_id", "00000000-0000-0000-0000-000000000000")
      ]);

      if (invRes.error) throw invRes.error;
      if (spRes.error) throw spRes.error;
      if (noteRes.error) throw noteRes.error;
      if (likeRes.error) throw likeRes.error;
      if (commentRes.error) throw commentRes.error;

      setInventory(invRes.data ?? []);
      setSpareParts(spRes.data ?? []);
      const likesByNote = new Map<string, Set<string>>();
      const likeNames: Record<string, string[]> = {};
      for (const l of likeRes.data ?? []) {
        const noteId = (l as any).note_id as string;
        const userId = (l as any).user_id as string;
        const userName =
          (l as any).user_name ||
          (l as any).created_by_name ||
          (l as any).email ||
          (userId === user?.id ? "You" : "Staff");
        if (!likesByNote.has(noteId)) likesByNote.set(noteId, new Set());
        likesByNote.get(noteId)!.add(userId);
        if (!likeNames[noteId]) likeNames[noteId] = [];
        if (userName && !likeNames[noteId].includes(userName)) {
          likeNames[noteId].push(userName);
        }
      }
      const commentsByNote = new Map<string, Note["comments"]>();
      for (const c of commentRes.data ?? []) {
        const noteId = (c as any).note_id as string;
        if (!commentsByNote.has(noteId)) commentsByNote.set(noteId, []);
        commentsByNote.get(noteId)!.push({
          id: (c as any).id,
          content: (c as any).content,
          user_name: (c as any).user_name,
          created_at: (c as any).created_at
        });
      }
      const userId = user?.id ?? "";
      const mappedNotes = (noteRes.data ?? []).map((n: any) => {
        const likeSet = likesByNote.get(n.id) ?? new Set<string>();
        return {
          ...mapNoteRecord(n),
          likes: likeSet.size,
          likedByMe: userId ? likeSet.has(userId) : false,
          comments: (commentsByNote.get(n.id) ?? []).sort((a, b) =>
            a.created_at.localeCompare(b.created_at)
          )
        } as Note;
      });
      setNotes(mappedNotes);
      setLikeNamesByNote(likeNames);
    } catch (err: any) {
      setError(getApiErrorMessage(err, "Failed to load dashboard data"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const lowStockItems = useMemo(() => {
    const inv = inventory
      .filter((i) => i.stock_quantity < LOW_STOCK_THRESHOLD)
      .map((i) => ({
        id: i.id,
        label: `${i.item_code} - ${i.item_name}`,
        stock: i.stock_quantity,
        price: i.price,
        type: "inventory" as const,
        item_code: i.item_code
      }));
    const sp = spareParts
      .filter((i) => i.stock_quantity < LOW_STOCK_THRESHOLD)
      .map((i) => ({
        id: i.id,
        label:
          (i.item_code ?? "").trim() ||
          (i.item_name ?? "").trim() ||
          "Blank",
        stock: i.stock_quantity,
        price: i.price,
        type: "spare_part" as const,
        item_code: null
      }));
    return [...inv, ...sp];
  }, [inventory, spareParts]);

  const unpaidSpareParts = useMemo(
    () => spareParts.filter((i) => i.payment_status !== "paid"),
    [spareParts]
  );

  function stockBarStyle(stock: number) {
    const ratio = Math.max(0, Math.min(1, stock / LOW_STOCK_THRESHOLD));
    const width = `${Math.max(12, Math.round(ratio * 100))}%`;
    let color = "#ff5876";
    if (ratio >= 0.66) color = "#64d4ff";
    else if (ratio >= 0.33) color = "#ffcc66";
    return { width, background: color };
  }

  async function restockItem(item: {
    type: "inventory" | "spare_part";
    item_code: string | null;
    id: string;
    price: number;
  }) {
    const input = prompt("Add stock quantity:", "1");
    if (!input) return;
    const qty = Math.trunc(Number(input));
    if (!Number.isFinite(qty) || qty <= 0) return;

    try {
      const supabase = requireSupabase();
      if (item.type === "inventory") {
        const { error } = await supabase.rpc("add_inventory_stock", {
          p_item_code: item.item_code,
          p_add_quantity: qty,
          p_price: item.price
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc("add_spare_part_stock_by_id", {
          p_id: item.id,
          p_add_quantity: qty,
          p_price: item.price,
          p_company: null
        });
        if (error) throw error;
      }
      await load();
    } catch (err: any) {
      alert(getApiErrorMessage(err, "Restock failed"));
    }
  }

  async function markPaid(id: string) {
    try {
      const supabase = requireSupabase();
      const { error } = await supabase
        .from("spare_parts")
        .update({ payment_status: "paid", last_updated: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      await load();
    } catch (err: any) {
      alert(getApiErrorMessage(err, "Update payment failed"));
    }
  }

  async function saveNote() {
    setNoteSaving(true);
    try {
      const supabase = requireSupabase();
      const today = new Date().toISOString().slice(0, 10);
      const name =
        user?.notesSignature?.trim() ||
        user?.firstName?.trim() ||
        user?.email ||
        "Unknown";
      const payload = {
        note_date: today,
        content: noteText,
        created_by_id: user?.id ?? null,
        created_by_name: name,
        created_at: new Date().toISOString()
      };
      let { data, error } = await supabase
        .from("daily_notes")
        .insert(payload)
        .select("*")
        .single();

      if (error && String(error.message).toLowerCase().includes("created_by")) {
        const fallback = {
          note_date: today,
          content: noteText,
          updated_by_id: user?.id ?? null,
          updated_by_name: name,
          updated_at: new Date().toISOString()
        };
        const retry = await supabase
          .from("daily_notes")
          .insert(fallback)
          .select("*")
          .single();
        data = retry.data;
        error = retry.error;
      }
      if (error) throw error;

      setNotes((prev) => [
        {
          ...mapNoteRecord(data as any),
          likes: 0,
          likedByMe: false,
          comments: []
        },
        ...prev
      ]);
      setNoteText("");
    } catch (err: any) {
      alert(getApiErrorMessage(err, "Save note failed"));
    } finally {
      setNoteSaving(false);
    }
  }

  async function toggleLike(note: Note) {
    if (!user?.id) return;
    const supabase = requireSupabase();
      const name =
        user?.notesSignature?.trim() ||
        user?.firstName?.trim() ||
        user?.email ||
        "Unknown";
    if (note.likedByMe) {
      await supabase
        .from("note_likes")
        .delete()
        .eq("note_id", note.id)
        .eq("user_id", user.id);
    } else {
      const { error } = await supabase.from("note_likes").insert({
        note_id: note.id,
        user_id: user.id,
        user_name: name
      });
      if (error && String(error.message).toLowerCase().includes("user_name")) {
        await supabase.from("note_likes").insert({
          note_id: note.id,
          user_id: user.id
        });
      } else if (error) {
        throw error;
      }
    }
    setNotes((prev) =>
      prev.map((n) =>
        n.id === note.id
          ? {
              ...n,
              likedByMe: !note.likedByMe,
              likes: note.likedByMe ? Math.max(0, n.likes - 1) : n.likes + 1
            }
          : n
      )
    );
    setLikeNamesByNote((prev) => {
      const existing = prev[note.id] ? [...prev[note.id]] : [];
      if (note.likedByMe) {
        return { ...prev, [note.id]: existing.filter((v) => v !== name) };
      }
      if (!existing.includes(name)) existing.push(name);
      return { ...prev, [note.id]: existing };
    });
  }

  async function addComment(noteId: string) {
    const text = (commentDrafts[noteId] ?? "").trim();
    if (!text) return;
    const supabase = requireSupabase();
    const name = user?.firstName?.trim() || user?.email || "Unknown";
    const { data, error } = await supabase.from("note_comments").insert({
      note_id: noteId,
      user_id: user?.id ?? null,
      user_name: name,
      content: text,
      created_at: new Date().toISOString()
    }).select("id,note_id,content,user_name,created_at").single();
    if (error) throw error;
    setCommentDrafts((m) => ({ ...m, [noteId]: "" }));
    setNotes((prev) =>
      prev.map((n) =>
        n.id === noteId
          ? {
              ...n,
              comments: [
                ...n.comments,
                {
                  id: data?.id ?? crypto.randomUUID(),
                  content: data?.content ?? text,
                  user_name: data?.user_name ?? name,
                  created_at: data?.created_at ?? new Date().toISOString()
                }
              ]
            }
          : n
      )
    );
  }

  async function deleteNote(note: Note) {
    if (!user?.id || note.created_by_id !== user.id) return;
    setDeleteTarget(note);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      const supabase = requireSupabase();
      const { error } = await supabase
        .from("daily_notes")
        .delete()
        .eq("id", deleteTarget.id);
      if (error) throw error;
      setNotes((prev) => prev.filter((n) => n.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err: any) {
      alert(getApiErrorMessage(err, "Delete note failed"));
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="container">
      <div
        className="card"
        style={{
          marginBottom: 16,
          padding: 18,
          background:
            "linear-gradient(135deg, rgba(100,212,255,0.18), rgba(255,88,118,0.08))"
        }}
      >
        <div className="row" style={{ alignItems: "baseline" }}>
          <h1 className="title" style={{ fontSize: 26 }}>
            Home
          </h1>
          <span className="muted">Quick overview</span>
          <div className="spacer" />
          <button className="button" type="button" onClick={load}>
            Refresh
          </button>
        </div>
        {error ? (
          <div
            className="muted"
            style={{ color: "rgba(255,88,118,0.92)", marginTop: 10 }}
          >
            {error}
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="muted">Loading...</div>
      ) : (
        <div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: 16
            }}
          >
          <div className={`card ${lowStockItems.length ? "glowAlert" : ""}`}>
            <div className="cardHeader">
              <div className="row">
                <h2 className="title" style={{ fontSize: 18 }}>
                  Low Stock Alerts
                </h2>
                <span className="muted">{lowStockItems.length} items</span>
              </div>
            </div>
            <div className="cardBody">
              {lowStockItems.length === 0 ? (
                <div className="muted">All good. No low stock items.</div>
              ) : (
                <div className="tableWrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Stock</th>
                        <th>Price</th>
                        <th>Restock</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lowStockItems.map((item) => (
                        <tr key={`${item.type}-${item.id}`}>
                          <td>{item.label}</td>
                          <td>
                            <span className="badge badgeWarn">{item.stock}</span>
                            <div style={{ marginTop: 6 }}>
                              <div className="stockBarWrap">
                                <div className="stockBar" style={stockBarStyle(item.stock)} />
                              </div>
                            </div>
                          </td>
                          <td>{formatMYR(item.price)}</td>
                          <td>
                            <button
                              className="button"
                              type="button"
                              onClick={() => restockItem(item)}
                            >
                              Restock
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="cardHeader">
              <div className="row">
                <h2 className="title" style={{ fontSize: 18 }}>
                  Unpaid Spare Parts
                </h2>
                <span className="muted">{unpaidSpareParts.length} items</span>
              </div>
            </div>
            <div className="cardBody">
              {unpaidSpareParts.length === 0 ? (
                <div className="muted">No unpaid spare parts.</div>
              ) : (
                <div className="tableWrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Company</th>
                        <th>Price</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unpaidSpareParts.map((item) => (
                        <tr key={item.id}>
                          <td>
                            {(item.item_code ?? "").trim() ||
                              (item.item_name ?? "").trim() ||
                              "Blank"}
                          </td>
                          <td>{item.company || "Blank"}</td>
                          <td>{formatMYR(item.price)}</td>
                          <td>
                            <button
                              className="button"
                              type="button"
                              style={{ background: "rgba(255,255,255,0.06)" }}
                              onClick={() => void markPaid(item.id)}
                            >
                              Mark Paid
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

        </div>

        <div className="card noteCard" style={{ marginTop: 16 }}>
          <div className="cardHeader">
            <div className="row">
              <h2 className="title" style={{ fontSize: 18 }}>
                <span className="noteHeaderIcon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="18" height="18">
                    <path
                      d="M6 3h9l3 3v15H6z"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.4"
                    />
                    <path
                      d="M15 3v4h4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.4"
                    />
                    <path
                      d="M8 10h8M8 14h8M8 18h6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                Notes for Today
              </h2>
              <span className="muted">{new Date().toLocaleDateString()}</span>
            </div>
          </div>
          <div className="cardBody">
            <textarea
              className="input"
              rows={6}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Type your note here..."
              style={{ width: "100%", resize: "vertical" }}
            />
            <div className="noteMeta">
              <div className="muted">
                {user?.firstName || user?.email
                  ? `- ${user?.firstName || user?.email}`
                  : "-"}
              </div>
              <button className="button" type="button" onClick={saveNote} disabled={noteSaving}>
                {noteSaving ? "Saving..." : "Post Note"}
              </button>
            </div>

            <div className="noteGrid" style={{ marginTop: 12 }}>
              {notes.length === 0 ? (
                <div className="muted">No notes yet. Be the first.</div>
              ) : (
                notes.map((n) => (
                  <div key={n.id} className="noteBubble">
                    <div style={{ whiteSpace: "pre-wrap" }}>{n.content}</div>
                      <div className="noteFooter">
                        <div className="noteTag">
                          - {(n.created_by_id === user?.id
                            ? (user?.notesSignature?.trim() ||
                                user?.firstName?.trim() ||
                                user?.email)
                            : n.created_by_name) || "Unknown"} -{" "}
                          {new Date(n.created_at).toLocaleDateString()}{" "}
                          {new Date(n.created_at).toLocaleTimeString()}
                        </div>
                        <div className="noteActions">
                          <button
                            className={`button noteLikeButton${n.likedByMe ? " liked" : ""}`}
                            type="button"
                            style={{ background: "rgba(255,255,255,0.06)" }}
                            onClick={() => void toggleLike(n)}
                          >
                            <span className="noteBtnIcon" aria-hidden="true">
                              <svg viewBox="0 0 24 24" width="16" height="16">
                                <path
                                  d="M12 20s-7-4.35-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.65-7 10-7 10z"
                                  fill={n.likedByMe ? "currentColor" : "none"}
                                  stroke="currentColor"
                                  strokeWidth="1.4"
                                />
                              </svg>
                            </span>
                            {n.likedByMe ? "Liked" : "Like"} ({n.likes})
                          </button>
                          <button
                            className="button"
                            type="button"
                            style={{ background: "rgba(255,255,255,0.04)" }}
                            onClick={() => setViewLikesNote(n)}
                          >
                            View
                          </button>
                          {n.created_by_id === user?.id ? (
                            <button
                              className="button buttonDanger"
                              type="button"
                              onClick={() => void deleteNote(n)}
                            >
                            <span className="noteBtnIcon" aria-hidden="true">
                              <svg viewBox="0 0 24 24" width="16" height="16">
                                <path
                                  d="M4 7h16M9 7V5h6v2M9 10v7M15 10v7M6 7l1 14h10l1-14"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.4"
                                  strokeLinecap="round"
                                />
                              </svg>
                            </span>
                            Delete
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <div className="commentBox">
                      {n.comments.map((c) => (
                        <div key={c.id} className="commentItem">
                          <strong>{c.user_name || "Unknown"}:</strong> {c.content}
                        </div>
                      ))}
                      <div className="row" style={{ alignItems: "stretch" }}>
                        <input
                          className="input"
                          placeholder="Write a comment..."
                          value={commentDrafts[n.id] ?? ""}
                          onChange={(e) =>
                            setCommentDrafts((m) => ({
                              ...m,
                              [n.id]: e.target.value
                            }))
                          }
                          style={{ flex: 1 }}
                        />
                        <button
                          className="button"
                          type="button"
                          onClick={() => void addComment(n.id)}
                        >
                          <span className="noteBtnIcon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" width="16" height="16">
                              <path
                                d="M5 5h14v10H8l-3 3z"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.4"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </span>
                          Comment
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
      )}
      <Modal
        open={Boolean(deleteTarget)}
        title="Delete this note?"
        onClose={() => setDeleteTarget(null)}
        showCloseButton={false}
        solid
        width="min(520px, 100%)"
        cardClassName="noteConfirmCard"
      >
        <div className="noteConfirmContent">
          <div className="noteConfirmIcon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="30" height="30">
              <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <path d="M12 8v6M12 17v1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </div>
          <div className="noteConfirmText">This note will be removed for everyone.</div>
          <div className="noteConfirmActions">
            <button className="button" type="button" onClick={() => setDeleteTarget(null)}>
              Cancel
            </button>
            <button
              className="button buttonDanger"
              type="button"
              onClick={confirmDelete}
              disabled={deleteBusy}
            >
              {deleteBusy ? "Deleting..." : "Delete Note"}
            </button>
          </div>
        </div>
      </Modal>
      <Modal
        open={Boolean(viewLikesNote)}
        title="Likes"
        onClose={() => setViewLikesNote(null)}
        solid
        width="min(440px, 100%)"
        cardClassName="noteLikesCard"
      >
        <div className="noteLikesList">
          {(viewLikesNote && likeNamesByNote[viewLikesNote.id]?.length) ? (
            likeNamesByNote[viewLikesNote.id].map((name) => (
              <div key={name} className="noteLikeRow">
                <span className="noteLikeDot" aria-hidden="true" />
                <span>{name}</span>
              </div>
            ))
          ) : (
            <div className="muted">No likes yet.</div>
          )}
        </div>
      </Modal>
    </div>
  );
}
