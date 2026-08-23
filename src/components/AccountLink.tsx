"use client";

import Link from "next/link";
import { useState } from "react";
import type { RecordModel } from "pocketbase";
import { useAuthStore } from "@/store/auth";
import { useSettingsStore } from "@/store/settings";
import { t } from "@/lib/i18n";
import {
  prepareAvatarFile,
  userAvatarUrl,
  userInitials,
} from "@/lib/avatar";

function avatarErrorMessage(code: string, locale: "ru" | "en"): string {
  if (code === "HEIC") {
    return locale === "ru"
      ? "HEIC с iPhone не подходит — в Фото нажми «Поделиться» → JPEG или PNG."
      : "HEIC is not supported — export the photo as JPEG or PNG.";
  }
  if (code === "UNREADABLE_IMAGE") {
    return locale === "ru"
      ? "Не удалось прочитать файл. Нужен JPEG, PNG, WebP или GIF."
      : "Could not read that file. Use JPEG, PNG, WebP, or GIF.";
  }
  return locale === "ru" ? "Не удалось загрузить фото" : "Could not upload photo";
}

export function UserAvatar({
  user,
  size = "sm",
  editable = false,
  onError,
}: {
  user: RecordModel;
  size?: "sm" | "lg";
  editable?: boolean;
  onError?: (message: string) => void;
}) {
  const locale = useSettingsStore((s) => s.locale);
  const updateAvatar = useAuthStore((s) => s.updateAvatar);
  const [busy, setBusy] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);
  const url = userAvatarUrl(user);
  const initials = userInitials(user);

  const photo = (
    <span className={`user-avatar user-avatar--${size}`} aria-hidden>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" />
      ) : (
        <span className="user-avatar-initials">{initials}</span>
      )}
    </span>
  );

  if (!editable) return photo;

  async function onPick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setLocalErr(null);
    try {
      const jpeg = await prepareAvatarFile(file);
      await updateAvatar(jpeg);
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      const message =
        code === "HEIC" || code === "UNREADABLE_IMAGE"
          ? avatarErrorMessage(code, locale)
          : e instanceof Error && e.message
            ? e.message
            : avatarErrorMessage("", locale);
      setLocalErr(message);
      onError?.(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="user-avatar-edit">
      <label
        className={`user-avatar-edit-btn${busy ? " is-busy" : ""}`}
        title={t("changePhoto", locale)}
      >
        {photo}
        <span className="user-avatar-edit-label">
          {busy
            ? locale === "ru"
              ? "Загрузка…"
              : "Uploading…"
            : t("changePhoto", locale)}
        </span>
        <input
          className="user-avatar-file"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/*"
          disabled={busy}
          onChange={(e) => {
            const next = e.target.files?.[0];
            e.target.value = "";
            void onPick(next);
          }}
        />
      </label>
      {localErr ? <p className="auth-error user-avatar-err">{localErr}</p> : null}
    </div>
  );
}

export function AccountLink({ className = "" }: { className?: string }) {
  const locale = useSettingsStore((s) => s.locale);
  const user = useAuthStore((s) => s.user);
  const hasPro = useAuthStore((s) => s.hasPro);

  if (!user) return null;

  return (
    <Link
      href="/account"
      className={`account-chip ${hasPro() ? "is-on" : ""} ${className}`.trim()}
    >
      <UserAvatar user={user} size="sm" />
      <span className="account-chip-label">
        {t("account", locale)}
        {hasPro() ? " · Pro" : ""}
      </span>
    </Link>
  );
}
