"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useSettingsStore } from "@/store/settings";
import { BrandMark } from "@/components/BrandMark";

function CheckEmailContent() {
  const locale = useSettingsStore((s) => s.locale);
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";
  const ru = locale === "ru";

  return (
    <div className="auth-page">
      <div className="auth-card">
        <BrandMark />
        <h1>{ru ? "Проверьте почту" : "Check your email"}</h1>
        <p className="muted">
          {ru
            ? `Мы отправили письмо с подтверждением${email ? ` на ${email}` : ""}. Перейдите по ссылке в письме, затем войдите в личный кабинет.`
            : `We sent a confirmation email${email ? ` to ${email}` : ""}. Open the link in the message, then sign in.`}
        </p>
        <p className="muted tiny">
          {ru
            ? "Не пришло? Проверьте «Спам» или запросите повторно на странице входа."
            : "Did not receive it? Check spam or resend from the login page."}
        </p>
        <Link href="/login" className="btn-primary">
          {ru ? "Ко входу" : "Go to login"}
        </Link>
      </div>
    </div>
  );
}

export default function CheckEmailPage() {
  return (
    <Suspense fallback={<div className="auth-page"><div className="auth-card"><p className="muted">…</p></div></div>}>
      <CheckEmailContent />
    </Suspense>
  );
}
