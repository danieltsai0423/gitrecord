import { useCallback, useEffect, useState } from "react";
import type { Report, SyncStatus } from "../shared/report";

const idle: SyncStatus = {
  running: false,
  completed: 0,
  total: 0,
  current: "",
  error: null,
};

async function readReport(signal?: AbortSignal): Promise<Report | null> {
  const response = await fetch("/api/report", { signal, cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("無法取得報告，請確認本機服務正在執行。");
  return response.json();
}

export function useReport() {
  const [report, setReport] = useState<Report | null>(null);
  const [status, setStatus] = useState<SyncStatus>(idle);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sync = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/sync", { method: "POST" });
      if (response.status === 409) {
        const ongoing = await fetch("/api/sync/status", { cache: "no-store" });
        if (!ongoing.ok) throw new Error("無法讀取同步狀態。");
        setStatus(await ongoing.json());
        return;
      }
      if (!response.ok) throw new Error("無法開始同步，請確認本機服務。");
      setStatus(await response.json());
    } catch (error) {
      setError(error instanceof Error ? error.message : "同步失敗");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const [cached, response] = await Promise.all([
          readReport(controller.signal),
          fetch("/api/sync/status", {
            signal: controller.signal,
            cache: "no-store",
          }),
        ]);
        if (!response.ok) throw new Error("無法取得同步狀態。");
        const current: SyncStatus = await response.json();
        if (controller.signal.aborted) return;
        setReport(cached);
        setStatus(current);
        setError(current.error);
        if (!cached && !current.running && !current.error) void sync();
      } catch (error) {
        if (!controller.signal.aborted)
          setError(error instanceof Error ? error.message : "無法載入報告");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [sync]);

  useEffect(() => {
    if (!status.running) return;
    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const response = await fetch("/api/sync/status", { cache: "no-store" });
        if (!response.ok) throw new Error("無法讀取同步進度。");
        const current: SyncStatus = await response.json();
        if (cancelled) return;
        if (current.running) {
          setStatus(current);
          timeout = setTimeout(poll, 1000);
        } else {
          const next = await readReport();
          if (cancelled) return;
          if (next) setReport(next);
          setError(current.error);
          setStatus(current);
        }
      } catch (error) {
        if (!cancelled) {
          setError(error instanceof Error ? error.message : "連線中斷");
          setStatus((previous) => ({ ...previous, running: false }));
        }
      }
    }
    timeout = setTimeout(poll, 600);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [status.running]);

  return { report, status, loading, error, sync };
}
