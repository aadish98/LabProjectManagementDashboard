import type { DashboardDataset, SheetRegistryEntry } from "./experiment";

/**
 * Employee-owned profile metadata. Stored as key/value rows in the
 * `Profile` tab at the end of each employee's task-log workbook. The
 * task-log workbook is the source of truth; local caches are refresh
 * optimizations only.
 */
export interface EmployeeProfile {
  displayName: string;
  /** Resized image data URL (WebP/PNG) or empty string for initials-only. */
  profilePictureDataUrl: string;
  /** ISO timestamp written when the profile was last saved. */
  updatedAt: string;
}

/**
 * Maximum stored profile picture size, in bytes of the raw data URL
 * string. Roughly 32 KB after base64 encoding (so ~24 KB of binary).
 * Beyond this, we refuse to write to the Sheet, because it bloats the
 * cell, slows the dashboard sync, and risks hitting Google Sheets cell
 * size limits.
 */
export const PROFILE_PICTURE_DATA_URL_BYTE_LIMIT = 32 * 1024;

/** Target output dimensions for the resized avatar (square). */
export const PROFILE_PICTURE_TARGET_PX = 160;

/** Accepted image MIME types for upload. SVG is intentionally rejected. */
export const PROFILE_PICTURE_ACCEPT = ["image/png", "image/jpeg", "image/webp"];

export interface LabMemberProfile {
  labMember: string;
  initials: string;
  accentColor: string;
  accentSurface: string;
  accentBorder: string;
  /**
   * Optional avatar URL. Populated from the employee task-log `Profile`
   * tab when available. When undefined, renderers fall back to
   * deterministic initials/colors.
   */
  profilePictureUrl?: string;
}

/**
 * Muted per-member hues tuned for the dark theme: similar lightness and
 * low chroma so members stay distinguishable without any one of them
 * shouting. Surfaces and borders are translucent tints of the same hue.
 */
const MEMBER_ACCENTS = [
  { color: "#9cb5a3", surface: "rgba(156, 181, 163, 0.12)", border: "rgba(156, 181, 163, 0.38)" },
  { color: "#92a9c4", surface: "rgba(146, 169, 196, 0.12)", border: "rgba(146, 169, 196, 0.38)" },
  { color: "#b3a0c8", surface: "rgba(179, 160, 200, 0.12)", border: "rgba(179, 160, 200, 0.38)" },
  { color: "#c4a381", surface: "rgba(196, 163, 129, 0.12)", border: "rgba(196, 163, 129, 0.38)" },
  { color: "#bcae7e", surface: "rgba(188, 174, 126, 0.12)", border: "rgba(188, 174, 126, 0.38)" },
  { color: "#c295a1", surface: "rgba(194, 149, 161, 0.12)", border: "rgba(194, 149, 161, 0.38)" },
  { color: "#8db3ae", surface: "rgba(141, 179, 174, 0.12)", border: "rgba(141, 179, 174, 0.38)" },
  { color: "#bd9a8d", surface: "rgba(189, 154, 141, 0.12)", border: "rgba(189, 154, 141, 0.38)" }
];

function hashString(value: string): number {
  return Array.from(value).reduce((hash, char) => {
    return (hash * 31 + char.charCodeAt(0)) >>> 0;
  }, 7);
}

export function initialsForName(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function profileForLabMember(
  labMember: string,
  _registryEntry?: SheetRegistryEntry,
  profilePictureUrl?: string
): LabMemberProfile {
  const accent = MEMBER_ACCENTS[hashString(labMember) % MEMBER_ACCENTS.length];
  const profile: LabMemberProfile = {
    labMember,
    initials: initialsForName(labMember),
    accentColor: accent.color,
    accentSurface: accent.surface,
    accentBorder: accent.border
  };
  if (profilePictureUrl && profilePictureUrl.trim()) {
    profile.profilePictureUrl = profilePictureUrl.trim();
  }
  return profile;
}

export function buildLabMemberProfiles(
  registry: SheetRegistryEntry[],
  labMembers: string[],
  profilePicturesByLabMember?: Record<string, string | undefined>
): Record<string, LabMemberProfile> {
  const registryByMember = new Map(registry.map((entry) => [entry.labMember, entry]));
  return labMembers.reduce<Record<string, LabMemberProfile>>((profiles, labMember) => {
    profiles[labMember] = profileForLabMember(
      labMember,
      registryByMember.get(labMember),
      profilePicturesByLabMember?.[labMember]
    );
    return profiles;
  }, {});
}

export function resolveManagerLabMember(
  memberId: string,
  dataset: DashboardDataset
): { labMember: string; registryEntry: SheetRegistryEntry } | null {
  const entry = dataset.registry.find(
    (candidate) => candidate.memberId?.trim() === memberId.trim()
  );
  return entry ? { labMember: entry.labMember, registryEntry: entry } : null;
}
