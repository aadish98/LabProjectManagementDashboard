import type { SheetRegistryEntry } from "./experiment";

export interface LabMemberProfile {
  labMember: string;
  initials: string;
  accentColor: string;
  accentSurface: string;
  accentBorder: string;
  profilePictureUrl?: string;
}

const MEMBER_ACCENTS = [
  { color: "#38bdf8", surface: "rgba(56, 189, 248, 0.14)", border: "rgba(56, 189, 248, 0.44)" },
  { color: "#a78bfa", surface: "rgba(167, 139, 250, 0.14)", border: "rgba(167, 139, 250, 0.44)" },
  { color: "#f472b6", surface: "rgba(244, 114, 182, 0.14)", border: "rgba(244, 114, 182, 0.44)" },
  { color: "#34d399", surface: "rgba(52, 211, 153, 0.14)", border: "rgba(52, 211, 153, 0.44)" },
  { color: "#fbbf24", surface: "rgba(251, 191, 36, 0.14)", border: "rgba(251, 191, 36, 0.46)" },
  { color: "#fb7185", surface: "rgba(251, 113, 133, 0.14)", border: "rgba(251, 113, 133, 0.44)" },
  { color: "#2dd4bf", surface: "rgba(45, 212, 191, 0.14)", border: "rgba(45, 212, 191, 0.44)" },
  { color: "#c084fc", surface: "rgba(192, 132, 252, 0.14)", border: "rgba(192, 132, 252, 0.44)" }
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
  registryEntry?: SheetRegistryEntry
): LabMemberProfile {
  const accent = MEMBER_ACCENTS[hashString(labMember) % MEMBER_ACCENTS.length];
  return {
    labMember,
    initials: initialsForName(labMember),
    accentColor: accent.color,
    accentSurface: accent.surface,
    accentBorder: accent.border,
    profilePictureUrl: registryEntry?.profilePictureUrl?.trim() || undefined
  };
}

export function buildLabMemberProfiles(
  registry: SheetRegistryEntry[],
  labMembers: string[]
): Record<string, LabMemberProfile> {
  const registryByMember = new Map(registry.map((entry) => [entry.labMember, entry]));
  return labMembers.reduce<Record<string, LabMemberProfile>>((profiles, labMember) => {
    profiles[labMember] = profileForLabMember(labMember, registryByMember.get(labMember));
    return profiles;
  }, {});
}
