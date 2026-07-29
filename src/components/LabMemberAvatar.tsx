import { useState, type CSSProperties } from "react";
import type { LabMemberProfile } from "../domain/people";

interface LabMemberAvatarProps {
  profile: LabMemberProfile;
  className?: string;
}

export function memberStyleVars(profile?: LabMemberProfile): CSSProperties {
  return {
    "--member-accent": profile?.accentColor ?? "#9cb5a3",
    "--member-surface": profile?.accentSurface ?? "rgba(156, 181, 163, 0.12)",
    "--member-border": profile?.accentBorder ?? "rgba(156, 181, 163, 0.38)"
  } as CSSProperties;
}

export function LabMemberAvatar({ profile, className = "" }: LabMemberAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const canShowImage = !!profile.profilePictureUrl && !imageFailed;

  return (
    <span
      className={`lab-member-avatar ${className}`.trim()}
      style={memberStyleVars(profile)}
      aria-label={`${profile.labMember} profile picture`}
    >
      {canShowImage ? (
        <img
          src={profile.profilePictureUrl}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span aria-hidden="true">{profile.initials}</span>
      )}
    </span>
  );
}
