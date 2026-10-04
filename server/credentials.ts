import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

export interface Credential {
  id: string;
  login: string;
  clientId: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  refreshExpiresAt?: number;
}
export interface CredentialStore {
  readonly persistent: boolean;
  load(clientId: string): Promise<Credential[]>;
  save(credential: Credential): Promise<void>;
  remove(clientId: string, id: string): Promise<void>;
}

// Tokens are held in the OS credential store, never in the report/config files.
// Without a usable native keychain, credentials remain in this process only.
export class KeychainStore implements CredentialStore {
  persistent = true;
  private session = new Map<string, Credential>();
  private persisted = new Set<string>();
  private service(clientId: string) { return `GitRecord:github.com:${clientId}`; }
  async load(clientId: string): Promise<Credential[]> {
    if (!clientId) return [];
    if (this.persistent) try {
      const { findCredentialsAsync } = await import("@napi-rs/keyring");
      const entries = await findCredentialsAsync(this.service(clientId));
      for (const entry of entries) {
        try {
          const value: Credential = JSON.parse(entry.password);
          if (value.clientId !== clientId || typeof value.id !== "string" ||
            typeof value.login !== "string" || typeof value.accessToken !== "string" || !value.accessToken)
            continue;
          const key = `${clientId}:${value.id}`;
          this.session.set(key, value);
          this.persisted.add(key);
        } catch { /* Invalid entries require reauthorization, not plaintext storage. */ }
      }
    } catch { this.persistent = false; }
    return [...this.session.values()].filter((entry) => entry.clientId === clientId);
  }
  async save(credential: Credential) {
    if (this.persistent) {
      try {
        const { AsyncEntry } = await import("@napi-rs/keyring");
        await new AsyncEntry(this.service(credential.clientId), credential.id).setPassword(JSON.stringify(credential));
        this.persisted.add(`${credential.clientId}:${credential.id}`);
      } catch { this.persistent = false; }
    }
    this.session.set(`${credential.clientId}:${credential.id}`, { ...credential });
  }
  async remove(clientId: string, id: string) {
    const key = `${clientId}:${id}`;
    if (this.persistent || this.persisted.has(key)) {
      try {
        const { AsyncEntry } = await import("@napi-rs/keyring");
        await new AsyncEntry(this.service(clientId), id).deleteCredential();
      } catch { throw new Error("無法移除本機授權憑證，請重試。"); }
    }
    this.persisted.delete(key);
    this.session.delete(key);
  }
}

export interface AppSettings { clientId: string; appId: string; appSlug: string; }
export interface OAuthConfig extends AppSettings { activeId: string | null; }
export interface ConfigStore {
  load(): Promise<OAuthConfig>;
  save(config: OAuthConfig): Promise<void>;
}
export const validClientId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-zA-Z0-9._-]{10,100}$/.test(value);
export const validAppId = (value: unknown): value is string =>
  typeof value === "string" && /^[1-9][0-9]{0,15}$/.test(value) && Number.isSafeInteger(Number(value));
export const validAppSlug = (value: unknown): value is string =>
  typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,99}$/.test(value);
export const configuredApp = (value: AppSettings) => validClientId(value.clientId) && validAppId(value.appId) && validAppSlug(value.appSlug);
export const appUrl = (slug: string) => slug ? "https://github.com/apps/" + slug : "";
export function parseAppSettings(value: unknown): AppSettings {
  const input = value as Record<string, unknown> | null;
  if (!input || !validClientId(input.clientId)) throw new Error("無效的 OAuth Client ID。");
  if (!validAppId(input.appId)) throw new Error("無效的 GitHub App ID。");
  const slug = typeof input.appUrl === "string" ? /^https:\/\/github\.com\/apps\/([a-z0-9][a-z0-9-]{0,99})\/?$/.exec(input.appUrl)?.[1] : null;
  if (!slug) throw new Error("請填入有效的 GitHub App 公開頁網址。");
  return { clientId: input.clientId, appId: input.appId, appSlug: slug };
}

export class FileConfig implements ConfigStore {
  constructor(private readonly path = resolve(".cache/oauth.json"), private readonly bundled = resolve("oauth.config.json")) {}
  async load(): Promise<OAuthConfig> {
    const read = async (path: string) => {
      try {
        const value = JSON.parse(await readFile(path, "utf8"));
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
        return value;
      }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
        throw new Error("OAuth 設定無效，請檢查 oauth.config.json。");
      }
    };
    const local = await read(this.path);
    const shipped = await read(this.bundled);
    const source = local.clientId ? local : shipped;
    const clientId = process.env.GITRECORD_GITHUB_CLIENT_ID ?? source.clientId ?? "";
    const appId = process.env.GITRECORD_GITHUB_APP_ID ?? source.appId ?? "";
    const appSlug = process.env.GITRECORD_GITHUB_APP_SLUG ?? source.appSlug ?? "";
    if (clientId && !validClientId(clientId)) throw new Error("無效的 OAuth Client ID。");
    if (appId && !validAppId(appId)) throw new Error("無效的 GitHub App ID。");
    if (appSlug && !validAppSlug(appSlug)) throw new Error("請填入有效的 GitHub App 公開頁網址。");
    return { clientId, appId, appSlug, activeId: clientId === local.clientId && appId === local.appId && appSlug === local.appSlug && typeof local.activeId === "string" ? local.activeId : null };
  }
  async save(config: OAuthConfig) {
    await mkdir(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(config), { mode: 0o600, encoding: "utf8" });
      await rename(temporary, this.path);
    } catch { throw new Error("無法保存 OAuth 設定，請確認本機資料夾可寫入。"); }
  }
}
