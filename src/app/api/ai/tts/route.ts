import { NextResponse } from "next/server";
import {
  piperConfigured,
  piperKnownLangs,
  piperSynthesize,
} from "@/lib/piper";

export const runtime = "nodejs";

const DEFAULT_ELEVEN_VOICE = "21m00Tcm4TlvDq8ikWAM";

function elevenConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY?.trim());
}

export async function GET() {
  if (await piperConfigured()) {
    return NextResponse.json({
      enabled: true,
      provider: "piper",
      voices: piperKnownLangs(),
    });
  }
  if (elevenConfigured()) {
    return NextResponse.json({ enabled: true, provider: "elevenlabs" });
  }
  return NextResponse.json({ enabled: false, provider: "browser" });
}

async function elevenLabs(text: string): Promise<Buffer> {
  const key = process.env.ELEVENLABS_API_KEY!.trim();
  const voice =
    process.env.ELEVENLABS_VOICE_ID?.trim() || DEFAULT_ELEVEN_VOICE;
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voice}`,
    {
      method: "POST",
      headers: {
        Accept: "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": key,
      },
      body: JSON.stringify({
        text,
        model_id:
          process.env.ELEVENLABS_MODEL?.trim() || "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.35,
          similarity_boost: 0.8,
          style: 0.15,
          use_speaker_boost: true,
        },
      }),
    },
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`ElevenLabs HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

export async function POST(req: Request) {
  const body = (await req.json()) as { text?: string; lang?: string };
  const text = (body.text ?? "").trim().slice(0, 500);
  if (!text) {
    return NextResponse.json({ error: "text required" }, { status: 400 });
  }

  try {
    if (await piperConfigured()) {
      const wav = await piperSynthesize(text, body.lang);
      return new NextResponse(new Uint8Array(wav), {
        status: 200,
        headers: {
          "Content-Type": "audio/wav",
          "Cache-Control": "private, max-age=3600",
          "X-TTS-Provider": "piper",
        },
      });
    }

    if (elevenConfigured()) {
      const mp3 = await elevenLabs(text);
      return new NextResponse(new Uint8Array(mp3), {
        status: 200,
        headers: {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "private, max-age=3600",
          "X-TTS-Provider": "elevenlabs",
        },
      });
    }

    return NextResponse.json(
      { error: "TTS not configured", stub: true },
      { status: 503 },
    );
  } catch (e) {
    console.error("[ai/tts]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "TTS failed" },
      { status: 502 },
    );
  }
}
