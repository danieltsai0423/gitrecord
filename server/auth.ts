import type { AuthStatus, InstallationStatus } from "../shared/report.js";
import { FileConfig, KeychainStore, parseAppSettings, configuredApp, appUrl, type ConfigStore, type Credential, type CredentialStore, type OAuthConfig } from "./credentials.js";
import { GithubOAuth, type OAuthProvider } from "./oauth.js";
import { createGithubQuery, type Query } from "./github.js";
import type { Fetch } from "./http.js";
import type { Connection } from "./installation.js";

interface Options {
  config?: ConfigStore;
  credentials?: CredentialStore;
  provider?: OAuthProvider;
  now?: () => number;
  request?: Fetch;
}

export class AuthManager {
  private state: AuthStatus = {
    accounts: [], running: false, operation: null, code: null,
    verificationUrl: null, error: null, message: null,
  };
  private config: OAuthConfig = { clientId: "", appId: "", appSlug: "", activeId: null };
  private credentials = new Map<string, Credential>();
  private initialized: Promise<void> | null = null;
  private controller: AbortController | null = null;
  private readonly configStore: ConfigStore;
  private readonly store: CredentialStore;
  private readonly provider: OAuthProvider;
  private readonly now: () => number;
  private readonly request: Fetch;
  private refreshes = new Map<string, Promise<string>>();
  private checkingIdentity = false;
  private installations = new Map<string, InstallationStatus>();

  constructor(options: Options = {}) {
    this.configStore = options.config ?? new FileConfig();
    this.store = options.credentials ?? new KeychainStore();
    this.provider = options.provider ?? new GithubOAuth();
    this.now = options.now ?? Date.now;
    this.request = options.request ?? fetch;
  }
  get running() { return this.state.running || this.checkingIdentity; }
  get snapshot(): AuthStatus {
    return { ...this.state, running: this.running, operation: this.checkingIdentity ? "refresh" : this.state.operation,
      accounts: [...this.credentials.values()].map(({ id, login }) => ({
        login, active: id === this.config.activeId, state: "success",
      })),
      configuration: { clientId: this.config.clientId, appId: this.config.appId, appUrl: appUrl(this.config.appSlug),
        configured: configuredApp(this.config), storage: this.store.persistent ? "keychain" : "session" },
      installation: this.config.activeId ? this.installations.get(this.config.activeId) ?? {
        state: "unknown", url: appUrl(this.config.appSlug) + "/installations/new", selection: null, repositoryCount: 0,
      } : null,
    };
  }
  private async initialize() {
    if (!this.initialized) this.initialized = (async () => {
      const config = await this.configStore.load();
      const accounts = await this.store.load(config.clientId);
      this.config = config;
      this.credentials = new Map(accounts.map((account) => [account.id, account]));
    })().catch((error) => { this.initialized = null; throw error; });
    await this.initialized;
  }
  async status(refresh = false): Promise<AuthStatus> {
    let checking = false;
    try {
      await this.initialize();
      if (refresh && !this.running && this.config.activeId && configuredApp(this.config)) {
        this.checkingIdentity = checking = true;
        const id = this.config.activeId;
        const identity = await this.provider.identity(await this.token(id));
        if (identity.id !== id) throw new Error("授權帳號與保存的身份不一致，請重新授權。");
        const credential = { ...this.credentials.get(id)!, login: identity.login };
        await this.store.save(credential);
        this.credentials.set(id, credential);
        await this.connection(id);
        this.state.error = null;
      }
    } catch (error) { this.state.error = this.error(error); }
    finally { if (checking) this.checkingIdentity = false; }
    return this.snapshot;
  }
  async configure(value: unknown) {
    const settings = parseAppSettings(value);
    for (const [env, field] of [["GITRECORD_GITHUB_CLIENT_ID", "clientId"], ["GITRECORD_GITHUB_APP_ID", "appId"], ["GITRECORD_GITHUB_APP_SLUG", "appSlug"]] as const)
      if (process.env[env] && process.env[env] !== settings[field]) throw new Error("GitHub App 設定由環境變數提供，請更新啟動設定。");
    this.begin("switch");
    try {
      await this.initialize();
      await this.provider.verifyApp(settings);
      const config = { ...settings, activeId: settings.clientId === this.config.clientId && settings.appId === this.config.appId ? this.config.activeId : null };
      const accounts = await this.store.load(settings.clientId);
      await this.configStore.save(config);
      this.config = config;
      this.credentials = new Map(accounts.map((account) => [account.id, account]));
      this.installations.clear();
      this.state.message = "GitHub App 設定已保存，可以連接帳號。";
    } catch (error) { this.state.error = this.error(error); throw new Error(this.state.error); }
    finally { this.finish(); }
  }
  startLogin(): void {
    this.begin("login");
    const controller = new AbortController();
    this.controller = controller;
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15 * 60 * 1000)]);
    void this.complete(async () => {
      await this.initialize();
      if (!configuredApp(this.config)) throw new Error("請先設定 GitRecord 的 GitHub App 資訊。");
      await this.provider.verifyApp(this.config, signal);
      const device = await this.provider.device(this.config.clientId, signal);
      signal.throwIfAborted();
      this.state.code = device.userCode;
      this.state.verificationUrl = "https://github.com/login/device";
      const tokens = await this.provider.authorize(this.config.clientId, device, signal);
      signal.throwIfAborted();
      const identity = await this.provider.identity(tokens.accessToken, signal);
      signal.throwIfAborted();
      const credential = { ...tokens, ...identity };
      const previous = this.credentials.get(credential.id);
      const previousConfig = { ...this.config };
      let connection: Connection;
      try {
        await this.store.save(credential);
        signal.throwIfAborted();
        connection = await this.provider.connection(this.config, credential.id, credential.accessToken, signal);
        signal.throwIfAborted();
        await this.configStore.save({ ...this.config, activeId: credential.id });
        signal.throwIfAborted();
      } catch (error) {
        if (previous) await this.store.save(previous);
        else await this.store.remove(credential.clientId, credential.id);
        await this.configStore.save(previousConfig);
        throw error;
      }
      this.credentials.set(credential.id, credential);
      this.config.activeId = credential.id;
      const { repositoryIds: _ids, ...installation } = connection;
      this.installations.set(credential.id, installation);
    }, "GitHub 帳號已連接。", signal);
  }
  async switchAccount(login: string): Promise<void> {
    this.begin("switch");
    void this.complete(async () => {
      await this.initialize();
      const account = [...this.credentials.values()].find((account) => account.login === login);
      if (!account) throw new Error("此帳號尚未登入，請先新增 GitHub 帳號。");
      const identity = await this.provider.identity(await this.token(account.id));
      if (identity.id !== account.id) throw new Error("授權帳號與保存的身份不一致，請重新授權。");
      await this.configStore.save({ ...this.config, activeId: account.id });
      this.config.activeId = account.id;
      await this.connection(account.id);
    }, `已切換至 ${login}，可以同步此帳號。`);
  }
  async forgetAccount(login: string): Promise<void> {
    this.begin("switch");
    try {
      await this.initialize();
      const account = [...this.credentials.values()].find((entry) => entry.login === login);
      if (!account) throw new Error("此帳號尚未登入，請先新增 GitHub 帳號。");
      await this.store.remove(this.config.clientId, account.id);
      this.credentials.delete(account.id);
      this.installations.delete(account.id);
      if (this.config.activeId === account.id) this.config.activeId = null;
      await this.configStore.save(this.config);
      this.state.message = "已移除本機登入，保存的統計資料仍保留。";
    } catch (error) { this.state.error = this.error(error); }
    finally { this.finish(); }
  }
  cancelLogin(): void {
    if (this.state.operation === "login" && this.running) this.controller?.abort();
  }
  async query(): Promise<Query> {
    await this.initialize();
    const id = this.config.activeId;
    if (!id || !this.credentials.has(id)) throw new Error("尚未登入 GitHub，請按「新增 GitHub 帳號」。");
    // Capture the account for the entire sync; refreshes may rotate its token.
    return createGithubQuery(() => this.token(id), this.request);
  }
  async source(): Promise<{ query: Query; repositoryIds: string[] }> {
    await this.initialize();
    const id = this.config.activeId;
    if (!id || !this.credentials.has(id)) throw new Error("尚未登入 GitHub，請按「新增 GitHub 帳號」。");
    if (!configuredApp(this.config)) throw new Error("請先設定 GitRecord 的 GitHub App 資訊。");
    const connection = await this.connection(id);
    if (connection.state === "permissions") throw new Error("請將 GitHub App 的 Contents 設為 Read-only，並移除寫入權限。");
    if (connection.state === "suspended") throw new Error("GitHub App 安裝已暫停，請在 GitHub 恢復存取。");
    if (connection.state !== "ready") throw new Error("請先在 GitHub App 安裝設定選擇要統計的 repositories。");
    return { query: createGithubQuery(() => this.token(id), this.request), repositoryIds: connection.repositoryIds };
  }
  private async connection(id: string, signal?: AbortSignal) {
    this.installations.delete(id);
    const result = await this.provider.connection(this.config, id, await this.token(id), signal);
    const { repositoryIds, ...status } = result;
    this.installations.set(id, status);
    return { ...status, repositoryIds };
  }
  private async token(id: string): Promise<string> {
    const credential = this.credentials.get(id);
    if (!credential) throw new Error("尚未登入 GitHub，請按「新增 GitHub 帳號」。");
    if (!credential.expiresAt || credential.expiresAt > this.now() + 60000) return credential.accessToken;
    let pending = this.refreshes.get(id);
    if (!pending) {
      pending = (async () => {
        const tokens = await this.provider.refresh(credential);
        const identity = await this.provider.identity(tokens.accessToken);
        if (identity.id !== id) throw new Error("授權帳號與保存的身份不一致，請重新授權。");
        const next = { ...tokens, ...identity };
        await this.store.save(next);
        this.credentials.set(id, next);
        return next.accessToken;
      })().finally(() => this.refreshes.delete(id));
      this.refreshes.set(id, pending);
    }
    return pending;
  }
  private begin(operation: "login" | "switch") {
    if (this.running) throw new Error("帳號操作已在進行中。");
    this.state = { ...this.state, running: true, operation,
      code: null, verificationUrl: null, error: null, message: null,
    };
  }
  private finish() {
    this.state.running = false;
    this.state.operation = null;
    this.state.code = null;
    this.state.verificationUrl = null;
    this.controller = null;
  }
  private error(error: unknown) {
    if (this.controller?.signal.aborted) return "授權已取消。";
    if (error instanceof Error && error.name === "TimeoutError") return "GitHub 授權已逾時，請重新新增帳號。";
    return error instanceof Error && error.name !== "AbortError" ? error.message : "GitHub 授權或帳號查詢失敗，請重試。";
  }
  private async complete(action: () => Promise<void>, message: string, signal?: AbortSignal) {
    try { await action(); this.state.message = message; }
    catch (error) {
      this.state.error = signal?.reason?.name === "TimeoutError"
        ? "GitHub 授權已逾時，請重新新增帳號。" : this.error(error);
    }
    finally { this.finish(); }
  }
}
