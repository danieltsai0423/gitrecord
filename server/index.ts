import { createApp, loadReport } from "./app.js";

const portIndex = process.argv.indexOf("--port");
const port = portIndex >= 0 ? Number(process.argv[portIndex + 1]) : 4317;
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Port 必須是 1024 至 65535 的整數。");
try {
  const app = createApp({ initialReport: await loadReport() });
  const server = app.listen(port, "127.0.0.1", () =>
    console.log(`GitRecord 已啟動：http://127.0.0.1:${port}`),
  );
  server.on("error", (error: NodeJS.ErrnoException) => {
    console.error(
      error.code === "EADDRINUSE"
        ? `Port ${port} 已被占用，請使用 --port 指定其他埠。`
        : "無法啟動本機服務。",
    );
    process.exitCode = 1;
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : "無法載入統計快取。");
  process.exitCode = 1;
}
