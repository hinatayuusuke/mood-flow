"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";

import type { Task } from "@/lib/types";

type Recommendation = { taskId: string; reason: string };

async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(text || `HTTP ${res.status}`);
  }
}

export default function MoodFlowApp() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [estimatedTime, setEstimatedTime] = useState<string>("");
  const [energyLevel, setEnergyLevel] = useState<string>("");
  const [autoEstimate, setAutoEstimate] = useState(true);

  const [mood, setMood] = useState("");
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loadingRecommend, setLoadingRecommend] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const incompleteTasks = useMemo(
    () => tasks.filter((t) => !t.is_completed),
    [tasks],
  );

  const recommendedById = useMemo(() => {
    const map = new Map<string, string>();
    for (const rec of recommendations) map.set(rec.taskId, rec.reason);
    return map;
  }, [recommendations]);

  async function refreshTasks(nextIncludeCompleted = includeCompleted) {
    setLoadingTasks(true);
    setError(null);
    try {
      const qs = nextIncludeCompleted ? "?includeCompleted=1" : "";
      const res = await fetch(`/api/tasks${qs}`, { cache: "no-store" });
      const data = await readJson<{ tasks?: Task[]; error?: string }>(res);
      if (!res.ok) throw new Error(data.error || "Failed to fetch tasks");
      setTasks(data.tasks ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoadingTasks(false);
    }
  }

  useEffect(() => {
    void refreshTasks(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createTask(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    try {
      const payload = {
        title,
        description,
        estimated_time: estimatedTime,
        energy_level: energyLevel,
        auto_estimate: autoEstimate,
      };
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await readJson<{ task?: Task; error?: string }>(res);
      if (!res.ok) throw new Error(data.error || "Failed to create task");

      setTitle("");
      setDescription("");
      setEstimatedTime("");
      setEnergyLevel("");

      await refreshTasks();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  async function setCompleted(taskId: string, is_completed: boolean) {
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ is_completed }),
      });
      const data = await readJson<{ task?: Task; error?: string }>(res);
      if (!res.ok) throw new Error(data.error || "Failed to update task");
      await refreshTasks();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  async function deleteTask(taskId: string) {
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
      const data = await readJson<{ ok?: boolean; error?: string }>(res);
      if (!res.ok) throw new Error(data.error || "Failed to delete task");
      await refreshTasks();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }

  async function recommend() {
    setLoadingRecommend(true);
    setError(null);
    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mood, tasks: incompleteTasks }),
      });
      const data = await readJson<{
        recommendations?: Recommendation[];
        error?: string;
      }>(res);
      if (!res.ok) throw new Error(data.error || "Failed to get recommendations");
      setRecommendations(data.recommendations ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoadingRecommend(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
        <header className="mb-6 flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">MoodFlow</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            今の気分に合わせて、やるタスクを3つ提案します。
          </p>
        </header>

        {error ? (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </div>
        ) : null}

        <div className="grid gap-6 md:grid-cols-2">
          <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">タスク</h2>
              <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-zinc-900 dark:accent-zinc-100"
                  checked={includeCompleted}
                  onChange={async (e) => {
                    const next = e.target.checked;
                    setIncludeCompleted(next);
                    await refreshTasks(next);
                  }}
                />
                完了も表示
              </label>
            </div>

            <form onSubmit={createTask} className="mb-4 grid gap-3">
              <div className="grid gap-2">
                <label className="text-sm font-medium" htmlFor="title">
                  タスク名
                </label>
                <input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-800 dark:bg-zinc-950"
                  placeholder="例: メール返信"
                  required
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-medium" htmlFor="description">
                  詳細（任意）
                </label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="min-h-20 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-800 dark:bg-zinc-950"
                  placeholder="AIが判断しやすいように、少しだけ補足すると効果的です"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <label className="text-sm font-medium" htmlFor="time">
                    目安（分）
                  </label>
                  <input
                    id="time"
                    inputMode="numeric"
                    value={estimatedTime}
                    onChange={(e) => setEstimatedTime(e.target.value)}
                    className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-800 dark:bg-zinc-950"
                    placeholder="例: 15"
                    disabled={autoEstimate}
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium" htmlFor="energy">
                    エネルギー
                  </label>
                  <select
                    id="energy"
                    value={energyLevel}
                    onChange={(e) => setEnergyLevel(e.target.value)}
                    className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-800 dark:bg-zinc-950"
                    disabled={autoEstimate}
                  >
                    <option value="">未設定</option>
                    <option value="1">低（気軽）</option>
                    <option value="2">中</option>
                    <option value="3">高（集中）</option>
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-zinc-900 dark:accent-zinc-100"
                  checked={autoEstimate}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setAutoEstimate(next);
                    if (next) {
                      setEstimatedTime("");
                      setEnergyLevel("");
                    }
                  }}
                />
                目安/エネルギーをAIで推定する
              </label>

              <button
                type="submit"
                className="mt-1 inline-flex h-10 items-center justify-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                disabled={!title.trim()}
              >
                追加
              </button>
            </form>

            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">
                未完了（{incompleteTasks.length}）
              </h3>
              {loadingTasks ? (
                <span className="text-xs text-zinc-500">読み込み中...</span>
              ) : null}
            </div>

            <ul className="mt-2 grid gap-2">
              {tasks
                .filter((t) => !t.is_completed)
                .map((t) => {
                  const reason = recommendedById.get(t.id) ?? null;
                  return (
                    <li
                      key={t.id}
                      className={[
                        "rounded-lg border px-3 py-2",
                        reason
                          ? "border-emerald-300 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/30"
                          : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              className="mt-1 h-4 w-4 accent-zinc-900 dark:accent-zinc-100"
                              checked={t.is_completed}
                              onChange={(e) =>
                                void setCompleted(t.id, e.target.checked)
                              }
                            />
                            <p className="truncate text-sm font-medium">
                              {t.title}
                            </p>
                          </div>
                          {t.description ? (
                            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                              {t.description}
                            </p>
                          ) : null}
                          <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                            {t.estimated_time ? (
                              <span className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-900">
                                {t.estimated_time}分
                              </span>
                            ) : null}
                            {t.energy_level ? (
                              <span className="rounded-full bg-zinc-100 px-2 py-0.5 dark:bg-zinc-900">
                                エネルギー {t.energy_level}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="rounded-md px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
                          onClick={() => void deleteTask(t.id)}
                        >
                          削除
                        </button>
                      </div>
                      {reason ? (
                        <p className="mt-2 text-xs text-emerald-800 dark:text-emerald-200">
                          AIおすすめ: {reason}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
            </ul>

            {includeCompleted ? (
              <>
                <h3 className="mt-4 text-sm font-semibold text-zinc-600 dark:text-zinc-400">
                  完了
                </h3>
                <ul className="mt-2 grid gap-2">
                  {tasks
                    .filter((t) => t.is_completed)
                    .map((t) => (
                      <li
                        key={t.id}
                        className="rounded-lg border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                className="mt-1 h-4 w-4 accent-zinc-900 dark:accent-zinc-100"
                                checked={t.is_completed}
                                onChange={(e) =>
                                  void setCompleted(t.id, e.target.checked)
                                }
                              />
                              <p className="truncate text-sm text-zinc-500 line-through dark:text-zinc-500">
                                {t.title}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="rounded-md px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
                            onClick={() => void deleteTask(t.id)}
                          >
                            削除
                          </button>
                        </div>
                      </li>
                    ))}
                </ul>
              </>
            ) : null}
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <h2 className="mb-3 text-lg font-semibold">今の気分</h2>

            <div className="grid gap-3">
              <input
                value={mood}
                onChange={(e) => setMood(e.target.value)}
                className="h-10 rounded-md border border-zinc-200 bg-white px-3 text-sm outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-800 dark:bg-zinc-950"
                placeholder="例: すごく眠いけど、何か一つは終わらせたい"
              />

              <div className="flex flex-wrap gap-2">
                {[
                  "やる気MAX",
                  "ちょっと疲れた",
                  "何もしたくない",
                  "集中したい",
                ].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className="h-9 rounded-md border border-zinc-200 bg-white px-3 text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
                    onClick={() => setMood(preset)}
                  >
                    {preset}
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="inline-flex h-10 items-center justify-center rounded-md bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                onClick={() => void recommend()}
                disabled={!mood.trim() || incompleteTasks.length === 0}
              >
                {loadingRecommend ? "提案中..." : "タスクを選んでもらう"}
              </button>

              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">AIの提案</h3>
                  <span className="text-xs text-zinc-500">
                    未完了から最大3件
                  </span>
                </div>

                {recommendations.length === 0 ? (
                  <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                    気分を入力してボタンを押すと、ここに提案が表示されます。
                  </p>
                ) : (
                  <ul className="mt-2 grid gap-2">
                    {recommendations.map((r) => {
                      const t = tasks.find((x) => x.id === r.taskId);
                      return (
                        <li
                          key={`${r.taskId}:${r.reason}`}
                          className="rounded-md border border-emerald-200 bg-white px-3 py-2 dark:border-emerald-900/60 dark:bg-zinc-900"
                        >
                          <p className="text-sm font-medium">
                            {t ? t.title : "（タスクが見つかりませんでした）"}
                          </p>
                          <p className="mt-1 text-xs text-zinc-700 dark:text-zinc-300">
                            {r.reason}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <p className="text-xs text-zinc-500">
                ※ `.env.local` 未設定の場合、APIがエラーになります。
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
