import { useRef, type ChangeEvent } from "react";
import { PROFILE_PICTURE_DATA_URL_BYTE_LIMIT } from "../../domain/people";

export type ProfileChoice =
  | { kind: "loading" }
  | { kind: "noPhoto" }
  | { kind: "existing"; dataUrl: string; updatedAt: string }
  | { kind: "new"; dataUrl: string; mimeType: string; byteLength: number };

interface ProfileStepProps {
  choice: ProfileChoice;
  initials: string;
  processing: boolean;
  validating: boolean;
  error: string;
  onFile: (file: File) => void;
  onUseInitials: () => void;
  onClearError: () => void;
}

export function ProfileStep({
  choice,
  initials,
  processing,
  validating,
  error,
  onFile,
  onUseInitials,
  onClearError
}: ProfileStepProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previewSrc =
    choice.kind === "existing" || choice.kind === "new" ? choice.dataUrl : "";
  const sizeLabel =
    choice.kind === "new"
      ? `${Math.round(choice.byteLength / 1024)} KB ${choice.mimeType.replace("image/", "")}`
      : "";
  const limitLabel = `${Math.round(PROFILE_PICTURE_DATA_URL_BYTE_LIMIT / 1024)} KB max`;
  const modifier =
    choice.kind === "new" || choice.kind === "existing"
      ? " source-card--selected"
      : " source-card--empty";
  const choosePhoto = () => {
    onClearError();
    inputRef.current?.click();
  };
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onFile(file);
    event.target.value = "";
  };

  return (
    <article className={`source-card${modifier}`}>
      <div className="source-card__row">
        <div className="source-card__body">
          <p className="source-card__eyebrow">Step 4 — Profile</p>
          <h2 className="source-card__title">Pick a photo (optional)</h2>
          <p className="source-card__detail">
            This photo is stored in a small <strong>Profile</strong> tab inside your Task-log
            workbook so managers see it on their dashboard. Skip to use your initials instead.
          </p>
        </div>
        <div
          className="profile-preview"
          role="img"
          aria-label={previewSrc ? "Selected profile photo preview" : `Profile initials ${initials}`}
        >
          {previewSrc ? (
            <img src={previewSrc} alt="" />
          ) : (
            <span className="profile-preview__initials">{initials}</span>
          )}
        </div>
      </div>
      <input
        ref={inputRef}
        id="profile-photo-file"
        aria-label="Choose profile photo file"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleFileChange}
        className="visually-hidden-file"
      />
      <div className="button-row">
        <button
          className="button button--secondary"
          type="button"
          onClick={choosePhoto}
          disabled={processing || validating}
        >
          {processing
            ? "Processing..."
            : choice.kind === "existing" || choice.kind === "new"
              ? "Choose another photo"
              : "Upload photo"}
        </button>
        {choice.kind === "new" || choice.kind === "existing" ? (
          <button
            className="button button--ghost"
            type="button"
            onClick={onUseInitials}
            disabled={processing || validating}
          >
            Use initials instead
          </button>
        ) : null}
      </div>
      <p className="profile-meta muted-row" role="status" aria-live="polite" aria-atomic="true">
        {choice.kind === "new" ? (
          <>
            <strong>New photo ready to save.</strong> <span>{sizeLabel}</span>
          </>
        ) : choice.kind === "existing" ? (
          <>
            <strong>Saved photo loaded from your Profile tab.</strong>
            {choice.updatedAt ? <> Updated {choice.updatedAt.split("T")[0]}.</> : null}
          </>
        ) : choice.kind === "loading" ? (
          <>Checking your Profile tab…</>
        ) : (
          <>No photo. Managers will see your initials with an accent color.</>
        )}{" "}
        <span className="profile-meta__hint">{limitLabel}</span>
      </p>
      {error ? (
        <div className="column-list__error" role="alert">
          <p className="error-text">{error}</p>
          <div className="button-row">
            <button className="button button--secondary" type="button" onClick={choosePhoto}>
              Try a different photo
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}
