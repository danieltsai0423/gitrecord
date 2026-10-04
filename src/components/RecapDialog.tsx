import { useEffect, useMemo, useRef, useState } from "react";
import { IconX, IconCopy, IconDownload } from "@tabler/icons-react";
import { shareReflection, type Reflection } from "../../shared/reflection";
import { useLanguage } from "../i18n";
import { drawRecap, downloadRecap, recapMarkdown } from "../recap";

export function RecapDialog({ review, light, close }: { review: Reflection; light: boolean; close: () => void }) {
  const locale = useLanguage();
  const { t } = locale;
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [hideNames, setHideNames] = useState(true);
  const [notice, setNotice] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const data = useMemo(() => shareReflection(review, hideNames), [review, hideNames]);
  const markdown = recapMarkdown(data, locale);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    setNotice("");
    try {
      if (canvas.current) drawRecap(canvas.current, data, locale, light);
      setFailed(false);
    } catch { setFailed(true); }
  }, [data, locale, light]);
  async function copy() {
    try { await navigator.clipboard.writeText(markdown); setNotice(t("摘要已複製")); }
    catch { setNotice(t("無法複製，請從文字摘要預覽選取並複製。")); }
  }
  async function download() {
    if (!canvas.current) return;
    setBusy(true);
    try { await downloadRecap(canvas.current, data.start, data.end); setNotice(t("圖片已下載")); }
    catch { setNotice(t("無法產生圖片，請重試。")); }
    finally { setBusy(false); }
  }
  const finish = () => { dialog.current?.close(); close(); };
  return <dialog ref={dialog} className="recap-dialog no-print" aria-labelledby="recap-title" onCancel={(event) => { event.preventDefault(); finish(); }}>
    <div className="recap-header">
      <div><span className="eyebrow">YOUR CODE, YOUR STORY</span><h2 id="recap-title">{t("分享回顧")}</h2></div>
      <button type="button" className="theme-toggle" onClick={finish} aria-label={t("關閉回顧卡")}><IconX size={20} /></button>
    </div>
    <p className="reflection-hint">{t("預覽就是匯出內容；圖片和文字都在本機產生。")}</p>
    <label className="recap-privacy"><input type="checkbox" checked={hideNames} onChange={(e) => setHideNames(e.target.checked)} />{t("隱藏帳號與私人專案名稱")}</label>
    <canvas ref={canvas} className="recap-canvas" role="img" aria-label={t("回顧卡預覽")} />
    {failed && <p role="alert">{t("無法產生圖片，請重試。")}</p>}
    <details className="recap-text"><summary>{t("文字摘要預覽")}</summary><pre>{markdown}</pre></details>
    <div className="recap-actions">
      <button type="button" className="button button-quiet" onClick={() => void copy()}><IconCopy size={16} />{t("複製 Markdown 摘要")}</button>
      <button type="button" className="button button-primary" disabled={failed || busy} onClick={() => void download()}><IconDownload size={16} />{t("下載 PNG")}</button>
    </div>
    <p className="reflection-hint" role="status">{notice}</p>
  </dialog>;
}
