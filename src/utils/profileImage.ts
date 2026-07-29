import {
  PROFILE_PICTURE_ACCEPT,
  PROFILE_PICTURE_DATA_URL_BYTE_LIMIT,
  PROFILE_PICTURE_TARGET_PX
} from "../domain/people";

/** Hard upper bound for the original upload, in bytes. */
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/**
 * Quality steps the encoder will try in order until the resulting
 * data URL fits within `PROFILE_PICTURE_DATA_URL_BYTE_LIMIT`. The
 * first value in this list is the most generous; later values trade
 * fidelity for size.
 */
const QUALITY_STEPS = [0.85, 0.78, 0.7, 0.6, 0.5, 0.4];

/** Output preference order: WebP first, then PNG, then JPEG. */
const OUTPUT_FORMATS: ReadonlyArray<{ mime: string; supportsQuality: boolean }> = [
  { mime: "image/webp", supportsQuality: true },
  { mime: "image/jpeg", supportsQuality: true },
  { mime: "image/png", supportsQuality: false }
];

export interface ProfileImageProcessOptions {
  /** Square target dimensions in pixels (defaults to PROFILE_PICTURE_TARGET_PX). */
  targetPx?: number;
}

export interface ProfileImageProcessResult {
  dataUrl: string;
  mimeType: string;
  byteLength: number;
  width: number;
  height: number;
}

export function isAcceptedProfileImageType(file: File): boolean {
  if (!file.type) return false;
  return PROFILE_PICTURE_ACCEPT.includes(file.type.toLowerCase());
}

function loadFileAsImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image. Try a different file."));
    };
    image.src = url;
  });
}

function centerCropAndResize(image: HTMLImageElement, targetPx: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = targetPx;
  canvas.height = targetPx;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Your browser cannot resize images. Profile picture not saved.");
  }

  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
  if (sourceSize <= 0) {
    throw new Error("That image looks empty. Try a different file.");
  }
  const sx = (image.naturalWidth - sourceSize) / 2;
  const sy = (image.naturalHeight - sourceSize) / 2;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(image, sx, sy, sourceSize, sourceSize, 0, 0, targetPx, targetPx);
  return canvas;
}

function dataUrlByteLength(dataUrl: string): number {
  return new TextEncoder().encode(dataUrl).byteLength;
}

function encodeCanvas(
  canvas: HTMLCanvasElement,
  mime: string,
  quality?: number
): string | null {
  try {
    const dataUrl = canvas.toDataURL(mime, quality);
    if (!dataUrl || !dataUrl.startsWith(`data:${mime}`)) return null;
    return dataUrl;
  } catch {
    return null;
  }
}

/**
 * Process an uploaded image into a small square avatar suitable for
 * storing in the `Profile` tab cell.
 *
 * Behavior:
 *
 * - Rejects unsupported MIME types (SVG and other active formats).
 * - Rejects files larger than `MAX_UPLOAD_BYTES`.
 * - Center-crops to a square and resizes to `targetPx` (default 160).
 * - Tries WebP → JPEG → PNG, walking down quality if needed.
 * - Throws if no encoding fits within the storage budget.
 */
export async function processProfileImageFile(
  file: File,
  options: ProfileImageProcessOptions = {}
): Promise<ProfileImageProcessResult> {
  if (!isAcceptedProfileImageType(file)) {
    throw new Error(
      `Profile pictures must be a PNG, JPEG, or WebP image (got ${file.type || "unknown type"}).`
    );
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `That image is too large (${Math.round(file.size / 1024)} KB). Pick something under ${
        MAX_UPLOAD_BYTES / 1024 / 1024
      } MB.`
    );
  }

  const targetPx = options.targetPx ?? PROFILE_PICTURE_TARGET_PX;
  const image = await loadFileAsImage(file);
  const canvas = centerCropAndResize(image, targetPx);

  let bestUnderLimit: ProfileImageProcessResult | null = null;
  let smallestOverall: ProfileImageProcessResult | null = null;

  for (const format of OUTPUT_FORMATS) {
    const qualities = format.supportsQuality ? QUALITY_STEPS : [undefined];
    for (const quality of qualities) {
      const dataUrl = encodeCanvas(canvas, format.mime, quality);
      if (!dataUrl) continue;
      const byteLength = dataUrlByteLength(dataUrl);
      const candidate: ProfileImageProcessResult = {
        dataUrl,
        mimeType: format.mime,
        byteLength,
        width: targetPx,
        height: targetPx
      };
      if (!smallestOverall || byteLength < smallestOverall.byteLength) {
        smallestOverall = candidate;
      }
      if (byteLength <= PROFILE_PICTURE_DATA_URL_BYTE_LIMIT) {
        if (!bestUnderLimit || byteLength < bestUnderLimit.byteLength) {
          bestUnderLimit = candidate;
        }
        // We have a fit; for higher-priority formats stop scanning extra
        // qualities so the highest-fidelity acceptable encoding wins.
        break;
      }
    }
    if (bestUnderLimit && bestUnderLimit.mimeType === format.mime) {
      // The first format that fits wins because OUTPUT_FORMATS is
      // already sorted by preference.
      return bestUnderLimit;
    }
  }

  if (bestUnderLimit) return bestUnderLimit;

  if (smallestOverall) {
    throw new Error(
      `Could not compress this image below ${Math.round(
        PROFILE_PICTURE_DATA_URL_BYTE_LIMIT / 1024
      )} KB (smallest attempt was ${Math.round(smallestOverall.byteLength / 1024)} KB). Try a smaller image.`
    );
  }
  throw new Error("Your browser could not encode this image. Try a different file.");
}
