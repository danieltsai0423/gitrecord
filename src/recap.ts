import type { ShareReflection } from "../shared/reflection";
import type { useLanguage } from "./i18n";

type Locale = ReturnType<typeof useLanguage>;
type NamedProject = { name: string | null; index: number };
export const projectLabel = (repo: NamedProject, { t }: Locale) => repo.name ?? t("私人專案 {count}", { count: repo.index });
export const accountLabel = (account: NamedProject, { t }: Locale) => account.name ?? t("帳號 {count}", { count: account.index });

export function recapMarkdown(data: ShareReflection, locale: Locale) {
  const { t, number, syncTime } = locale;
  const lines = [
    `# GitRecord · ${t("期間回顧")}`, "",
    `${data.start} — ${data.end} · Asia/Taipei`,
    `${t("{count} 個帳號", { count: data.accounts.length })} · ${data.repository ? projectLabel(data.repository, locale) : t("全部 repositories")}`,
    t(data.complete ? "完整資料" : "部分資料"), "",
    `- ${t("活躍日")}: ${number(data.totals.activeDays)}`,
    `- Commits: ${number(data.totals.commits)}`,
    `- ${t("新增行數")}: +${number(data.totals.additions)}`,
    `- ${t("刪除行數")}: −${number(data.totals.deletions)}`,
    `- ${t("最長連續活動")}: ${data.longestStreak === null ? t("無法確認") : t("{count} 天", { count: data.longestStreak })}`,
    "", `## ${t("主要專案")}`, "",
    ...data.repositories.map((repo) => `- ${projectLabel(repo, locale)} · ${number(repo.commits)} commits · ${t("{count} 行變更", { count: number(repo.changed) })}`),
    ...(data.repositories.length ? [] : [t("沒有已記錄的專案活動")]),
    "", `## ${t("月度軌跡")}`, "",
    ...data.months.map((month) => `- ${t("{month}：{count} 個 commits，{coverage}", { month: month.month, count: number(month.commits), coverage: t(month.complete ? "完整資料" : "部分資料") })}`),
    "", `## ${t("各帳號資料時間：")}`, "",
    ...data.accounts.map((account) => `- ${accountLabel(account, locale)} · ${syncTime(account.generatedAt)} · ${t("涵蓋")} ${account.start} — ${account.end} · ${t(account.complete ? "完整資料" : "部分資料")}`),
    "", t("資料截至各帳號保存的同步時間，非即時資料。"),
    ...(!data.complete ? [t("部分資料：以下是已保存的活動，實際活動可能更多。")] : []),
    t("活動量不代表程式碼品質或生產力。"),
  ];
  return lines.join("\n");
}

export function drawRecap(canvas: HTMLCanvasElement, data: ShareReflection, locale: Locale, light: boolean) {
  const { t, number, syncTime } = locale;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas unavailable");
  canvas.width = 1200;
  canvas.height = 830 + data.accounts.length * 52;
  const c = { background: light ? "#f5f7f5" : "#101212", surface: light ? "#ffffff" : "#19201b", text: light ? "#202d24" : "#e7ece8", muted: light ? "#495c50" : "#a6afa9", green: light ? "#28753c" : "#a9e0b0", coral: light ? "#b44d33" : "#e69c85", track: light ? "#dbe2dc" : "#2a302c" };
  const text = (value: string, x: number, y: number, size = 22, color = c.text, weight = 400, width = 1040) => {
    context.font = `${weight} ${size}px "Segoe UI", "Microsoft JhengHei", sans-serif`;
    context.fillStyle = color;
    const characters = Array.from(value);
    let clipped = value;
    while (characters.length && context.measureText(clipped).width > width) {
      characters.pop();
      clipped = characters.join("") + "…";
    }
    context.fillText(clipped, x, y);
  };
  context.fillStyle = c.background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = c.green;
  context.fillRect(0, 0, 1200, 8);
  text("GitRecord.", 80, 82, 40, c.text, 700);
  text(t("期間回顧"), 80, 145, 44, c.text, 600);
  text(`${data.start} — ${data.end} · Asia/Taipei`, 80, 186, 22, c.muted);
  text(t(data.complete ? "完整資料" : "部分資料"), 920, 82, 22, data.complete ? c.green : c.coral, 500, 200);
  text(`${t("{count} 個帳號", { count: data.accounts.length })} · ${data.repository ? projectLabel(data.repository, locale) : t("全部 repositories")}`, 80, 221, 20, c.muted);
  const metrics = [
    [t("活躍日"), number(data.totals.activeDays), c.text],
    ["Commits", number(data.totals.commits), c.text],
    [t("新增行數"), `+${number(data.totals.additions)}`, c.green],
    [t("刪除行數"), `−${number(data.totals.deletions)}`, c.coral],
  ];
  metrics.forEach(([label, value, color], i) => {
    const x = 80 + i * 266;
    text(label, x, 280, 20, c.muted, 400, 242);
    text(value, x, 335, 42, color, 600, 242);
  });
  text(`${t("月度軌跡")} · Commits`, 80, 395, 20, c.muted, 500);
  const max = Math.max(1, ...data.months.map((month) => month.commits));
  const width = 1040 / data.months.length;
  data.months.forEach((month, i) => {
    const x = 80 + i * width;
    context.fillStyle = c.track;
    context.fillRect(x, 455, Math.max(5, width - 14), 2);
    context.fillStyle = month.complete ? c.green : c.coral;
    context.fillRect(x, 455 - month.commits / max * 44, Math.max(5, width - 14), month.commits / max * 44);
    text(month.month.slice(2).replace("-", "/"), x, 484, 17, c.muted, 400, width - 4);
    text(number(month.commits), x, 507, 16, c.text, 500, width - 4);
  });
  text(t("主要專案"), 80, 541, 20, c.muted, 500);
  data.repositories.forEach((repo, i) => {
    text(`${String(i + 1).padStart(2, "0")}  ${projectLabel(repo, locale)}`, 80, 585 + i * 42, 24, c.text, 500, 720);
    text(`${number(repo.commits)} commits`, 820, 580 + i * 42, 20, c.green, 400, 300);
    text(t("{count} 行變更", { count: number(repo.changed) }), 820, 601 + i * 42, 16, c.muted, 400, 300);
  });
  if (!data.repositories.length) text(t("沒有已記錄的專案活動"), 80, 585, 24, c.muted);
  const streak = data.longestStreak === null ? t("無法確認") : t("{count} 天", { count: data.longestStreak });
  text(`${t("最長連續活動")} · ${streak}`, 80, 718, 22, c.text, 500);
  data.accounts.forEach((account, i) => {
    text(`${accountLabel(account, locale)} · ${syncTime(account.generatedAt)}`, 80, 761 + i * 52, 18, c.muted);
    text(`${t("涵蓋")} ${account.start} — ${account.end} · ${t(account.complete ? "完整資料" : "部分資料")}`, 80, 783 + i * 52, 16, c.muted);
  });
  text(t(data.complete ? "資料截至各帳號保存的同步時間，非即時資料。" : "部分資料：以下是已保存的活動，實際活動可能更多。"), 80, canvas.height - 30, 17, c.muted);
}

export async function downloadRecap(canvas: HTMLCanvasElement, start: string, end: string) {
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Image unavailable")), "image/png"));
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `gitrecord-recap-${start}-${end}.png`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
