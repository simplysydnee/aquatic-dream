/**
 * Tracking for the summer 2026 outreach link (/join?src=summer2026).
 * The src param rides through the whole join flow, including the Stripe
 * return_url, so a finished membership is traceable back to the text.
 */
export const RECOGNIZED_OUTREACH_SRCS = ["summer2026", "fall2026"] as const;

export type OutreachSrc = (typeof RECOGNIZED_OUTREACH_SRCS)[number];

export const isRecognizedOutreachSrc = (src: string | null): boolean =>
  !!src && (RECOGNIZED_OUTREACH_SRCS as readonly string[]).includes(src);

const SEEN_KEY = "welcomeBackSeen";
const SRC_KEY = "joinSrc";

export const readSrcParam = (): string | null => {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("src");
  return value && value.length <= 64 ? value : null;
};

/** src from the URL, falling back to whatever this session already captured. */
export const resolveJoinSrc = (): string | null => {
  if (typeof window === "undefined") return null;
  const fromUrl = readSrcParam();
  if (fromUrl) {
    try {
      window.sessionStorage.setItem(SRC_KEY, fromUrl);
    } catch {
      // Private browsing: tracking is best effort, never blocks enrollment.
    }
    return fromUrl;
  }
  try {
    return window.sessionStorage.getItem(SRC_KEY);
  } catch {
    return null;
  }
};

export const hasSeenWelcomeBack = (): boolean => {
  if (typeof window === "undefined") return true;
  try {
    return window.sessionStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
};

export const markWelcomeBackSeen = (): void => {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Ignore: worst case the page shows once more.
  }
};
