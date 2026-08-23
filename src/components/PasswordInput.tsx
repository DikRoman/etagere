"use client";

import { useState } from "react";
import { useSettingsStore } from "@/store/settings";
import { t } from "@/lib/i18n";

type PasswordInputProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
};

export function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  required = false,
  minLength = 8,
}: PasswordInputProps) {
  const locale = useSettingsStore((s) => s.locale);
  const [visible, setVisible] = useState(false);

  return (
    <div className="password-input-wrap">
      <input
        id={id}
        type={visible ? "text" : "password"}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? t("hidePassword", locale) : t("showPassword", locale)}
        aria-pressed={visible}
      >
        {visible ? t("hidePassword", locale) : t("showPassword", locale)}
      </button>
    </div>
  );
}
