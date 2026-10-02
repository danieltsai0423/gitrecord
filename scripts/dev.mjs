import { spawn } from "node:child_process";

const processes = [
  spawn(process.execPath, ["--import", "tsx", "--watch", "server/index.ts"], {
    stdio: "inherit",
  }),
  spawn(process.execPath, ["node_modules/vite/bin/vite.js"], {
    stdio: "inherit",
  }),
];
let closing = false;
function close(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of processes) child.kill();
  process.exit(code);
}
for (const child of processes) child.on("exit", (code) => close(code ?? 0));
process.on("SIGINT", () => close());
process.on("SIGTERM", () => close());
