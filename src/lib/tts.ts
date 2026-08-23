/** Neural TTS via /api/ai/tts (ElevenLabs), with browser SpeechSynthesis fallback. */

let neuralEnabled: boolean | null = null;
let currentAudio: HTMLAudioElement | null = null;
const cache = new Map<string, string>(); // key -> object URL

async function probeNeural(): Promise<boolean> {
  if (neuralEnabled !== null) return neuralEnabled;
  try {
    const res = await fetch("/api/ai/tts", { method: "GET" });
    const data = (await res.json()) as { enabled?: boolean };
    neuralEnabled = Boolean(data.enabled);
  } catch {
    neuralEnabled = false;
  }
  return neuralEnabled;
}

function browserSpeak(text: string, sourceLang?: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  const u = new SpeechSynthesisUtterance(text);
  const code = (sourceLang || "").toLowerCase();
  const map: Record<string, string> = {
    en: "en-US",
    de: "de-DE",
    fr: "fr-FR",
    es: "es-ES",
    it: "it-IT",
    pt: "pt-PT",
    nl: "nl-NL",
    pl: "pl-PL",
    ru: "ru-RU",
    uk: "uk-UA",
    sv: "sv-SE",
    da: "da-DK",
    no: "nb-NO",
    fi: "fi-FI",
    el: "el-GR",
    hu: "hu-HU",
    ro: "ro-RO",
    cs: "cs-CZ",
  };
  if (code && map[code]) u.lang = map[code];
  else if (/[а-яё]/i.test(text)) u.lang = "ru-RU";
  else u.lang = "en-US";
  window.speechSynthesis.speak(u);
}

export async function speakText(
  text: string,
  sourceLang?: string,
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;

  const useNeural = await probeNeural();
  if (!useNeural) {
    browserSpeak(trimmed, sourceLang);
    return;
  }

  const key = `${(sourceLang || "").toLowerCase()}|${trimmed}`;
  try {
    let url = cache.get(key);
    if (!url) {
      const res = await fetch("/api/ai/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed, lang: sourceLang }),
      });
      if (!res.ok) {
        browserSpeak(trimmed, sourceLang);
        return;
      }
      const blob = await res.blob();
      url = URL.createObjectURL(blob);
      cache.set(key, url);
      // Cap cache size
      if (cache.size > 40) {
        const first = cache.keys().next().value;
        if (first) {
          const old = cache.get(first);
          if (old) URL.revokeObjectURL(old);
          cache.delete(first);
        }
      }
    }

    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
    window.speechSynthesis?.cancel();
    const audio = new Audio(url);
    currentAudio = audio;
    await audio.play();
  } catch {
    browserSpeak(trimmed, sourceLang);
  }
}
