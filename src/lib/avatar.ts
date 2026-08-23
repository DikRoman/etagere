import type { RecordModel } from "pocketbase";
import { getPb } from "./pb";

export function userDisplayName(user: RecordModel): string {
  return (
    (user.name as string) ||
    (user.email as string)?.split("@")[0] ||
    "user"
  );
}

export function userInitials(user: RecordModel): string {
  const name = userDisplayName(user).trim();
  const parts = name.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "?";
}

export function userAvatarUrl(user: RecordModel | null | undefined): string | null {
  if (!user) return null;
  const filename = user.avatar as string | undefined;
  if (!filename) return null;
  try {
    return getPb().files.getURL(user, filename);
  } catch {
    return null;
  }
}

const AVATAR_MAX_PX = 512;
const AVATAR_JPEG_QUALITY = 0.9;

/** Decode any browser-supported image and re-encode as JPEG for PocketBase. */
export async function prepareAvatarFile(file: File): Promise<File> {
  const type = (file.type || "").toLowerCase();
  if (
    type === "image/heic" ||
    type === "image/heif" ||
    /\.(heic|heif)$/i.test(file.name)
  ) {
    throw new Error("HEIC");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("UNREADABLE_IMAGE");
  }

  try {
    const scale = Math.min(
      1,
      AVATAR_MAX_PX / Math.max(bitmap.width, bitmap.height, 1),
    );
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("UNREADABLE_IMAGE");
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", AVATAR_JPEG_QUALITY);
    });
    if (!blob) throw new Error("UNREADABLE_IMAGE");
    return new File([blob], "avatar.jpg", { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}
