import "server-only";
import { withDoc } from "./doc-store";
import { StoreError } from "./server";
// Paid AI through OpenRouter. Off unless CMS_AI=1 and OPENROUTER_API_KEY are set.
// Every call has a token cap; the month's spend (OpenRouter reports the exact cost)
// is stored and calls stop once CMS_AI_MONTHLY_USD is reached.
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
type Usage = { months: Record<string, { cost: number; calls: number }> };
const usageStore = <T>(fn: (data: Usage) => T, write = true) =>
  withDoc<Usage, T>("ai-usage", () => ({ months: {} }), fn, write);
const month = () => new Date().toISOString().slice(0, 7);
export const aiModel = () =>
  process.env.CMS_AI_MODEL || "google/gemini-2.5-flash-lite";
const monthlyCap = () => {
  const cap = Number(process.env.CMS_AI_MONTHLY_USD);
  return Number.isFinite(cap) && cap > 0 ? cap : 10;
};
export const aiEnabled = () =>
  process.env.CMS_AI === "1" && Boolean(process.env.OPENROUTER_API_KEY);
export async function aiStatus() {
  const current = await usageStore((data) => data.months[month()], false);
  return {
    enabled: aiEnabled(),
    model: aiModel(),
    month: month(),
    spent: current?.cost ?? 0,
    calls: current?.calls ?? 0,
    cap: monthlyCap(),
  };
}
// Mock mode: CMS_AI_MOCK=1 (whole installation) or a caller that passes `mock` (e.g. the SEO
// assistant's per-website test mode) gets a canned answer: no network, no cost, not counted.
export const aiMockEnv = () => process.env.CMS_AI_MOCK === "1";
export async function aiComplete(input: {
  system: string;
  user: string;
  maxTokens?: number;
  // Canned answer used instead of the service when mock mode is on (useMock or CMS_AI_MOCK=1).
  mock?: string;
  useMock?: boolean;
  json?: boolean;
  // Optional audio for audio-capable models (OpenRouter chat completions `input_audio`
  // content part: base64 data + format such as "ogg", "mp3", "wav"). Used by approvals voice notes.
  audio?: { data: string; format: string };
  // Optional model override chosen by server code (e.g. CMS_AI_AUDIO_MODEL), never by user input.
  model?: string;
}): Promise<{ text: string; cost: number; model: string; tokensIn: number; tokensOut: number }> {
  if (input.useMock || aiMockEnv())
    return {
      text: input.mock ?? "Mock AI answer (CMS_AI_MOCK=1).",
      cost: 0,
      model: "mock",
      tokensIn: 0,
      tokensOut: 0,
    };
  if (!aiEnabled()) throw new StoreError("AI is switched off.", 503);
  const status = await aiStatus();
  if (status.spent >= status.cap)
    throw new StoreError("The monthly AI budget is used up.", 429);
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "X-Title": "Harbstone CMS",
    },
    body: JSON.stringify({
      model: input.model || aiModel(),
      max_tokens: Math.min(input.maxTokens ?? 1500, 4000),
      temperature: 0.4,
      usage: { include: true },
      ...(input.json ? { response_format: { type: "json_object" } } : {}),
      messages: [
        { role: "system", content: input.system },
        {
          role: "user",
          content: input.audio
            ? [
                { type: "text", text: input.user },
                { type: "input_audio", input_audio: input.audio },
              ]
            : input.user,
        },
      ],
    }),
    signal: AbortSignal.timeout(60000),
  });
  const data = (await response.json().catch(() => null)) as {
    choices?: { message?: { content?: string } }[];
    usage?: { cost?: number; prompt_tokens?: number; completion_tokens?: number };
    model?: string;
  } | null;
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!response.ok || !text)
    throw new StoreError("The AI service did not answer.", 502);
  const cost = Number(data?.usage?.cost) || 0;
  await usageStore((usage) => {
    const entry = (usage.months[month()] ??= { cost: 0, calls: 0 });
    entry.cost = Math.round((entry.cost + cost) * 1e6) / 1e6;
    entry.calls += 1;
  });
  return {
    text,
    cost,
    model: data?.model || aiModel(),
    tokensIn: Number(data?.usage?.prompt_tokens) || 0,
    tokensOut: Number(data?.usage?.completion_tokens) || 0,
  };
}
// Speech to text for voice answers (onboarding agent, 2026-11-19). Same budget and usage
// document as aiComplete. Audio goes to an audio-capable model as an `input_audio` content
// part (OpenRouter multimodal audio docs: base64 data + format; wav is accepted by every
// audio model, so the browser converts its recording to 16 kHz mono WAV first).
// Default model google/gemini-2.5-flash-lite: audio input $0.30 per million tokens (about
// 32 tokens per second of speech, i.e. well under $0.001 per minute). CMS_AI_AUDIO_MODEL overrides.
export async function aiTranscribe(input: {
  audio: Buffer;
  format: "wav" | "mp3";
  language?: string;
  mock?: string;
  useMock?: boolean;
}): Promise<{ text: string; cost: number; model: string; tokensIn: number; tokensOut: number }> {
  if (input.useMock || aiMockEnv())
    return {
      text: input.mock ?? "Mock transcript (CMS_AI_MOCK=1).",
      cost: 0,
      model: "mock",
      tokensIn: 0,
      tokensOut: 0,
    };
  if (!aiEnabled()) throw new StoreError("AI is switched off.", 503);
  const status = await aiStatus();
  if (status.spent >= status.cap)
    throw new StoreError("The monthly AI budget is used up.", 429);
  const model = process.env.CMS_AI_AUDIO_MODEL || "google/gemini-2.5-flash-lite";
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "X-Title": "Harbstone CMS",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      temperature: 0,
      usage: { include: true },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Transcribe this voice message word for word${input.language ? ` (likely language: ${input.language})` : ""}. Keep the speaker's language. Return only the transcript text, nothing else. If there is no speech, return an empty line.`,
            },
            {
              type: "input_audio",
              input_audio: { data: input.audio.toString("base64"), format: input.format },
            },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(60000),
  });
  const data = (await response.json().catch(() => null)) as {
    choices?: { message?: { content?: string } }[];
    usage?: { cost?: number; prompt_tokens?: number; completion_tokens?: number };
    model?: string;
  } | null;
  // OpenRouter answers 402 when the key limit/credit is below its minimum for audio (/usr/bin/bash.50).
  if (response.status === 402)
    throw new StoreError("Voice input is not available right now (AI account limit). Please type your answer.", 503);
  if (!response.ok) throw new StoreError("The AI service did not answer.", 502);
  const text = data?.choices?.[0]?.message?.content?.trim() ?? "";
  const cost = Number(data?.usage?.cost) || 0;
  await usageStore((usage) => {
    const entry = (usage.months[month()] ??= { cost: 0, calls: 0 });
    entry.cost = Math.round((entry.cost + cost) * 1e6) / 1e6;
    entry.calls += 1;
  });
  return {
    text,
    cost,
    model: data?.model || model,
    tokensIn: Number(data?.usage?.prompt_tokens) || 0,
    tokensOut: Number(data?.usage?.completion_tokens) || 0,
  };
}
