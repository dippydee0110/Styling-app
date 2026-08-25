"use client";

import { useState } from "react";
import { SavedLook } from "../lib/types";

interface Props {
  savedLooks: SavedLook[];
  canSave: boolean;
  onSave: () => void;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}

export default function SavedLooksPanel({
  savedLooks,
  canSave,
  onSave,
  onLoad,
  onDelete,
  onRename,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  function startEditing(look: SavedLook) {
    setEditingId(look.id);
    setDraftName(look.name);
  }

  function commitRename(id: string) {
    onRename(id, draftName);
    setEditingId(null);
  }

  return (
    <div className="rounded-2xl border border-sand bg-white/60 p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg text-ink">Saved looks</h2>
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          className="shrink-0 rounded-lg border border-accent px-3 py-1.5 text-xs font-medium text-accent transition hover:bg-accent hover:text-paper disabled:cursor-not-allowed disabled:opacity-40"
        >
          Save this look
        </button>
      </div>

      {savedLooks.length === 0 ? (
        <p className="mt-3 text-sm text-ink/50">
          Generate a look, then save it here so you can come back to it later.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {savedLooks.map((look) => (
            <li
              key={look.id}
              className="flex items-center gap-3 rounded-xl border border-sand/70 p-2"
            >
              <img
                src={look.model.imageUrl}
                alt={look.name}
                className="h-14 w-11 shrink-0 rounded-lg object-cover"
              />
              <div className="min-w-0 flex-1">
                {editingId === look.id ? (
                  <input
                    autoFocus
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    onBlur={() => commitRename(look.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename(look.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="w-full rounded-md border border-accent bg-paper px-1.5 py-0.5 text-sm text-ink outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => startEditing(look)}
                    title="Click to rename"
                    className="block w-full truncate text-left text-sm font-medium text-ink hover:underline"
                  >
                    {look.name}
                  </button>
                )}
                <p className="text-xs text-ink/50">{new Date(look.savedAt).toLocaleDateString()}</p>
              </div>
              <button
                type="button"
                onClick={() => onLoad(look.id)}
                className="shrink-0 rounded-lg border border-sand px-2 py-1 text-xs text-ink/70 transition hover:border-accent hover:text-accent"
              >
                Load
              </button>
              <button
                type="button"
                onClick={() => onDelete(look.id)}
                aria-label={`Delete ${look.name}`}
                className="shrink-0 text-ink/40 transition hover:text-red-500"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
