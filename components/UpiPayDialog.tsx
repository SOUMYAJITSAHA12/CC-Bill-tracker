"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import type { CreditCardUpiIssuer } from "@/lib/upi-vpa";

export type UpiPayDialogProps = {
  open: boolean;
  onClose: () => void;
  nickname: string;
  bankLabel: string;
  issuer: CreditCardUpiIssuer;
  vpa: string;
  upiUrl: string;
  format: string;
  amount?: number;
};

function formatInr(n: number) {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

async function dataUrlToFile(dataUrl: string, filename: string): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type || "image/png" });
}

export function UpiPayDialog({
  open,
  onClose,
  nickname,
  bankLabel,
  issuer,
  vpa,
  upiUrl,
  format,
  amount,
}: UpiPayDialogProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState("");
  const [copied, setCopied] = useState<"vpa" | "url" | null>(null);
  const [shareSupported, setShareSupported] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState("");

  useEffect(() => {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      setShareSupported(true);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      setQrDataUrl(null);
      setQrError("");
      setCopied(null);
      setShareError("");
      setSharing(false);
      return;
    }

    let cancelled = false;
    QRCode.toDataURL(upiUrl, {
      width: 280,
      margin: 2,
      errorCorrectionLevel: "M",
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch((e) => {
        if (!cancelled) {
          setQrError(e instanceof Error ? e.message : "Could not generate QR");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, upiUrl]);

  const copyText = useCallback(async (text: string, kind: "vpa" | "url") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  }, []);

  const shareQr = useCallback(async () => {
    if (sharing) return;
    setShareError("");
    setSharing(true);
    try {
      const safeName = nickname.replace(/[^\w-]+/g, "_") || "card";
      const title = `Pay ${nickname}`;
      const text = `${nickname} (${bankLabel})\nUPI ID: ${vpa}\n${upiUrl}`;

      let sharedAsFile = false;
      if (qrDataUrl) {
        try {
          const file = await dataUrlToFile(qrDataUrl, `upi-${safeName}.png`);
          const candidate: ShareData = { title, text, files: [file] };
          if (
            typeof navigator.canShare === "function" &&
            navigator.canShare(candidate)
          ) {
            await navigator.share(candidate);
            sharedAsFile = true;
          }
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") {
            return;
          }
        }
      }

      if (!sharedAsFile) {
        try {
          await navigator.share({ title, text });
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") return;
          throw err;
        }
      }
    } catch (e) {
      setShareError(
        e instanceof Error ? e.message : "Sharing not supported on this device"
      );
    } finally {
      setSharing(false);
    }
  }, [bankLabel, nickname, qrDataUrl, sharing, upiUrl, vpa]);

  if (!open) return null;

  const issuerLabel = issuer === "axis" ? "Axis Bank" : "ICICI Bank";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-labelledby="upi-dialog-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl max-h-[90vh] overflow-y-auto">
        <h3 id="upi-dialog-title" className="font-semibold text-lg">
          Pay via UPI
        </h3>
        <p className="text-sm text-[var(--muted)] mt-1">
          {nickname} · {bankLabel}
        </p>
        <p className="text-xs text-[var(--muted)] mt-2">
          {issuerLabel} card-linked UPI ({format}). Uses registered mobile + last
          4 digits only.
        </p>

        {amount != null && amount > 0 && (
          <p className="mt-3 text-lg font-semibold text-brand-600">
            Amount: {formatInr(amount)}
          </p>
        )}

        <div className="mt-4 flex flex-col items-center gap-3">
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrDataUrl}
              alt="UPI payment QR code"
              className="rounded-lg border border-[var(--border)] bg-white p-2"
              width={280}
              height={280}
            />
          ) : qrError ? (
            <p className="text-sm text-[var(--danger)]">{qrError}</p>
          ) : (
            <p className="text-sm text-[var(--muted)]">Generating QR…</p>
          )}
          <p className="text-xs text-[var(--muted)] text-center">
            Scan with any UPI app (GPay, PhonePe, Paytm, bank app)
          </p>
        </div>

        <div className="mt-4 space-y-2">
          <label className="block text-xs text-[var(--muted)]">UPI ID (VPA)</label>
          <div className="flex gap-2">
            <input
              readOnly
              value={vpa}
              className="flex-1 text-sm px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] font-mono"
            />
            <button
              type="button"
              onClick={() => copyText(vpa, "vpa")}
              className="text-sm px-3 py-2 rounded-lg border border-[var(--border)] hover:bg-[var(--bg)] shrink-0"
            >
              {copied === "vpa" ? "Copied" : "Copy"}
            </button>
          </div>
        </div>

        {shareError && (
          <p className="mt-3 text-xs text-[var(--danger)]">{shareError}</p>
        )}

        <div className="mt-3 flex flex-wrap gap-2 justify-end">
          {shareSupported && (
            <button
              type="button"
              onClick={shareQr}
              disabled={sharing || !qrDataUrl}
              className="text-sm px-3 py-2 rounded-lg border border-brand-600 text-brand-600 hover:bg-brand-600/10 disabled:opacity-50 inline-flex items-center gap-1.5"
              title="Share QR or UPI link via any app on your phone"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
              {sharing ? "Sharing…" : "Share"}
            </button>
          )}
          <button
            type="button"
            onClick={() => copyText(upiUrl, "url")}
            className="text-sm px-3 py-2 rounded-lg border border-[var(--border)]"
          >
            {copied === "url" ? "Link copied" : "Copy pay link"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-sm px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
