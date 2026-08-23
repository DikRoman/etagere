import { spawn } from "child_process";
import { mkdtemp, readFile, rm, access } from "fs/promises";
import { constants } from "fs";
import { tmpdir } from "os";
import path from "path";

const DEFAULT_BIN = "/opt/etagere/piper/piper";
const DEFAULT_VOICES = "/opt/etagere/piper/voices";
const DEFAULT_ESPEAK = "/opt/etagere/piper/espeak-ng-data";

/** Female voices preferred; lang → onnx basename (without .onnx) */
const VOICE_BY_LANG: Record<string, string> = {
  en: "en_US-amy-medium",
  de: "de_DE-kerstin-low",
  fr: "fr_FR-siwis-medium",
  es: "es_ES-sharvard-medium",
  it: "it_IT-paola-medium",
  pt: "pt_BR-faber-medium",
  nl: "nl_NL-mls-medium",
  pl: "pl_PL-darkman-medium",
  ru: "ru_RU-irina-medium",
  uk: "ru_RU-irina-medium",
};

/** Multi-speaker models: prefer female speaker id when known. */
const FEMALE_SPEAKER: Record<string, number> = {
  "es_ES-sharvard-medium": 1, // F
};

let chain: Promise<unknown> = Promise.resolve();
let configuredCache: boolean | null = null;

function piperBin(): string {
  return process.env.PIPER_BIN?.trim() || DEFAULT_BIN;
}

function voicesDir(): string {
  return process.env.PIPER_VOICES_DIR?.trim() || DEFAULT_VOICES;
}

function espeakData(): string {
  return process.env.PIPER_ESPEAK_DATA?.trim() || DEFAULT_ESPEAK;
}

async function pathOk(p: string): Promise<boolean> {
  try {
    await access(/* turbopackIgnore: true */ p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function piperConfigured(): Promise<boolean> {
  if (process.env.PIPER_ENABLED === "0") return false;
  if (configuredCache !== null) return configuredCache;
  configuredCache = await pathOk(piperBin());
  return configuredCache;
}

export function piperVoiceForLang(lang?: string): string {
  const code = (lang || "en").toLowerCase().slice(0, 2);
  return VOICE_BY_LANG[code] || VOICE_BY_LANG.en;
}

function modelPath(voice: string): string {
  return path.join(/* turbopackIgnore: true */ voicesDir(), `${voice}.onnx`);
}

export function piperKnownLangs(): string[] {
  return Object.keys(VOICE_BY_LANG);
}

function lengthScale(): string {
  // 1.0 = natural Piper tempo; slowing down sounds robotic.
  return process.env.PIPER_LENGTH_SCALE?.trim() || "1.0";
}

async function runOnce(text: string, lang?: string): Promise<Buffer> {
  const voice = piperVoiceForLang(lang);
  const model = modelPath(voice);
  if (!(await pathOk(model))) {
    throw new Error(`Piper voice missing: ${voice}`);
  }

  const dir = await mkdtemp(path.join(tmpdir(), "etagere-piper-"));
  const out = path.join(dir, "out.wav");
  const bin = piperBin();
  const libDir = path.dirname(bin);

  try {
    await new Promise<void>((resolve, reject) => {
      const args = [
        "--model",
        model,
        "--output_file",
        out,
        "--length_scale",
        lengthScale(),
        "--sentence_silence",
        "0.35",
      ];
      const speaker = FEMALE_SPEAKER[voice];
      if (typeof speaker === "number") {
        args.push("--speaker", String(speaker));
      }
      const child = spawn(/* turbopackIgnore: true */ bin, args, {
        env: {
          ...process.env,
          LD_LIBRARY_PATH: `${libDir}:${process.env.LD_LIBRARY_PATH || ""}`,
          ESPEAK_DATA_PATH: espeakData(),
        },
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stderr = "";
      child.stderr.on("data", (c: Buffer) => {
        stderr += c.toString();
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(stderr.trim() || `piper exit ${code}`));
      });
      child.stdin.write(text.slice(0, 500));
      child.stdin.end();
    });
    return await readFile(/* turbopackIgnore: true */ out);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Serialize synthesis — VPS is tiny; avoid loading several ONNX models at once. */
export function piperSynthesize(text: string, lang?: string): Promise<Buffer> {
  const job = chain.then(() => runOnce(text, lang));
  chain = job.then(
    () => undefined,
    () => undefined,
  );
  return job;
}
