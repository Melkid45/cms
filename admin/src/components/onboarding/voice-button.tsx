"use client";
// Voice input: records in the browser, converts to 16 kHz mono WAV (accepted by every
// audio-capable model) and sends it for transcription. The transcript goes into the text
// box so the client can check it before sending.
import { useRef, useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { cn } from "@/lib/utils";

const MAX_SECONDS = 120;
const TEXT = {
  en: { voice: "Voice", stop: "Stop", listening: "Listening…", blocked: "The microphone is blocked here. Allow it in the browser, or type your answer.", none: "No microphone found. Type your answer instead.", empty: "I could not hear any words. Try again a bit closer to the microphone.", failed: "The recording could not be read." },
  lv: { voice: "Balss", stop: "Apturēt", listening: "Klausos…", blocked: "Mikrofons šeit ir bloķēts. Atļaujiet to pārlūkā vai ierakstiet atbildi.", none: "Mikrofons nav atrasts. Ierakstiet atbildi.", empty: "Nesadzirdēju vārdus. Mēģiniet vēlreiz tuvāk mikrofonam.", failed: "Ierakstu neizdevās nolasīt." },
  ru: { voice: "Голос", stop: "Стоп", listening: "Слушаю…", blocked: "Микрофон здесь заблокирован. Разрешите его в браузере или напишите ответ.", none: "Микрофон не найден. Напишите ответ текстом.", empty: "Не расслышал слов. Попробуйте ещё раз ближе к микрофону.", failed: "Не удалось прочитать запись." },
};
function encodeWav(samples: Float32Array, rate: number) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) =>
    [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 0x7fff, true));
  return new Blob([buffer], { type: "audio/wav" });
}
async function toWav(blob: Blob) {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const rate = 16000;
    const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * rate), rate);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return encodeWav(rendered.getChannelData(0), rate);
  } finally {
    void context.close();
  }
}

export function VoiceButton({
  send,
  onText,
  disabled,
  className,
  lang = "en",
}: {
  lang?: keyof typeof TEXT;
  // Uploads the WAV and returns the transcript.
  send: (wav: Blob) => Promise<string>;
  onText: (text: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const t = TEXT[lang] ?? TEXT.en;
  const [state, setState] = useState<"idle" | "recording" | "working">("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  async function start() {
    setError("");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      setError(
        (e as DOMException)?.name === "NotAllowedError"
          ? t.blocked
          : t.none,
      );
      return;
    }
    const chunks: Blob[] = [];
    const media = new MediaRecorder(stream);
    recorder.current = media;
    media.ondataavailable = (event) => event.data.size && chunks.push(event.data);
    media.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      if (timer.current) clearInterval(timer.current);
      setState("working");
      try {
        const wav = await toWav(new Blob(chunks, { type: media.mimeType }));
        const text = await send(wav);
        if (text.trim()) onText(text.trim());
        else setError(t.empty);
      } catch (e) {
        setError(e instanceof Error ? e.message : t.failed);
      } finally {
        setState("idle");
      }
    };
    media.start();
    setSeconds(0);
    setState("recording");
    timer.current = setInterval(
      () =>
        setSeconds((s) => {
          if (s + 1 >= MAX_SECONDS) recorder.current?.stop();
          return s + 1;
        }),
      1000,
    );
  }

  return (
    <span className={cn("inline-flex flex-col items-start gap-1", className)}>
      <button
        type="button"
        disabled={disabled || state === "working"}
        onClick={() => (state === "recording" ? recorder.current?.stop() : start())}
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-medium transition-shadow disabled:opacity-50",
          state === "recording"
            ? "bg-red-600 text-white"
            : "bg-neutral-100 text-neutral-800 hover:bg-neutral-200",
        )}
        aria-label={state === "recording" ? "Stop recording" : "Answer by voice"}
      >
        {state === "working" ? (
          <Loader2 className="size-4 animate-spin" />
        ) : state === "recording" ? (
          <Square className="size-3.5 fill-current" />
        ) : (
          <Mic className="size-4" />
        )}
        {state === "recording"
          ? `${t.stop} · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
          : state === "working"
            ? t.listening
            : t.voice}
      </button>
      {error && <span className="max-w-xs text-xs text-red-700">{error}</span>}
    </span>
  );
}
