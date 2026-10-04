import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { FileConfig, KeychainStore } from "../server/credentials.js";
import { credential, appSettings } from "./auth-fixture.js";

test("公開 Client ID 與 active ID 可保存，設定檔沒有 token；缺少 config 可正常啟動", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "gitrecord-oauth-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "oauth.json"), bundled = join(directory, "bundled.json");
  const config = new FileConfig(path, bundled);
  assert.deepEqual(await config.load(), { clientId: "", appId: "", appSlug: "", activeId: null });
  await writeFile(bundled, JSON.stringify({ ...appSettings, clientId: "publisher-public-client-id" }));
  assert.equal((await config.load()).clientId, "publisher-public-client-id");
  await config.save({ ...appSettings, clientId: "local-public-client-id", activeId: "1" });
  assert.deepEqual(await config.load(), { ...appSettings, clientId: "local-public-client-id", activeId: "1" });
  assert.doesNotMatch(await readFile(path, "utf8"), /token|fake-access|fake-refresh/i);
});

test("Windows Credential Manager 保存／重新讀取／移除獨立的測試憑證", { skip: process.platform !== "win32" }, async (t) => {
  const record = { ...credential(), clientId: `gitrecord-test-${randomUUID()}` };
  const first = new KeychainStore();
  t.after(async () => { await first.remove(record.clientId, record.id); });
  await first.save(record);
  assert.equal(first.persistent, true);
  const restarted = new KeychainStore();
  assert.deepEqual(await restarted.load(record.clientId), [record]);
  assert.equal(restarted.persistent, true);
  // A later keychain failure must not make a previously saved credential
  // silently reappear after the user removes its session sign-in.
  restarted.persistent = false;
  await restarted.remove(record.clientId, record.id);
  assert.deepEqual(await new KeychainStore().load(record.clientId), []);
});
