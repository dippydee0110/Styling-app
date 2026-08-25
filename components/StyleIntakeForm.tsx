"use client";

import { useState } from "react";
import { StyleProfile } from "../lib/types";

interface Props {
  initialProfile: StyleProfile;
  isGenerating: boolean;
  onGenerate: (profile: StyleProfile) => void;
}

export default function StyleIntakeForm({ initialProfile, isGenerating, onGenerate }: Props) {
  const [freeText, setFreeText] = useState(initialProfile.freeText);
  const [region, setRegion] = useState(initialProfile.region ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!freeText.trim()) return;
    onGenerate({ freeText: freeText.trim(), region: region.trim() });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-sand bg-white/60 p-5 shadow-sm">
      <h2 className="font-display text-lg text-ink">Tell us about you</h2>
      <p className="mt-1 text-sm text-ink/60">
        Write in plain English — body type, height/weight, ethnicity, any characteristics, your
        style preferences, and the occasion (e.g. office wear, a wedding, a casual weekend). The
        more detail, the better the recommendations.
      </p>
      <textarea
        value={freeText}
        onChange={(e) => setFreeText(e.target.value)}
        placeholder={`e.g. "I'm a 5'6\", curvy South Asian woman, around 65kg. I prefer earthy tones and modest, tailored fits. Looking for something for a client-facing office day."`}
        rows={6}
        className="mt-3 w-full resize-none rounded-xl border border-sand bg-paper p-3 text-sm text-ink outline-none focus:border-accent"
      />
      <div className="mt-3">
        <input
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          placeholder="Region (e.g. India, US)"
          className="w-full rounded-xl border border-sand bg-paper p-2 text-sm outline-none focus:border-accent"
        />
      </div>
      <button
        type="submit"
        disabled={isGenerating || !freeText.trim()}
        className="mt-4 w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-paper transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isGenerating ? "Styling your look..." : "Generate My Look"}
      </button>
    </form>
  );
}
