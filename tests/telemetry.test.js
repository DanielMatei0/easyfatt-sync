const test = require("node:test");
const assert = require("node:assert/strict");
const { createTelemetry } = require("../src/main/cloud/telemetry");
const { createMemoryStore } = require("./helpers/fakeCloud");

function setup({ focused = true, idle = 0, connected = true } = {}) {
  const store = createMemoryStore();
  let clock = new Date(2026, 8, 16, 10, 0, 0).getTime();
  const sent = [];
  const state = { focused, idle, connected, fail: false, configVersion: 1 };
  const pulled = [];
  const t = createTelemetry({
    store,
    client: {
      telemetry: async (body) => {
        if (state.fail) throw new Error("offline");
        sent.push(JSON.parse(JSON.stringify(body)));
        return { ok: true, config_version: state.configVersion };
      },
    },
    isConnected: () => state.connected,
    isWindowFocused: () => state.focused,
    getIdleSeconds: () => state.idle,
    onServerConfigVersion: (v) => pulled.push(v),
    now: () => new Date(clock),
  });
  return { t, store, sent, state, pulled, advance: (s) => (clock += s * 1000) };
}

test("tempo aperto e in uso: l'inattività e la finestra in secondo piano non contano come uso", async () => {
  const s = setup();
  s.advance(60); s.t.accumulate();
  s.state.idle = 600; s.advance(60); s.t.accumulate();
  s.state.idle = 0; s.state.focused = false; s.advance(60); s.t.accumulate();
  await s.t.flush();
  assert.deepEqual(s.sent[0].activity, [{ day: "2026-09-16", open_seconds: 180, focused_seconds: 60 }]);
});

test("PC sospeso: il salto di orologio non viene contato", () => {
  const s = setup();
  s.advance(3 * 3600); s.t.accumulate();
  assert.deepEqual(s.store.get("cloud.telemetryQueue")?.activity || {}, {});
});

test("offline: sincronizzazioni e tempo restano in coda e partono dopo, una volta", async () => {
  const s = setup();
  s.t.recordSync({ profileId: "sp1", profileName: "Clienti", trigger: "watch", status: "SUCCESS", rows: 120, durationMs: 900, startedAt: Date.now() });
  s.advance(60); s.t.accumulate();
  s.state.fail = true;
  await s.t.flush();
  s.state.fail = false;
  await s.t.flush();
  await s.t.flush();
  const syncs = s.sent.flatMap((b) => b.syncs);
  assert.equal(syncs.length, 1);
  assert.equal(syncs[0].rows, 120);
  assert.equal(s.sent.reduce((n, b) => n + b.activity.reduce((m, a) => m + a.open_seconds, 0), 0), 60);
});

test("senza account collegato non si registra nulla", async () => {
  const s = setup({ connected: false });
  s.t.recordSync({ trigger: "manual", status: "SUCCESS" });
  s.advance(60); s.t.accumulate();
  await s.t.flush();
  assert.equal(s.sent.length, 0);
});

test("il battito riporta la versione della config del server (per scaricare le modifiche remote)", async () => {
  const s = setup();
  s.state.configVersion = 7;
  await s.t.flush();
  assert.deepEqual(s.pulled, [7]);
});
