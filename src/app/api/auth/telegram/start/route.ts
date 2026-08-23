import { NextResponse } from "next/server";
import {
  buildTelegramAuthorizeUrl,
  telegramBotToken,
} from "@/lib/telegram-id";

export const runtime = "nodejs";

function originFallback(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://etagere.ru"
  );
}

/** Start Telegram Login Widget redirect. */
export async function GET() {
  try {
    telegramBotToken();
  } catch {
    return NextResponse.redirect(
      new URL("/login?oauth_error=OAUTH_UNAVAILABLE", originFallback()),
    );
  }

  return NextResponse.redirect(buildTelegramAuthorizeUrl());
}
