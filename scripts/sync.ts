import { syncGithub } from "../server/github.js";
import { saveReport } from "../server/app.js";
import { viewReport } from "../shared/report.js";

try {
  const report = await syncGithub(undefined, (done, total, current) =>
    console.log(`[${done}/${total}] ${current}`),
  );
  await saveReport(report);
  console.log(
    JSON.stringify(
      {
        account: report.user.login,
        repositories: report.repositories.length,
        partial: report.partial,
        range: report.range,
        totals: viewReport(report, report.range.start, report.range.end).totals,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "同步失敗");
  process.exitCode = 1;
}
