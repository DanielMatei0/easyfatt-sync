/**
 * Server Easyfatt Sync in memoria, con lo stesso contratto delle API reali
 * (AvenSite app/api/easyfatt). Serve a provare il runner senza rete.
 */
const crypto = require("crypto");
const { CloudError } = require("../../src/main/cloud/cloudApi");

function createFakeCloud({ paused = false } = {}) {
  const customers = new Map();
  const sends = new Map(); // event_key → evento
  const runs = new Map();
  let offline = false;
  const shop = { id: "shop-test", version: 0, config: null };
  let migration = null;
  let tick = 0;
  const calls = [];
  const decisions = new Map();
  const decisionCalls = [];

  const guard = (name) => {
    calls.push(name);
    if (offline) throw new CloudError("offline", "offline");
  };

  const client = {
    async startRun(trigger) {
      guard("startRun");
      if (paused) throw new CloudError("paused", "pausa", { status: 423 });
      for (const r of runs.values()) if (r.status === "RUNNING") throw new CloudError("busy", "busy", { status: 409, code: "busy" });
      const run = { id: crypto.randomUUID(), status: "RUNNING", trigger };
      runs.set(run.id, run);
      return { run };
    },
    async heartbeat() {
      guard("heartbeat");
      return {};
    },
    async finishRun(id, status) {
      guard("finishRun");
      const r = runs.get(id);
      if (r) r.status = status;
      return { ok: true };
    },
    async customerState(keys, cardKeys) {
      guard("customerState");
      const list = keys.filter((k) => customers.has(k)).map((k) => ({ customer_key: k, ...customers.get(k) }));
      const byCard = [...customers.entries()].filter(([, c]) => c.card_key && cardKeys.includes(c.card_key)).map(([k, c]) => ({ card_key: c.card_key, customer_key: k }));
      return { known_count: customers.size, customers: list, by_card: byCard };
    },
    async lookup({ automation_ids = [], customer_keys = [] }) {
      guard("lookup");
      const last = [];
      for (const e of sends.values()) {
        if (e.status === "SENT" && automation_ids.includes(e.automation_id) && customer_keys.includes(e.customer_key)) {
          last.push({ automation_id: e.automation_id, customer_key: e.customer_key, sent_at: e.sent_at });
        }
      }
      return { events: [], last_sent: last };
    },
    async commit(runId, commitCustomers, events) {
      guard("commit");
      const now = new Date().toISOString();
      const conflicts = [];
      commitCustomers.forEach((c) => {
        const row = customers.get(c.customer_key);
        const current = row ? row.last_observed_at : null;
        if (current !== c.expected_last_observed_at) return conflicts.push(c.customer_key);
        customers.set(c.customer_key, {
          card_key: c.card_key,
          first_seen_at: row ? row.first_seen_at : now,
          last_points: c.points,
          last_observed_at: new Date(Date.parse(now) + ++tick).toISOString(),
          points_rearm: c.points_rearm,
        });
      });
      let created = 0;
      events.filter((e) => !conflicts.includes(e.customer_key)).forEach((e) => {
        if (sends.has(e.event_key)) return;
        sends.set(e.event_key, { ...e, id: crypto.randomUUID(), attempts: 0, claim_token: null });
        created++;
      });
      return { customers_created: 0, customers_updated: 0, conflicts, events_created: created };
    },
    async lease(runId, limit, automationIds) {
      guard("lease");
      const out = [];
      for (const e of sends.values()) {
        if (out.length >= limit) break;
        if (automationIds && !automationIds.includes(e.automation_id)) continue;
        if (e.status === "QUEUED" || e.status === "FAILED") {
          e.status = "CLAIMED";
          e.blocked_reason = null;
          e.claim_token = crypto.randomBytes(16).toString("base64url");
          e.attempts++;
          out.push({ ...e });
        }
      }
      return { events: out };
    },
    async confirm(results) {
      guard("confirm");
      return {
        results: results.map((r) => {
          const e = [...sends.values()].find((x) => x.id === r.event_id);
          if (!e || e.claim_token !== r.claim_token) return { event_id: r.event_id, applied: false };
          if (r.outcome === "SENT" && (e.status === "CLAIMED" || e.status === "UNCERTAIN")) {
            e.status = "SENT";
            e.sent_at = new Date().toISOString();
          } else if (e.status !== "CLAIMED") return { event_id: r.event_id, applied: false };
          else if (r.outcome === "RELEASED") e.status = "QUEUED";
          else e.status = r.outcome;
          if (e.status !== "UNCERTAIN") e.claim_token = null;
          return { event_id: r.event_id, applied: true, status: e.status };
        }),
      };
    },
    async me() {
      guard("me");
      return { shop: { id: shop.id, name: "Negozio", config_version: shop.version }, migration: null };
    },
    async getConfig() {
      guard("getConfig");
      return { config: shop.config, version: shop.version };
    },
    async putConfig(base, config) {
      guard("putConfig");
      if (base !== shop.version) {
        throw new CloudError("conflict", "conflitto", { status: 409, code: "version_conflict", data: { config: shop.config, version: shop.version } });
      }
      shop.config = config;
      shop.version++;
      return { version: shop.version };
    },
    async migrationStart(id, config) {
      guard("migrationStart");
      if (shop.version >= 1) throw new CloudError("conflict", "già migrato", { status: 409, code: "already_migrated" });
      migration = migration && migration.id === id ? migration : { id, started_at: new Date().toISOString() };
      return { migration_id: id };
    },
    async migrationCustomers(id, list) {
      guard("migrationCustomers");
      list.forEach((c) => {
        if (customers.has(c.customer_key)) return;
        customers.set(c.customer_key, { card_key: c.card_key, first_seen_at: migration.started_at, last_points: c.points, last_observed_at: new Date().toISOString(), points_rearm: {} });
      });
      return { inserted: list.length };
    },
    async migrationLedger(id, events) {
      guard("migrationLedger");
      events.forEach((e) => {
        if (!sends.has(e.event_key)) sends.set(e.event_key, { ...e, id: crypto.randomUUID(), status: "SENT", source: "MIGRATION" });
      });
      return { inserted: events.length };
    },
    async migrationComplete(id, config, expected) {
      guard("migrationComplete");
      if (customers.size < expected.customers) throw new CloudError("conflict", "conteggi", { status: 409, code: "counts_mismatch" });
      shop.config = config;
      shop.version = 1;
      return { version: 1, counts: { customers: customers.size } };
    },
    async decisions(runId, list) {
      guard("decisions");
      decisionCalls.push(list.length);
      list.forEach((d) => decisions.set(`${d.automation_id}:${d.customer_key}`, { ...d, event_key: d.event_key || decisions.get(`${d.automation_id}:${d.customer_key}`)?.event_key || null }));
      return { saved: list.length };
    },
    async blocked({ reason, automation_ids }) {
      guard("blocked");
      let n = 0;
      for (const e of sends.values()) {
        if ((e.status === "QUEUED" || e.status === "FAILED") && (!automation_ids || automation_ids.includes(e.automation_id))) {
          e.blocked_reason = reason;
          n++;
        }
      }
      return { updated: n };
    },
    async deliver() {
      throw new Error("non usato nei test Gmail");
    },
  };

  return {
    client,
    decisions,
    decisionCalls,
    shop,
    customers,
    sends,
    calls,
    setOffline: (v) => (offline = v),
    sent: () => [...sends.values()].filter((e) => e.status === "SENT"),
  };
}

function createMemoryStore(initial = {}) {
  const data = { ...initial };
  return {
    get: (k) => data[k],
    set: (k, v) => {
      data[k] = JSON.parse(JSON.stringify(v));
    },
    delete: (k) => {
      delete data[k];
    },
    data,
  };
}

module.exports = { createFakeCloud, createMemoryStore };
