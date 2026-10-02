import express from "express";
import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import type { Report, SyncStatus } from "../shared/report.js";
import { syncGithub, type Progress } from "./github.js";

export async function loadReport(
  path = resolve(".cache/report.json"),
): Promise<Report | null> {
  try {
    const report = JSON.parse(await readFile(path, "utf8")) as Report;
    if (
      report.version !== 1 ||
      report.timezone !== "Asia/Taipei" ||
      !Array.isArray(report.repositories)
    )
      throw new Error(
        "快取格式無效；請將 .cache/report.json 移至備份位置後重新同步。",
      );
    return report;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function saveReport(
  report: Report,
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
  initialReport?: Report | null;
  sync?: (progress: Progress) => Promise<Report>;
  save?: (report: Report) => Promise<void>;
  staticDir?: string;
}

export function createApp(options: Options = {}) {
  const app = express();
  app.disable("x-powered-by");
  let report = options.initialReport ?? null;
  const status: SyncStatus = {
    running: false,
    completed: 0,
    total: 0,
    current: "",
    error: null,
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
  app.post("/api/sync", (_req, res) => {
    if (status.running) {
      res.status(409).json({ error: "同步已在進行中。" });
      return;
    }
    Object.assign(status, {
      running: true,
      completed: 0,
      total: 0,
      current: "準備同步",
      error: null,
    });
    res.status(202).json(status);
    void (async () => {
      try {
        const nextReport = await (
          options.sync ?? ((progress) => syncGithub(undefined, progress))
        )((completed, total, current) => {
          Object.assign(status, { completed, total, current });
        });
        await (options.save ?? saveReport)(nextReport);
        report = nextReport;
      } catch (error) {
        status.error =
          error instanceof Error ? error.message : "同步失敗，請重試。";
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
