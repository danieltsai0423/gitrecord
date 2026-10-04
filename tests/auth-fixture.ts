import type { ConfigStore, Credential, CredentialStore, OAuthConfig } from "../server/credentials.js";
import type { OAuthProvider } from "../server/oauth.js";

export const clientId = "test-client-id";
export const appSettings = { clientId, appId: "1234", appSlug: "test-gitrecord" };
export const publicSettings = { clientId, appId: "1234", appUrl: "https://github.com/apps/test-gitrecord" };
export const credential = (id = "1", login = "example"): Credential => ({
  id, login, clientId, accessToken: `fake-access-${id}`, refreshToken: `fake-refresh-${id}`,
});
export class MemoryCredentials implements CredentialStore {
  persistent = true;
  values: Credential[] = [];
  async load(clientId: string) { return structuredClone(this.values.filter((entry) => entry.clientId === clientId)); }
  async save(entry: Credential) { this.values = [...this.values.filter((value) => value.id !== entry.id || value.clientId !== entry.clientId), structuredClone(entry)]; }
  async remove(clientId: string, id: string) { this.values = this.values.filter((entry) => entry.clientId !== clientId || entry.id !== id); }
}
export class MemoryConfig implements ConfigStore {
  value: OAuthConfig = { ...appSettings, activeId: null };
  async load() { return { ...this.value }; }
  async save(value: OAuthConfig) { this.value = { ...value }; }
}
export const provider = (extra: Partial<OAuthProvider> = {}): OAuthProvider => ({
  verifyApp: async () => {},
  connection: async () => ({ state: "ready", url: "https://github.com/settings/installations/99", selection: "selected", repositoryCount: 1, repositoryIds: ["R_1"] }),
  device: async () => ({ deviceCode: "private-device-code", userCode: "ABCD-1234", interval: 5, expiresIn: 900 }),
  authorize: async () => ({ clientId, accessToken: "fake-access-1", refreshToken: "fake-refresh-1" }),
  identity: async (token) => ({ id: token.endsWith("2") ? "2" : "1", login: token.endsWith("2") ? "other" : "example" }),
  refresh: async (value) => ({ ...value, accessToken: `rotated-access-${value.id}`, refreshToken: `rotated-refresh-${value.id}`, expiresAt: Date.now() + 1000000 }),
  ...extra,
});
export async function settled(auth: { running: boolean }) {
  for (let i = 0; i < 50 && auth.running; i++) await new Promise(setImmediate);
  if (auth.running) throw new Error("Operation did not finish");
}
