import { useCallback, useEffect, useRef, useState } from "react";
import type { AuthStatus } from "../shared/report";

const idle: AuthStatus = {
  accounts: [], running: false, operation: null, code: null,
  verificationUrl: null, error: null, message: null,
};

async function readAuth(signal?: AbortSignal, refresh = false): Promise<AuthStatus> {
  const response = await fetch(`/api/auth${refresh ? "?refresh=true" : ""}`, { signal, cache: "no-store" });
  if (!response.ok) throw new Error("無法取得 GitHub 登入狀態，請重新整理。");
  return response.json();
}

export function useAuth() {
  const [status, setStatus] = useState<AuthStatus>(idle);
  const [loading, setLoading] = useState(true);
  const [connectedVersion, setConnectedVersion] = useState(0);
  const [waitingForInstallation, setWaitingForInstallation] = useState(false);
  const awaitingCompletion = useRef(false);
  const pending = useRef(false);

  const accept = useCallback((next: AuthStatus) => {
    if (!next.running && awaitingCompletion.current) {
      if (next.error) { awaitingCompletion.current = false; setWaitingForInstallation(false); }
      else if (next.installation?.state === "ready") {
        awaitingCompletion.current = false;
        setWaitingForInstallation(false);
        setConnectedVersion((value) => value + 1);
      }
    }
    setStatus(next);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void readAuth(controller.signal, true).then((next) => {
      if (controller.signal.aborted) return;
      awaitingCompletion.current = next.running && (next.operation === "login" || next.operation === "switch");
      accept(next);
    }).catch((error) => {
      if (!controller.signal.aborted) setStatus({ ...idle, error: error.message });
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [accept]);

  useEffect(() => {
    if (!status.running) return;
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await readAuth(controller.signal);
        if (controller.signal.aborted) return;
        accept(next);
        if (next.running) timeout = setTimeout(poll, 1000);
      } catch (error) {
        if (!controller.signal.aborted) {
          awaitingCompletion.current = false;
          setStatus((previous) => ({ ...previous, running: false, error: error instanceof Error ? error.message : "授權連線中斷" }));
        }
      }
    };
    timeout = setTimeout(poll, 500);
    return () => { controller.abort(); clearTimeout(timeout); };
  }, [status.running, accept]);

  const action = useCallback(async (path: "login" | "switch" | "cancel" | "forget", login?: string) => {
    if (pending.current) return;
    pending.current = true;
    setWaitingForInstallation(false);
    setLoading(true);
    try {
      const response = await fetch(`/api/auth/${path}`, {
        method: "POST",
        ...(login ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login }) } : {}),
      });
      const next = await response.json();
      if (!response.ok) throw new Error(next.error || "無法開始 GitHub 授權。");
      if (path === "login" || path === "switch") awaitingCompletion.current = true;
      else awaitingCompletion.current = false;
      accept(next);
    } catch (error) {
      awaitingCompletion.current = false;
      setStatus((previous) => ({ ...previous, error: error instanceof Error ? error.message : "GitHub 授權失敗" }));
    } finally {
      pending.current = false;
      setLoading(false);
    }
  }, [accept]);

  const configure = useCallback(async (settings: { clientId: string; appId: string; appUrl: string }) => {
    if (pending.current) return;
    pending.current = true;
    setLoading(true);
    try {
      const response = await fetch("/api/auth/config", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings),
      });
      const next = await response.json();
      if (!response.ok) throw new Error(next.error || "無法保存 OAuth 設定，請確認本機資料夾可寫入。");
      accept(next);
      return true;
    } catch (error) {
      setStatus((previous) => ({ ...previous, error: error instanceof Error ? error.message : "GitHub 授權失敗" }));
      return false;
    } finally { pending.current = false; setLoading(false); }
  }, [accept]);

  const refresh = useCallback(async (syncWhenReady = false) => {
    if (pending.current) return;
    pending.current = true;
    if (syncWhenReady || (status.installation && status.installation.state !== "ready")) awaitingCompletion.current = true;
    setLoading(true);
    try { accept(await readAuth(undefined, true)); }
    catch (error) {
      awaitingCompletion.current = false;
      setWaitingForInstallation(false);
      setStatus((previous) => ({ ...previous, error: error instanceof Error ? error.message : "無法取得登入帳號" }));
    }
    finally { pending.current = false; setLoading(false); }
  }, [accept, status.installation]);

  useEffect(() => {
    if (!waitingForInstallation) return;
    const controller = new AbortController();
    const deadline = Date.now() + 10 * 60 * 1000;
    let timeout: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await readAuth(controller.signal, true);
        if (controller.signal.aborted) return;
        accept(next);
        if (next.error || next.installation?.state === "ready") return;
        if (Date.now() >= deadline) {
          awaitingCompletion.current = false;
          setWaitingForInstallation(false);
          setStatus((previous) => ({ ...previous, error: "等待安裝已逾時，完成後請按「重新檢查」。" }));
          return;
        }
        timeout = setTimeout(poll, 5000);
      } catch (error) {
        if (!controller.signal.aborted) {
          awaitingCompletion.current = false;
          setWaitingForInstallation(false);
          setStatus((previous) => ({ ...previous, error: error instanceof Error ? error.message : "無法取得登入帳號" }));
        }
      }
    };
    timeout = setTimeout(poll, 1500);
    return () => { controller.abort(); clearTimeout(timeout); };
  }, [waitingForInstallation, accept]);
  const waitForInstallation = () => { awaitingCompletion.current = true; setWaitingForInstallation(true); };
  const stopWaiting = () => { awaitingCompletion.current = false; setWaitingForInstallation(false); };

  return { status, loading, connectedVersion, action, refresh, configure, waitingForInstallation, waitForInstallation, stopWaiting };
}
