import { GoogleGenerativeAI } from "@google/generative-ai";

import { getRequiredEnv } from "@/lib/env";

export type TaskEstimate = {
  estimated_time: number | null;
  energy_level: 1 | 2 | 3 | null;
  confidence?: number;
  reason?: string;
};

function isAiDebugEnabled(): boolean {
  return process.env.AI_DEBUG === "1";
}

function logAiDebug(event: string, data: Record<string, unknown>) {
  if (!isAiDebugEnabled()) return;
  console.error(JSON.stringify({ event, ...data }));
}

function safeParseJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const unfenced = trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    return JSON.parse(unfenced) as unknown;
  }
}

function clampInt(value: unknown, min: number, max: number): number | null {
  const num =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : NaN;
  if (!Number.isFinite(num)) return null;
  const int = Math.trunc(num);
  if (int < min || int > max) return null;
  return int;
}

function roundToFiveMinutes(value: number): number {
  return Math.round(value / 5) * 5;
}

function normalizeEstimate(raw: unknown): TaskEstimate {
  if (!raw || typeof raw !== "object") {
    return { estimated_time: null, energy_level: null };
  }

  const obj = raw as Record<string, unknown>;
  const estimated = clampInt(obj.estimated_time ?? obj.estimatedTime, 1, 10000);
  const rounded =
    estimated === null ? null : roundToFiveMinutes(Math.max(5, estimated));
  const estimated_time =
    rounded === null ? null : Math.min(Math.max(rounded, 5), 240);

  const energy = clampInt(obj.energy_level ?? obj.energyLevel, 1, 3);
  const energy_level = (energy === null ? null : (energy as 1 | 2 | 3)) ?? null;

  const confidence =
    typeof obj.confidence === "number" && Number.isFinite(obj.confidence)
      ? Math.min(Math.max(obj.confidence, 0), 1)
      : undefined;
  const reason = typeof obj.reason === "string" ? obj.reason.trim() : undefined;

  return { estimated_time, energy_level, confidence, reason };
}

export async function estimateTaskMeta(input: {
  title: string;
  description?: string | null;
}): Promise<TaskEstimate> {
  const title = input.title.trim();
  const description = (input.description ?? "").trim();

  const genAI = new GoogleGenerativeAI(getRequiredEnv("GEMINI_API_KEY"));
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      maxOutputTokens: 512,
    },
  });

  const prompt = [
    "あなたはタスクの所要時間と負荷を推定するアシスタントです。",
    "次のタスクについて、estimated_time（分）と energy_level（1〜3）を推定し、JSONのみで返してください。",
    "",
    "# 制約",
    "- JSONのみ（前後に文章を付けない）",
    "- estimated_time は 5〜240 の整数（5分単位に丸め）",
    "- energy_level は 1〜3 の整数",
    "",
    "# 入力",
    `title: ${JSON.stringify(title)}`,
    `description: ${JSON.stringify(description)}`,
    "",
    "# 出力スキーマ",
    JSON.stringify({
      estimated_time: 15,
      energy_level: 2,
      confidence: 0.6,
      reason: "短い説明",
    }),
  ].join("\n");

  const result = await model.generateContent(prompt);
  const responseText = result.response.text();

  logAiDebug("task_estimate_raw_response", {
    responseChars: responseText.length,
    responsePreview: responseText.slice(0, 2000),
  });

  const parsed = safeParseJson(responseText);
  const normalized = normalizeEstimate(parsed);

  logAiDebug("task_estimate_normalized", normalized as Record<string, unknown>);

  return normalized;
}
