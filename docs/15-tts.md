# Озвучка слов (Piper + опционально ElevenLabs)

Приоритет: **Piper (локально на VPS) → ElevenLabs → браузер**.

## Piper (основной)

- Бинарь: `/opt/etagere/piper/piper`
- Голоса: `/opt/etagere/piper/voices/` — EN, DE, FR, ES, IT, PT, NL, PL, RU
- Env в `/etc/default/etagere-web`:

```bash
PIPER_BIN=/opt/etagere/piper/piper
PIPER_VOICES_DIR=/opt/etagere/piper/voices
PIPER_ESPEAK_DATA=/opt/etagere/piper/espeak-ng-data
```

Проверка:

```bash
curl -s https://etagere.ru/api/ai/tts
curl -s -X POST https://etagere.ru/api/ai/tts \
  -H 'Content-Type: application/json' \
  -d '{"text":"person","lang":"en"}' -o /tmp/t.wav && file /tmp/t.wav
```

## ElevenLabs (опционально)

Если Piper недоступен и задан `ELEVENLABS_API_KEY` — используется cloud TTS.
