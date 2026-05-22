"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { BANK_BILLER_MAP, BANK_OPTIONS } from "@/lib/banks";
import { Spinner } from "@/components/Spinner";
import type { Card, CardProfile } from "@/lib/types";
import { creditCardUpiInfo, supportsCreditCardUpi } from "@/lib/upi-vpa";

type FormState = {
  nickname: string;
  bank: string;
  last4: string;
  mobile: string;
  profileId: string;
  newProfileName: string;
};

type Props = {
  card?: Card | null;
  profiles: CardProfile[];
  onProfilesChange?: (profiles: CardProfile[]) => void;
  onSaved: () => void;
  onCancel: () => void;
};

function emptyForm(): FormState {
  return {
    nickname: "",
    bank: "",
    last4: "",
    mobile: "",
    profileId: "",
    newProfileName: "",
  };
}

function formFromCard(card: Card): FormState {
  return {
    nickname: card.nickname,
    bank: card.bank,
    last4: card.last4,
    mobile: card.mobile,
    profileId: card.profile_id ?? "",
    newProfileName: "",
  };
}

type FormAction =
  | { type: "patch"; fields: Partial<FormState> }
  | { type: "reset"; card?: Card | null };

function formReducer(state: FormState, action: FormAction): FormState {
  if (action.type === "reset") {
    return action.card ? formFromCard(action.card) : emptyForm();
  }
  return { ...state, ...action.fields };
}

export function CardForm({
  card,
  profiles,
  onProfilesChange,
  onSaved,
  onCancel,
}: Props) {
  const isEdit = Boolean(card?.id);
  const formKey = card?.id ?? "new";
  const initializedKey = useRef<string | null>(null);

  const [form, dispatch] = useReducer(
    formReducer,
    card ?? null,
    (c) => (c ? formFromCard(c) : emptyForm())
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initializedKey.current === formKey) return;
    initializedKey.current = formKey;
    dispatch({ type: "reset", card: card ?? null });
    setError("");
  }, [formKey, card]);

  const setField = useCallback((fields: Partial<FormState>) => {
    dispatch({ type: "patch", fields });
  }, []);

  async function resolveProfileId(): Promise<string | null | undefined> {
    let resolved = form.profileId || null;
    const trimmedNew = form.newProfileName.trim();

    if (!resolved && trimmedNew) {
      const existing = profiles.find(
        (p) => p.name.toLowerCase() === trimmedNew.toLowerCase()
      );
      if (existing) return existing.id;
    }

    if (!resolved && trimmedNew) {
      const pr = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedNew }),
      });
      const prJson = await pr.json();
      if (!pr.ok) {
        throw new Error(prJson.error ?? "Failed to create profile");
      }
      const created = prJson.profile as CardProfile;
      onProfilesChange?.([...profiles, created]);
      return created.id;
    }

    return resolved;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const profile_id = await resolveProfileId();
      const payload = {
        nickname: form.nickname.trim(),
        bank: form.bank,
        last4: form.last4,
        mobile: form.mobile,
        profile_id: profile_id ?? null,
      };

      const url = isEdit ? `/api/cards/${card!.id}` : "/api/cards";
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to save");
        return;
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="p-6 rounded-xl border border-[var(--border)] bg-[var(--card)] grid gap-4 md:grid-cols-2"
    >
      <div className="md:col-span-2 flex items-center justify-between gap-2">
        <h3 className="font-semibold">
          {isEdit ? `Edit card · ${card?.nickname}` : "Add card"}
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
        >
          Cancel
        </button>
      </div>

      <label className="block">
        <span className="text-sm text-[var(--muted)]">Nickname</span>
        <input
          required
          value={form.nickname}
          onChange={(e) => setField({ nickname: e.target.value })}
          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
          placeholder="HDFC Regalia"
          autoComplete="off"
        />
      </label>

      <label className="block">
        <span className="text-sm text-[var(--muted)]">Profile (owner)</span>
        <select
          value={form.profileId}
          onChange={(e) =>
            setField({ profileId: e.target.value, newProfileName: "" })
          }
          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
        >
          <option value="">Unassigned</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block md:col-span-2">
        <span className="text-sm text-[var(--muted)]">
          Or create new profile
        </span>
        <input
          value={form.newProfileName}
          onChange={(e) =>
            setField({ newProfileName: e.target.value, profileId: "" })
          }
          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
          placeholder="e.g. Mine, Father, Wife"
          autoComplete="off"
        />
      </label>

      <label className="block">
        <span className="text-sm text-[var(--muted)]">Bank</span>
        <select
          required
          value={form.bank}
          onChange={(e) => setField({ bank: e.target.value })}
          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
        >
          <option value="" disabled>
            Select bank…
          </option>
          {BANK_OPTIONS.map((b) => (
            <option key={b} value={b}>
              {BANK_BILLER_MAP[b]?.name ?? b}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-sm text-[var(--muted)]">Last 4 digits</span>
        <input
          required
          maxLength={4}
          inputMode="numeric"
          value={form.last4}
          onChange={(e) =>
            setField({ last4: e.target.value.replace(/\D/g, "").slice(0, 4) })
          }
          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
          autoComplete="off"
        />
      </label>

      <label className="block md:col-span-2">
        <span className="text-sm text-[var(--muted)]">Registered mobile</span>
        <input
          required
          maxLength={10}
          inputMode="numeric"
          value={form.mobile}
          onChange={(e) =>
            setField({ mobile: e.target.value.replace(/\D/g, "").slice(0, 10) })
          }
          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2"
          autoComplete="off"
        />
        <p className="text-xs text-[var(--muted)] mt-1">
          10-digit number registered with the bank (used for bill fetch and
          Axis/ICICI card UPI).
        </p>
      </label>

      {supportsCreditCardUpi(form.bank) && (
        <div className="md:col-span-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
          <p className="text-xs text-[var(--muted)] mb-1">
            Card-linked UPI ID (preview)
          </p>
          {(() => {
            const info = creditCardUpiInfo(form.bank, form.mobile, form.last4);
            if (!info) {
              return (
                <p className="text-sm text-[var(--muted)]">
                  Enter valid 10-digit mobile and 4-digit last4 to generate UPI
                  ID.
                </p>
              );
            }
            return (
              <>
                <p className="text-sm font-mono break-all">{info.vpa}</p>
                <p className="text-xs text-[var(--muted)] mt-1">{info.format}</p>
              </>
            );
          })()}
        </div>
      )}

      {error && (
        <p className="md:col-span-2 text-sm text-[var(--danger)]">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="md:col-span-2 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {loading && <Spinner />}
        {loading ? "Saving…" : isEdit ? "Save changes" : "Save card"}
      </button>
    </form>
  );
}
