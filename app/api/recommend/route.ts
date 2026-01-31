import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

import { getRequiredEnv } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { Task } from "@/lib/types";

export const dynamic = "force-dynamic";

type RecommendResponse = {
  recommendations: Array<{ taskId: string; reason: string }>;
};

function isAiDebugEnabled(): boolean {
  return process.env.AI_DEBUG === "1";
}

function logAiDebug(event: string, data: Record<string, unknown>) {
  if (!isAiDebugEnabled()) return;
  // Intentionally use console.error so it shows up prominently in server logs.
  console.error(JSON.stringify({ event, ...data }));
}

function toNonEmptyString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

function safeParseJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    // Common fallback: ```json ... ```
    const unfenced = trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    return JSON.parse(unfenced) as unknown;
  }
}

function normalizeRecommendations(
  raw: unknown,
  validTaskIds: ReadonlySet<string>,
  tasksInOrder: ReadonlyArray<{ id: string }>,
): RecommendResponse {
  if (!raw || typeof raw !== "object") {
    throw new Error("AI response is not an object");
  }

  const obj = raw as Record<string, unknown>;
  const recs = obj.recommendations;
  if (!Array.isArray(recs)) {
    throw new Error("AI response missing recommendations[]");
  }

  const normalized: Array<{ taskId: string; reason: string }> = [];

  for (const item of recs) {
    if (!item || typeof item !== "object") continue;
    const recObj = item as Record<string, unknown>;

    const taskIdCandidateRaw =
      toNonEmptyString(recObj.taskId) ||
      toNonEmptyString(recObj.taskID) ||
      toNonEmptyString(recObj.task_id) ||
      toNonEmptyString(recObj.id) ||
      (recObj.task && typeof recObj.task === "object"
        ? toNonEmptyString((recObj.task as Record<string, unknown>).id)
        : "");

    const reasonCandidate =
      toNonEmptyString(recObj.reason) ||
      toNonEmptyString(recObj.why) ||
      toNonEmptyString(recObj.message) ||
      toNonEmptyString(recObj.comment);

    if (!taskIdCandidateRaw || !reasonCandidate) continue;

    let taskId = taskIdCandidateRaw;

    // If the model returns a 1-based ordinal like `1`, map it back to the real UUID id.
    if (!validTaskIds.has(taskId)) {
      const maybeOrdinal =
        toFiniteNumber(recObj.taskNo) ??
        toFiniteNumber(recObj.task_no) ??
        toFiniteNumber(recObj.ordinal) ??
        toFiniteNumber(recObj.index) ??
        toFiniteNumber(recObj.rank) ??
        toFiniteNumber(recObj.taskId) ??
        toFiniteNumber(recObj.id);

      if (maybeOrdinal !== null) {
        const idx = Math.trunc(maybeOrdinal) - 1;
        if (idx >= 0 && idx < tasksInOrder.length) {
          taskId = tasksInOrder[idx]?.id ?? taskId;
        }
      }
    }

    if (!validTaskIds.has(taskId)) continue;

    normalized.push({ taskId, reason: reasonCandidate });
    if (normalized.length >= 3) break;
  }

  if (normalized.length === 0) {
    throw new Error("AI response did not include valid recommendations");
  }

  return { recommendations: normalized };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const mood = typeof body.mood === "string" ? body.mood.trim() : "";
    if (!mood) {
      return NextResponse.json({ error: "mood is required" }, { status: 400 });
    }

    let tasks: Task[] | null =
      Array.isArray(body.tasks) && body.tasks.length > 0
        ? (body.tasks as Task[])
        : null;

    if (!tasks) {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("is_completed", false)
        .order("created_at", { ascending: false });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      tasks = (data ?? []) as Task[];
    }

    if (!tasks.length) {
      return NextResponse.json({ recommendations: [] });
    }

    const genAI = new GoogleGenerativeAI(getRequiredEnv("GEMINI_API_KEY"));
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { responseMimeType: "application/json" },
    });

    const tasksForPrompt = tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      estimated_time: t.estimated_time,
      energy_level: t.energy_level,
      is_completed: t.is_completed,
    }));
    const validIds = new Set(tasksForPrompt.map((t) => t.id));

    logAiDebug("recommend_request", {
      moodPreview: mood.slice(0, 200),
      tasksCount: tasksForPrompt.length,
      hasNullEstimatedTime: tasksForPrompt.some((t) => t.estimated_time == null),
      hasNullEnergyLevel: tasksForPrompt.some((t) => t.energy_level == null),
    });

    const prompt = [
      "あなたは優秀なタスク管理アシスタントです。",
      "以下のユーザーの「現在の気分」と「未完了タスクリスト」をもとに、今やるべきおすすめのタスクを最大3つ選び、JSON形式のみで出力してください。",
      "",
      "# 制約条件",
      "- JSON形式のみを出力すること（前後に文章を付けない）。",
      "- `recommendations` 配列の中にオブジェクトを入れること。",
      "- 各オブジェクトには `taskId` と `reason`（おすすめ理由＋励ましの一言）を含めること。",
      "- `taskId` は必ず、タスクリストに含まれる `id` をそのまま使うこと（新しいIDを作らない）。",
      "- ユーザーの気分が落ち込んでいる時は簡単/短時間のタスクを、やる気がある時は重めのタスクを優先すること。",
      "",
      "# ユーザーの気分",
      JSON.stringify(mood),
      "",
      "# タスクリスト",
      JSON.stringify(
        tasksForPrompt.map((t, idx) => ({
          no: idx + 1,
          ...t,
        })),
      ),
      "",
      "# 出力スキーマ（例）",
      JSON.stringify({
        recommendations: [
          { taskId: "uuid", reason: "理由（励ましの言葉を含めて）" },
          { taskNo: 1, reason: "（taskIdが難しい場合は taskNo でもOK）" },
        ],
      }),
    ].join("\n");

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    logAiDebug("recommend_raw_response", {
      responseChars: responseText.length,
      responsePreview: responseText.slice(0, 4000),
    });
    const parsed = safeParseJson(responseText);
    logAiDebug("recommend_parsed_response", {
      parsedType: parsed === null ? "null" : typeof parsed,
      parsedKeys:
        parsed && typeof parsed === "object"
          ? Object.keys(parsed as Record<string, unknown>).slice(0, 20)
          : [],
    });
    const normalized = normalizeRecommendations(parsed, validIds, tasksForPrompt);

    return NextResponse.json(normalized);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logAiDebug("recommend_error", { message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
