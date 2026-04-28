"use client";

import type { SavedRoute } from "@routax/shared";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useFeatureFlags } from "../../hooks/useFeatureFlags";
import { deleteRoute, getRoute, listRoutes, updateRoute } from "../../lib/api";

const PAGE_SIZE = 20;
const NAME_MAX = 80;

function formatRelative(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months > 1 ? "s" : ""} ago`;
  return new Date(iso).toLocaleDateString();
}

function SkeletonRows() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div key={i} className="routes-skeleton-row" aria-hidden="true" />
      ))}
    </>
  );
}

export default function RoutesPage() {
  const router = useRouter();
  const { flags, isReady } = useFeatureFlags();

  const [items, setItems] = useState<SavedRoute[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [openKebabId, setOpenKebabId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameSaving, setRenameSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<SavedRoute | null>(null);
  const [deleteInProgress, setDeleteInProgress] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!isReady || !flags.saved_routes_ui) return;
    const ac = new AbortController();
    setLoading(true);
    void listRoutes(PAGE_SIZE, undefined, ac.signal)
      .then((res) => {
        setItems(res.items);
        setNextCursor(res.nextCursor ?? null);
        setLoading(false);
      })
      .catch((e) => {
        if (e instanceof Error && e.name === "AbortError") return;
        setLoading(false);
      });
    return () => ac.abort();
  }, [isReady, flags.saved_routes_ui]);

  useEffect(() => {
    if (deleteTarget) {
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
    }
  }, [deleteTarget]);

  function openRoute(id: string) {
    router.push(`/?route=${encodeURIComponent(id)}`);
  }

  function startRename(item: SavedRoute) {
    setOpenKebabId(null);
    setRenamingId(item.id);
    setRenameInput(item.name);
    setRenameError(null);
  }

  async function submitRename(id: string) {
    const trimmed = renameInput.trim();
    if (trimmed.length === 0) {
      setRenameError("Name is required.");
      return;
    }
    if (trimmed.length > NAME_MAX) {
      setRenameError(`Name must be at most ${NAME_MAX} characters.`);
      return;
    }
    setRenameError(null);
    setRenameSaving(true);
    const original = items.find((r) => r.id === id)?.name ?? "";
    try {
      const updated = await updateRoute(id, trimmed);
      setItems((prev) => prev.map((r) => (r.id === id ? updated : r)));
      setRenamingId(null);
    } catch {
      setItems((prev) => prev.map((r) => (r.id === id ? { ...r, name: original } : r)));
      setRenameError("Save failed. Please try again.");
    } finally {
      setRenameSaving(false);
    }
  }

  function cancelRename() {
    setRenamingId(null);
    setRenameInput("");
    setRenameError(null);
  }

  function promptDelete(item: SavedRoute) {
    setOpenKebabId(null);
    setDeleteTarget(item);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    const snapshot = [...items];
    setDeleteInProgress(true);
    setItems((prev) => prev.filter((r) => r.id !== id));
    setDeleteTarget(null);
    try {
      await deleteRoute(id);
    } catch {
      const restored = await getRoute(id).catch(() => null);
      if (restored) {
        setItems((prev) => {
          const idx = snapshot.findIndex((r) => r.id === id);
          const next = [...prev];
          next.splice(idx, 0, restored);
          return next;
        });
      }
    } finally {
      setDeleteInProgress(false);
    }
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await listRoutes(PAGE_SIZE, nextCursor);
      setItems((prev) => [...prev, ...res.items]);
      setNextCursor(res.nextCursor ?? null);
    } finally {
      setLoadingMore(false);
    }
  }

  if (!isReady) {
    return (
      <div className="routes-page">
        <header className="routes-header">
          <a href="/" className="routes-back">
            ← Planner
          </a>
          <h1>My Routes</h1>
        </header>
        <div className="routes-table" aria-busy="true">
          <SkeletonRows />
        </div>
      </div>
    );
  }

  if (!flags.saved_routes_ui) {
    return (
      <div className="routes-page">
        <header className="routes-header">
          <a href="/" className="routes-back">
            ← Planner
          </a>
          <h1>My Routes</h1>
        </header>
        <p className="routes-coming-soon">Coming soon</p>
      </div>
    );
  }

  return (
    <div className="routes-page">
      <header className="routes-header">
        <a href="/" className="routes-back">
          ← Planner
        </a>
        <h1>My Routes</h1>
      </header>

      <ul className="routes-table">
        {loading && <SkeletonRows />}

        {!loading && items.length === 0 && (
          <p className="routes-empty">
            No saved routes yet. <a href="/">Plan one →</a>
          </p>
        )}

        {items.map((item) => {
          const isRenaming = renamingId === item.id;
          const kebabOpen = openKebabId === item.id;

          return (
            <li
              key={item.id}
              className={`routes-row${isRenaming ? " routes-row--renaming" : ""}`}
              tabIndex={isRenaming ? -1 : 0}
              onClick={() => {
                if (!isRenaming) openRoute(item.id);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isRenaming) openRoute(item.id);
              }}
            >
              <div className="routes-row-name">
                {isRenaming ? (
                  <div
                    className="routes-rename-editor"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <input
                      className="routes-rename-input"
                      value={renameInput}
                      maxLength={NAME_MAX}
                      disabled={renameSaving}
                      onChange={(e) => {
                        setRenameInput(e.target.value);
                        setRenameError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void submitRename(item.id);
                        if (e.key === "Escape") cancelRename();
                      }}
                    />
                    {renameError && (
                      <p className="routes-rename-error" role="alert">
                        {renameError}
                      </p>
                    )}
                    <div className="routes-rename-actions">
                      <button
                        type="button"
                        className="routes-rename-save"
                        disabled={renameSaving}
                        onClick={() => void submitRename(item.id)}
                      >
                        {renameSaving ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        className="routes-rename-cancel"
                        disabled={renameSaving}
                        onClick={cancelRename}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <span>{item.name}</span>
                )}
              </div>

              <div className="routes-row-meta">
                <span>{(item.distance / 1000).toFixed(1)} km</span>
                <span>↑ {item.ascent} m</span>
                <span className="routes-row-date">{formatRelative(item.createdAt)}</span>
              </div>

              <div
                className="routes-kebab-wrapper"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="routes-kebab-btn"
                  aria-label="Route actions"
                  aria-expanded={kebabOpen}
                  aria-haspopup="menu"
                  onClick={() => setOpenKebabId(kebabOpen ? null : item.id)}
                >
                  ⋯
                </button>
                {kebabOpen && (
                  <div className="routes-kebab-menu" role="menu">
                    <button type="button" role="menuitem" onClick={() => openRoute(item.id)}>
                      Open
                    </button>
                    <button type="button" role="menuitem" onClick={() => startRename(item)}>
                      Rename
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="routes-kebab-delete"
                      onClick={() => promptDelete(item)}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {nextCursor && !loading && (
        <button
          type="button"
          className="routes-load-more"
          disabled={loadingMore}
          onClick={() => void loadMore()}
        >
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      )}

      <dialog
        ref={dialogRef}
        className="routes-confirm-dialog"
        onClose={() => setDeleteTarget(null)}
      >
        <p>
          Delete <strong>{deleteTarget?.name}</strong>? This can&apos;t be undone.
        </p>
        <div className="routes-confirm-actions">
          <button type="button" onClick={() => setDeleteTarget(null)} disabled={deleteInProgress}>
            Cancel
          </button>
          <button
            type="button"
            className="routes-confirm-delete"
            onClick={() => void confirmDelete()}
            disabled={deleteInProgress}
          >
            {deleteInProgress ? "Deleting…" : "Delete"}
          </button>
        </div>
      </dialog>
    </div>
  );
}
