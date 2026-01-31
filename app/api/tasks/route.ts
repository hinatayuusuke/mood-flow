import { NextResponse } from "next/server";

import { estimateTaskMeta } from "@/lib/aiEstimate";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { Task } from "@/lib/types";

export const dynamic = "force-dynamic";

function toIntOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numberValue =
    typeof value === "number" ? value : Number.parseInt(String(value), 10);
  return Number.isFinite(numberValue) ? numberValue : null;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const includeCompleted = url.searchParams.get("includeCompleted") === "1";

    const supabase = getSupabaseAdmin();
    const query = supabase
      .from("tasks")
      .select("*")
      .order("created_at", { ascending: false });

    const { data, error } = includeCompleted
      ? await query
      : await query.eq("is_completed", false);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ tasks: (data ?? []) as Task[] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    const description =
      typeof body.description === "string" ? body.description.trim() : null;
    const estimated_time = toIntOrNull(body.estimated_time);
    const energy_level = toIntOrNull(body.energy_level);
    const auto_estimate =
      typeof body.auto_estimate === "boolean" ? body.auto_estimate : true;

    let finalEstimatedTime = estimated_time;
    let finalEnergyLevel = energy_level;

    if (
      auto_estimate &&
      (finalEstimatedTime === null || finalEnergyLevel === null)
    ) {
      try {
        const estimate = await estimateTaskMeta({ title, description });
        if (finalEstimatedTime === null) {
          finalEstimatedTime = estimate.estimated_time;
        }
        if (finalEnergyLevel === null) {
          finalEnergyLevel = estimate.energy_level;
        }
      } catch {
        // If AI fails (missing key, timeout, invalid JSON...), keep nulls and still create the task.
      }
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        title,
        description,
        estimated_time: finalEstimatedTime,
        energy_level: finalEnergyLevel,
        is_completed: false,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ task: data as Task }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
