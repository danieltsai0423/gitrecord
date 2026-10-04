import { setTimeout as delay } from "node:timers/promises";
import { jsonRequest, type Fetch } from "./http.js";
import type { Credential, AppSettings } from "./credentials.js";
import { verifyApp, inspectInstallation, type Connection } from "./installation.js";

export interface DeviceCode { deviceCode: string; userCode: string; expiresIn: number; interval: number; }
export interface OAuthProvider {
  device(clientId: string, signal: AbortSignal): Promise<DeviceCode>;
  authorize(clientId: string, device: DeviceCode, signal: AbortSignal): Promise<Omit<Credential, "id" | "login">>;
  identity(token: string, signal?: AbortSignal): Promise<{ id: string; login: string }>;
  refresh(credential: Credential): Promise<Omit<Credential, "id" | "login">>;
  verifyApp(config: AppSettings, signal?: AbortSignal): Promise<void>;
  connection(config: AppSettings, userId: string, token: string, signal?: AbortSignal): Promise<Connection>;
}
const oauthError = (code: unknown): Error => new Error(
  code === "access_denied" ? "GitHub 授權未獲允許，請重試。" :
  code === "expired_token" || code === "token_expired" ? "GitHub 授權已逾時，請重新新增帳號。" :
  code === "device_flow_disabled" ? "請在 GitHub App 設定啟用 Device Flow。" :
  code === "incorrect_client_credentials" ? "OAuth Client ID 無效，請檢查應用設定。" :
  code === "bad_refresh_token" ? "GitHub 登入失效，請重新新增帳號授權。" :
  "GitHub 授權或帳號查詢失敗，請重試。",
);

export class GithubOAuth implements OAuthProvider {
  constructor(private readonly request: Fetch = fetch,
    private readonly wait: (ms: number, signal: AbortSignal) => Promise<void> = async (ms, signal) => { await delay(ms, undefined, { signal }); },
    private readonly now = Date.now) {}
  private async post(path: string, values: Record<string, string>, signal?: AbortSignal) {
    const result = await jsonRequest(this.request, `https://github.com${path}`, {
      method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "GitRecord" },
      body: new URLSearchParams(values).toString(), signal,
    }, 65536);
    if (result.status >= 400 && !result.body.error) throw oauthError(null);
    return result.body;
  }
  async device(clientId: string, signal: AbortSignal): Promise<DeviceCode> {
    const data = await this.post("/login/device/code", { client_id: clientId }, signal);
    if (data.error) throw oauthError(data.error);
    if (typeof data.device_code !== "string" || !/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(data.user_code) ||
      data.verification_uri !== "https://github.com/login/device" || !Number.isInteger(data.expires_in) ||
      data.expires_in <= 0 || data.expires_in > 3600 || !Number.isInteger(data.interval) || data.interval < 1)
      throw new Error("GitHub 回傳無效資料，請重試。");
    return { deviceCode: data.device_code, userCode: data.user_code, expiresIn: data.expires_in, interval: data.interval };
  }
  private tokens(clientId: string, data: Record<string, any>): Omit<Credential, "id" | "login"> {
    if (data.error) throw oauthError(data.error);
    if (typeof data.access_token !== "string" || !data.access_token || typeof data.token_type !== "string" || data.token_type.toLowerCase() !== "bearer" ||
      (data.expires_in !== undefined && (!Number.isFinite(data.expires_in) || data.expires_in <= 0)) ||
      (data.refresh_token !== undefined && (typeof data.refresh_token !== "string" || !data.refresh_token)) ||
      (data.refresh_token_expires_in !== undefined && (!Number.isFinite(data.refresh_token_expires_in) || data.refresh_token_expires_in <= 0)))
      throw new Error("GitHub 回傳無效資料，請重試。");
    return { clientId, accessToken: data.access_token,
      ...(data.refresh_token ? { refreshToken: data.refresh_token } : {}),
      ...(data.expires_in ? { expiresAt: this.now() + data.expires_in * 1000 } : {}),
      ...(data.refresh_token_expires_in ? { refreshExpiresAt: this.now() + data.refresh_token_expires_in * 1000 } : {}),
    };
  }
  async authorize(clientId: string, device: DeviceCode, signal: AbortSignal) {
    const expires = this.now() + device.expiresIn * 1000;
    let interval = device.interval;
    while (!signal.aborted && this.now() < expires) {
      await this.wait(Math.min(interval * 1000, expires - this.now()), signal);
      if (signal.aborted) throw new Error("授權已取消。");
      if (this.now() >= expires) break;
      const data = await this.post("/login/oauth/access_token", {
        client_id: clientId, device_code: device.deviceCode, grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }, signal);
      if (data.error === "authorization_pending") continue;
      if (data.error === "slow_down") { interval = Math.max(interval + 5, Number(data.interval) || 0); continue; }
      return this.tokens(clientId, data);
    }
    throw oauthError("expired_token");
  }
  async identity(token: string, signal?: AbortSignal) {
    const { status, body } = await jsonRequest(this.request, "https://api.github.com/user", {
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "User-Agent": "GitRecord" }, signal,
    }, 65536);
    if (status === 401) throw new Error("GitHub 登入失效，請重新新增帳號授權。");
    if (status !== 200 || !Number.isSafeInteger(body.id) || typeof body.login !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(body.login))
      throw oauthError(null);
    return { id: String(body.id), login: body.login };
  }
  async refresh(credential: Credential) {
    if (!credential.refreshToken || (credential.refreshExpiresAt && credential.refreshExpiresAt <= this.now()))
      throw new Error("GitHub 登入失效，請重新新增帳號授權。");
    return this.tokens(credential.clientId, await this.post("/login/oauth/access_token", {
      client_id: credential.clientId, grant_type: "refresh_token", refresh_token: credential.refreshToken,
    }));
  }
  verifyApp(config: AppSettings, signal?: AbortSignal) { return verifyApp(this.request, config, signal); }
  connection(config: AppSettings, userId: string, token: string, signal?: AbortSignal) {
    return inspectInstallation(this.request, config, userId, token, signal);
  }
}
