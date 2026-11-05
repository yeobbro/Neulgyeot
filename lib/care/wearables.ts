/**
 * Wearable adapters (smartwatch / smart ring). Extension point only in the MVP.
 *
 * Not every watch or ring can read or emulate NFC, and most consumer devices do not expose NFC to third-party apps at all.
 * An adapter therefore declares its capabilities; the capture flow only offers what a device actually supports and falls back to
 * QR / mobile web. No vendor SDK is bundled in this prototype.
 */
import type { CareType, SourceDevice } from "./types";

export interface WearableCapabilities {
  nfcRead: boolean;            // can read the bedside NFC tag
  hostCardEmulation: boolean;  // can act as the staff badge
  quickActions: boolean;       // can show a care-type picker / confirm button
}

export interface WearableCapture {
  badgeId: string | null;
  residentTag: string | null;
  careType: CareType | null;
  capturedAt: string;
}

export interface WearableAdapter {
  readonly kind: Extract<SourceDevice, "wearable_watch" | "wearable_ring">;
  readonly model: string;
  readonly capabilities: WearableCapabilities;
  /** Converts a vendor payload into a capture; returns null when the payload is not usable. */
  toCapture(raw: unknown): WearableCapture | null;
}

export type CaptureRoute = "wearable_nfc" | "wearable_confirm_only" | "qr_fallback";

/** Which capture route a device can actually support. */
export function captureRoute(a: WearableAdapter | null): CaptureRoute {
  if (!a) return "qr_fallback";
  if (a.capabilities.nfcRead && a.capabilities.quickActions) return "wearable_nfc";
  if (a.capabilities.quickActions) return "wearable_confirm_only";   // e.g. confirm a QR-started event on the wrist
  return "qr_fallback";
}

/** Demo adapter used in tests/UI: a generic watch WITHOUT NFC access (the common case). */
export const GENERIC_WATCH_NO_NFC: WearableAdapter = {
  kind: "wearable_watch",
  model: "Generic watch (NFC unavailable to apps) · DEMO",
  capabilities: { nfcRead: false, hostCardEmulation: false, quickActions: true },
  toCapture(raw) {
    const r = raw as Partial<WearableCapture> | null;
    if (!r || typeof r.capturedAt !== "string") return null;
    return { badgeId: r.badgeId ?? null, residentTag: null, careType: r.careType ?? null, capturedAt: r.capturedAt };
  }
};

/** Demo adapter: a ring that can only act as a badge (no screen). */
export const GENERIC_RING_BADGE: WearableAdapter = {
  kind: "wearable_ring",
  model: "Generic ring (badge emulation) · DEMO",
  capabilities: { nfcRead: false, hostCardEmulation: true, quickActions: false },
  toCapture(raw) {
    const r = raw as Partial<WearableCapture> | null;
    if (!r || typeof r.badgeId !== "string" || typeof r.capturedAt !== "string") return null;
    return { badgeId: r.badgeId, residentTag: null, careType: null, capturedAt: r.capturedAt };
  }
};
