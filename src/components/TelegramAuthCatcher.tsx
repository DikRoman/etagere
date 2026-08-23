"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * Telegram Login Widget often returns to site origin with
 * `#tgAuthResult=<base64>` — which never hits a server route.
 * Forward that hash to the complete page.
 */
export function TelegramAuthCatcher() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (pathname?.startsWith("/auth/telegram/complete")) return;
    const hash = window.location.hash || "";
    if (!hash.includes("tgAuthResult=")) return;
    router.replace(`/auth/telegram/complete${hash}`);
  }, [pathname, router]);

  return null;
}
