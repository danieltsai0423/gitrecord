import express from "express";
import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import {
  accountFailure, normalizeStore, updateAccount,
  type Report, type ReportStore, type SyncStatus,
} from "../shared/report.js";
import { syncGithub, type Progress } from "./github.js";
import { AuthManager } from "./auth.js";

export async function loadReport(
  path = resolve(".cache/report.json"),
): Promise<ReportStore | null> {
  try {
    return normalizeStore(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function saveReport(
  report: ReportStore,
  path = resolve(".cache/report.json"),
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, JSON.stringify(report), {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporary, path);
}

interface Options {
  initialReport?: Report | ReportStore | null;
  sync?: (progress: Progress) => Promise<Report>;
  save?: (report: ReportStore) => Promise<void>;
  staticDir?: string;
  auth?: AuthManager;
}

export function createApp(options: Options = {}) {
  const app = express();
  const auth = options.auth ?? new AuthManager();
  app.disable("x-powered-by");
  let report = options.initialReport ? normalizeStore(options.initialReport) : null;
  const status: SyncStatus = {
    running: false,
    completed: 0,
    total: 0,
    current: "",
    error: null,
    account: null,
  };
  app.use((req, res, next) => {
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host ?? "")) {
      res.status(403).json({ error: "只允許本機存取。" });
      return;
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; img-src 'self' https://avatars.githubusercontent.com data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    next();
  });
  app.use("/api", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    const origin = req.headers.origin;
    if (
      req.headers["sec-fetch-site"] === "cross-site" ||
      (origin && origin !== `http://${req.headers.host}`)
    ) {
      res.status(403).json({ error: "拒絕跨來源的本機 API 請求。" });
      return;
    }
    next();
  });
  app.get("/api/report", (_req, res) => {
    if (!report) {
      res.status(404).json({ error: "尚未同步 GitHub 資料。" });
      return;
    }
    res.json(report);
  });
  app.get("/api/sync/status", (_req, res) => res.json(status));
  app.get("/api/auth", async (req, res) => {
    res.json(await auth.status(req.query.refresh === "true"));
  });
  app.post("/api/auth/login", (_req, res) => {
    if (status.running || auth.running) {
      res.status(409).json({ error: "同步或帳號操作正在進行，請完成後再新增帳號。" });
      return;
    }
    auth.startLogin();
    res.status(202).json(auth.snapshot);
  });
  app.post("/api/auth/cancel", (_req, res) => {
    auth.cancelLogin();
    res.status(202).json(auth.snapshot);
  });
  app.post("/api/auth/config", express.json({ limit: "1kb" }), async (req, res) => {
    if (status.running || auth.running) {
      res.status(409).json({ error: "同步或帳號操作已在進行中。" });
      return;
    }
    try {
      await auth.configure(req.body);
      res.json(auth.snapshot);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "無效的 OAuth Client ID。" });
    }
  });
  app.post("/api/auth/forget", express.json({ limit: "1kb" }), async (req, res) => {
    if (status.running || auth.running) {
      res.status(409).json({ error: "同步或帳號操作已在進行中。" });
      return;
    }
    const login = req.body?.login;
    if (typeof login !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(login)) {
      res.status(400).json({ error: "無效的 GitHub 帳號。" });
      return;
    }
    await auth.forgetAccount(login);
    res.json(auth.snapshot);
  });
  app.post("/api/auth/switch", express.json({ limit: "1kb" }), async (req, res) => {
    if (status.running || auth.running) {
      res.status(409).json({ error: "同步或帳號操作正在進行，請完成後再切換帳號。" });
      return;
    }
    const login = req.body?.login;
    if (typeof login !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(login)) {
      res.status(400).json({ error: "無效的 GitHub 帳號。" });
      return;
    }
    await auth.switchAccount(login);
    res.status(202).json(auth.snapshot);
  });
  app.post("/api/sync", (_req, res) => {
    if (status.running || auth.running) {
      res.status(409).json({ error: "同步或帳號操作已在進行中。" });
      return;
    }
    Object.assign(status, {
      running: true,
      completed: 0,
      total: 0,
      current: "準備同步",
      error: null,
      account: null,
    });
    res.status(202).json(status);
    void (async () => {
      let user: Report["user"] | undefined;
      const attemptedAt = new Date().toISOString();
      let syncing = true;
      try {
        const nextReport = await (
          options.sync ?? (async (progress) => {
            const source = await auth.source();
            return syncGithub(source.query, progress, new Date(), source.repositoryIds);
          })
        )((completed, total, current, account) => {
          if (account) user = account;
          Object.assign(status, {
            completed, total, current, account: user?.login ?? null,
          });
        });
        syncing = false;
        const nextStore = updateAccount(
          report ?? { version: 2, accounts: [] }, nextReport,
        );
        await (options.save ?? saveReport)(nextStore);
        report = nextStore;
        status.account = nextReport.user.login;
      } catch (error) {
        status.error =
          error instanceof Error ? error.message : "同步失敗，請重試。";
        if (syncing && user && report) {
          const failed = accountFailure(report, user, status.error, attemptedAt);
          try {
            await (options.save ?? saveReport)(failed);
            report = failed;
          } catch {
            status.error += " 無法保存失敗狀態，原報告仍保留。";
          }
        }
      } finally {
        status.running = false;
      }
    })();
  });
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "找不到 API。" }),
  );
  app.use(
    express.static(options.staticDir ?? resolve("dist"), {
      etag: true,
      index: "index.html",
    }),
  );
  return app;
}
