/**
 * Esecuzione delle automazioni marketing con il registro invii sul server.
 *
 * Un solo giro alla volta su questo PC (mutex) e su tutto il negozio (lease
 * del server). Server non raggiungibile = nessun invio: la sync verso Google
 * Sheets continua, il marketing aspetta.
 *
 * Giro:
 *  1. conferma gli esiti rimasti in sospeso;
 *  2. apre l'esecuzione sul server;
 *  3. legge l'Excel, chiede lo stato dei clienti, valuta le regole;
 *  4. registra SEMPRE stato clienti ed eventi (anche senza destinatari);
 *  5. prende in carico gli eventi a blocchi e li invia uno per uno, confermando ciascuno.
 */
const { EventEmitter } = require("events");
const { getMarketingConfig, isAutomationRunnable } = require("../marketingConfig");
const { isGmailAddress, createGmailSender } = require("../gmailMarketingSender");
const rules = require("./marketingRules");
const pending = require("./pendingStore");
const { CloudError } = require("./cloudApi");
const { MAX_SENDS_PER_RUN, MAX_SENDS_PER_DAY, LEASE_BATCH, COMMIT_CHUNK } = require("./cloudConstants");

const events = new EventEmitter();

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

function todayKey(now) {
  return rules.localDateKey(now);
}

function dailyCount(store, now) {
  const d = store.get("cloud.dailySends");
  return d && d.date === todayKey(now) ? Number(d.count) || 0 : 0;
}

const DECISIONS_KEY = "cloud.decisionsCache";

/** Descrizione breve di un'email creata, per la decisione "riceve". */
function matchedReason(event) {
  const kind = event.event_key.split(":")[0];
  if (kind === "bday") return "Compleanno di oggi: email creata";
  if (kind === "pts") return `Soglia ${event.meta?.soglia ?? ""} punti superata: email creata`;
  if (kind === "welc") return "Nuovo iscritto (cliente nuovo o tessera assegnata): benvenuto creato";
  if (kind === "fpts") return "Primi punti: email creata";
  if (kind === "inact") return "Cliente inattivo: email creata";
  return "Email creata";
}

function decisionHash(d) {
  return require("crypto").createHash("sha1").update(`${d.category}|${d.code}|${d.reason}|${d.event_key || ""}`).digest("base64").slice(0, 16);
}

function addDaily(store, now, n) {
  store.set("cloud.dailySends", { date: todayKey(now), count: dailyCount(store, now) + n });
}

/**
 * @param {object} deps
 * @param {object} deps.store         electron-store
 * @param {object} deps.client        createClient(store)
 * @param {Function} deps.getAppConfig  config sync (profili Excel)
 * @param {Function} deps.gate        () => { ok, reason }
 * @param {object} deps.engine        { loadCustomersForMarketingProfile, buildBackendBusinessProfile, buildRecipientVariables }
 * @param {Function} [deps.createSender]  per i test
 * @param {Function} [deps.now]
 * @param {Function} [deps.log]
 */
function createRunner(deps) {
  const now = deps.now || (() => new Date());
  const log = deps.log || (() => {});
  let running = null;
  let rerunRequested = null;

  async function flushPending() {
    const results = pending.pendingResults(deps.store);
    if (!results.length) return;
    for (const batch of chunk(results, 100)) {
      await deps.client.confirm(batch);
      pending.remove(deps.store, batch.map((r) => r.event_id));
    }
    log(`[Marketing] Confermati ${results.length} esiti rimasti in sospeso.`);
  }

  /** Manda al server solo le decisioni cambiate dall'ultimo giro (cache locale per negozio). */
  async function uploadDecisions(run, shopId, decisions, summary) {
    if (!deps.client.decisions || !decisions.length) return;
    // Una decisione per cliente e campagna: più soglie superate insieme diventano una riga sola.
    const merged = new Map();
    decisions.forEach((d) => {
      const k = `${d.automation_id}:${d.customer_key}`;
      const prev = merged.get(k);
      if (prev && prev.category === "MATCHED" && d.category === "MATCHED") {
        merged.set(k, { ...prev, reason: `${prev.reason}; ${d.reason}`.slice(0, 300) });
      } else if (!prev || d.category === "MATCHED") {
        merged.set(k, d);
      }
    });
    let cache = deps.store.get(DECISIONS_KEY);
    if (!cache || cache.shopId !== shopId) cache = { shopId, entries: {} };
    const changed = [...merged.values()].filter((d) => cache.entries[`${d.automation_id}:${d.customer_key}`] !== decisionHash(d));
    try {
      for (const part of chunk(changed, 2000)) {
        await deps.client.decisions(run.id, part);
        part.forEach((d) => {
          cache.entries[`${d.automation_id}:${d.customer_key}`] = decisionHash(d);
        });
        deps.store.set(DECISIONS_KEY, cache);
      }
      summary.decisions = changed.length;
    } catch (err) {
      // La tracciabilità non deve mai fermare gli invii: si riprova al prossimo giro.
      summary.decisionsError = err.message;
      log(`[Marketing] Motivi dei destinatari non salvati (riprovo al prossimo giro): ${err.message}`);
    }
  }

  /** Il giro si ferma prima di inviare: il motivo va sulle email in coda. */
  async function markBlocked(reason, automationIds) {
    if (!deps.client.blocked) return;
    try {
      await deps.client.blocked({ reason: reason.slice(0, 300), automation_ids: automationIds });
    } catch {
      /* se il server non risponde il motivo resta nel riepilogo del giro */
    }
  }

  function selectAutomations(marketing, { syncProfileId, automationIds }) {
    let list = (marketing.automations || []).filter(isAutomationRunnable);
    if (automationIds && automationIds.length) {
      const wanted = new Set(automationIds);
      list = list.filter((a) => wanted.has(a.id));
    }
    if (syncProfileId) {
      const linked = new Set((marketing.marketingProfiles || []).filter((p) => p.syncProfileId === syncProfileId).map((p) => p.id));
      list = list.filter((a) => linked.has(a.marketingProfileId));
    }
    return list;
  }

  /** Valuta e registra le automazioni di un profilo clienti. Ritorna i clienti per chiave (per l'invio). */
  async function evaluateProfile({ run, shopId, marketing, profileId, automations, summary }) {
    const appConfig = deps.getAppConfig();
    const { customers: rows } = await deps.engine.loadCustomersForMarketingProfile(deps.store, appConfig, profileId);

    const byKey = new Map();
    rows.forEach((c) => {
      const email = rules.normalizeEmail(c.email);
      if (!email) return;
      const key = rules.customerKey(shopId, email);
      if (!byKey.has(key)) byKey.set(key, c);
    });
    const keys = [...byKey.keys()];
    const cardKeys = [...new Set(keys.map((k) => rules.cardKey(shopId, byKey.get(k).fidelityCardNumber)).filter(Boolean))];

    const states = new Map();
    const cardOwner = new Map();
    let knownCount = 0;
    const keyParts = chunk(keys, 4000);
    const cardParts = chunk(cardKeys, 4000);
    for (let i = 0; i < Math.max(keyParts.length, cardParts.length, 1); i++) {
      const res = await deps.client.customerState(keyParts[i] || [], cardParts[i] || []);
      knownCount = res.known_count;
      res.customers.forEach((s) => states.set(s.customer_key, s));
      (res.by_card || []).forEach((b) => cardOwner.set(b.card_key, b.customer_key));
    }
    if (knownCount === 0) {
      throw new CloudError("invalid", "Il server non conosce ancora i clienti di questo negozio: completa la migrazione.");
    }

    const cooldownAutos = automations.filter((a) => a.type === "inactive_customer" || a.type === "custom").map((a) => a.id);
    const lastSent = new Map();
    if (cooldownAutos.length) {
      for (const part of chunk(keys, 4000)) {
        const res = await deps.client.lookup({ automation_ids: cooldownAutos, customer_keys: part });
        res.last_sent.forEach((r) => lastSent.set(`${r.automation_id}:${r.customer_key}`, r.sent_at));
      }
    }

    const t = now();
    const commitCustomers = [];
    const candidates = [];
    const decisions = [];
    let newCustomers = 0;

    keys.forEach((key) => {
      const customer = byKey.get(key);
      const state = states.get(key) || null;
      const ck = rules.cardKey(shopId, customer.fidelityCardNumber);
      const owner = ck ? cardOwner.get(ck) : null;
      const cardMatch = Boolean(!state && owner && owner !== key);
      if (!state && !cardMatch) newCustomers++;
      const next = rules.nextCustomerState(customer, state, automations);
      commitCustomers.push({
        customer_key: key,
        card_key: ck,
        points: next.points,
        expected_last_observed_at: state ? state.last_observed_at : null,
        points_rearm: next.points_rearm,
      });
      automations.forEach((automation) => {
        const r = rules.evaluateCustomer({
          customer,
          automation,
          marketing,
          shopId,
          state,
          cardMatch,
          nextState: next,
          lastSentAt: lastSent.get(`${automation.id}:${key}`) || null,
          now: t,
        });
        if (!r.match) {
          decisions.push({ automation_id: automation.id, customer_key: key, category: r.category || "EXCLUDED", code: r.code || "excluded", reason: String(r.reason || "Non idoneo").slice(0, 300), event_key: null });
        }
        r.events.forEach((e) =>
          candidates.push({
            ...e,
            automation_id: automation.id,
            automation_type: automation.type,
            customer_key: key,
            email: rules.normalizeEmail(customer.email),
            recipient_name: customer.fullName || customer.firstName || null,
          }),
        );
      });
    });

    const guarded = rules.applyGuards({ candidates, knownCount, newCustomerCount: newCustomers, totalCustomers: keys.length });
    if (guarded.reasons.length) {
      summary.held.push(...guarded.reasons);
      log(`[Marketing] Invii trattenuti per verifica: ${guarded.reasons.join("; ")}.`);
    }

    guarded.events.forEach((e) => {
      decisions.push({
        automation_id: e.automation_id,
        customer_key: e.customer_key,
        category: "MATCHED",
        code: e.status === "HELD" ? "held" : "event_created",
        reason: (e.status === "HELD" ? `${matchedReason(e)} — ${e.hold_reason}` : matchedReason(e)).slice(0, 300),
        event_key: e.event_key,
      });
    });

    const eventsByCustomer = new Map();
    guarded.events.forEach((e) => {
      if (!eventsByCustomer.has(e.customer_key)) eventsByCustomer.set(e.customer_key, []);
      eventsByCustomer.get(e.customer_key).push(e);
    });

    for (const part of chunk(commitCustomers, COMMIT_CHUNK)) {
      const partEvents = part.flatMap((c) => eventsByCustomer.get(c.customer_key) || []);
      const res = await deps.client.commit(run.id, part, partEvents);
      summary.customers += part.length;
      summary.queued += res.events_created;
      summary.conflicts += res.conflicts.length;
    }
    await uploadDecisions(run, shopId, decisions, summary);
    return byKey;
  }

  async function sendLoop({ run, marketing, automations, customersByKey, summary }) {
    const businessProfile = deps.engine.buildBackendBusinessProfile(marketing);
    const useGmail = isGmailAddress(marketing.senderEmail);
    const sender = useGmail ? (deps.createSender || createGmailSender)(businessProfile) : null;
    const automationById = new Map(automations.map((a) => [a.id, a]));
    const autoIds = automations.map((a) => a.id);

    if (sender) {
      try {
        await sender.preflight();
      } catch (err) {
        summary.stoppedBy = err.message;
        log(`[Marketing] Invii sospesi: ${err.message}`);
        await markBlocked(`Gmail non disponibile su ${deps.deviceName ? deps.deviceName() : "questo PC"}: ${err.message}`, autoIds);
        return;
      }
    }

    const t = now();
    let budget = Math.min(MAX_SENDS_PER_RUN, MAX_SENDS_PER_DAY - dailyCount(deps.store, t));
    if (budget <= 0) {
      summary.stoppedBy = "Tetto giornaliero di invii raggiunto: si riprende domani.";
      await markBlocked(`Tetto giornaliero di ${MAX_SENDS_PER_DAY} email Gmail raggiunto: si riprende domani`, autoIds);
      return;
    }

    while (budget > 0) {
      const { events: leased } = await deps.client.lease(run.id, Math.min(LEASE_BATCH, budget), autoIds);
      if (!leased.length) break;

      for (let i = 0; i < leased.length; i++) {
        const event = leased[i];
        const automation = automationById.get(event.automation_id);
        const template = automation && (marketing.templates || []).find((tp) => tp.id === automation.templateId);
        const customer = customersByKey.get(event.customer_key);

        if (!automation || !template || !customer) {
          await deps.client.confirm([{
            event_id: event.id,
            claim_token: event.claim_token,
            outcome: !customer ? "CANCELLED" : "FAILED",
            error: !automation ? "Automazione non più attiva" : !template ? "Template mancante" : "Cliente non più presente nel file",
          }]);
          summary.cancelled++;
          continue;
        }

        const variables = deps.engine.buildRecipientVariables(customer, marketing, {
          reward: event.meta?.premio,
          threshold: event.meta?.soglia,
        });

        if (!sender) {
          const res = await deps.client.deliver({
            event_id: event.id,
            claim_token: event.claim_token,
            business_profile: businessProfile,
            template: { subject: template.subject, previewText: template.previewText, blocks: template.blocks || [] },
            customer: {
              firstName: customer.firstName || "",
              lastName: customer.lastName || "",
              points: customer.points ?? undefined,
              fidelityCardNumber: customer.fidelityCardNumber || "",
              birthDateRaw: customer.birthDateRaw || "",
            },
            variables: { premio: event.meta?.premio, soglia: event.meta?.soglia },
          });
          if (res.outcome === "SENT") summary.sent++;
          else summary.failed++;
        } else {
          pending.mark(deps.store, event);
          const result = await sender.sendOne(template, {
            email: event.email,
            firstName: customer.firstName || "",
            lastName: customer.lastName || "",
            variables: { ...variables, premio: event.meta?.premio, soglia: event.meta?.soglia },
          });
          const outcome = {
            outcome: result.outcome,
            error: result.error || null,
            provider: "gmail",
            sent_at: result.outcome === "SENT" ? new Date().toISOString() : null,
          };
          pending.setOutcome(deps.store, event.id, outcome);
          if (result.outcome === "SENT") {
            summary.sent++;
            addDaily(deps.store, now(), 1);
          } else summary.failed++;

          await deps.client.confirm([{ event_id: event.id, claim_token: event.claim_token, ...outcome }]);
          pending.remove(deps.store, [event.id]);

          if (result.kind === "auth") {
            const rest = leased.slice(i + 1).map((e) => ({ event_id: e.id, claim_token: e.claim_token, outcome: "RELEASED" }));
            if (rest.length) await deps.client.confirm(rest);
            summary.stoppedBy = "Collegamento Google scaduto: ricollega Google per riprendere gli invii.";
            log(`[Marketing] ${summary.stoppedBy}`);
            await markBlocked("Collegamento Google scaduto sul PC del negozio: ricollega Google", autoIds);
            return;
          }
        }
        budget--;
      }
      await deps.client.heartbeat(run.id);
    }
    if (budget <= 0) {
      summary.stoppedBy = summary.stoppedBy || "Tetto di invii raggiunto: il resto parte al prossimo giro.";
      await markBlocked(`Massimo ${MAX_SENDS_PER_RUN} email per giro: le altre partono al prossimo giro`, autoIds);
    }
  }

  async function runOnce(options) {
    const summary = { trigger: options.trigger, customers: 0, queued: 0, conflicts: 0, sent: 0, failed: 0, cancelled: 0, held: [], stoppedBy: null };
    const gate = deps.gate();
    if (!gate.ok) return { ok: true, skipped: true, reason: gate.reason };

    const marketing = getMarketingConfig(deps.store);
    if (!marketing.enabled) return { ok: true, skipped: true, reason: "marketing_disabled" };
    if (!marketing.realSendEnabled) return { ok: true, skipped: true, reason: "real_send_disabled" };
    if (options.trigger !== "manual" && options.syncProfileId && marketing.runMarketingAfterSync === false) {
      return { ok: true, skipped: true, reason: "run_after_sync_disabled" };
    }
    const selected = selectAutomations(marketing, options);
    if (!selected.length) return { ok: true, skipped: true, reason: "no_automations" };
    // Un PC senza il file clienti (es. il PC da cui si gestiscono le campagne da
    // remoto) non invia: lo fanno i PC del negozio che hanno l'Excel.
    const automations = deps.hasCustomerFile ? selected.filter((a) => deps.hasCustomerFile(marketing, a)) : selected;
    if (!automations.length) return { ok: true, skipped: true, reason: "management_only" };

    await flushPending();

    const session = deps.shopId();
    const { run } = await deps.client.startRun(options.trigger || "auto");
    let status = "DONE";
    try {
      const byProfile = new Map();
      automations.forEach((a) => {
        if (!byProfile.has(a.marketingProfileId)) byProfile.set(a.marketingProfileId, []);
        byProfile.get(a.marketingProfileId).push(a);
      });

      const customersByKey = new Map();
      for (const [profileId, list] of byProfile) {
        const map = await evaluateProfile({ run, shopId: session, marketing, profileId, automations: list, summary });
        map.forEach((v, k) => customersByKey.set(k, v));
      }
      await sendLoop({ run, marketing, automations, customersByKey, summary });
      return { ok: true, summary };
    } catch (err) {
      status = "ABORTED";
      summary.stoppedBy = err.message;
      throw err;
    } finally {
      await deps.client.finishRun(run.id, status, summary).catch(() => {});
      log(
        `[Marketing] Giro ${status === "DONE" ? "completato" : "interrotto"}: ${summary.sent} inviate, ${summary.failed} non riuscite, ${summary.queued} nuove in coda` +
          (summary.stoppedBy ? ` — ${summary.stoppedBy}` : ""),
      );
    }
  }

  /**
   * Avvia un giro. Se ne è già in corso uno: da sync/cron si accoda una
   * ripetizione (una sola), da un clic manuale si risponde "già in corso".
   */
  async function runMarketing(options = {}) {
    if (running) {
      if (options.trigger === "manual") return { ok: false, busy: true, message: "Invio già in corso." };
      rerunRequested = { ...options, syncProfileId: undefined, automationIds: undefined };
      return running;
    }
    running = (async () => {
      try {
        return await runOnce(options);
      } catch (err) {
        const kind = err instanceof CloudError ? err.kind : "error";
        if (kind === "busy") {
          log(`[Marketing] ${err.message} Questo PC salta il giro.`);
          return { ok: true, skipped: true, reason: "busy_other_device", message: err.message };
        }
        if (!(err instanceof CloudError)) log(`[Marketing] Errore: ${err.message}`);
        else log(`[Marketing] Invii non eseguiti: ${err.message}`);
        return { ok: false, kind, message: err.message };
      } finally {
        running = null;
        events.emit("run-finished");
      }
    })();
    const result = await running;
    if (rerunRequested) {
      const next = rerunRequested;
      rerunRequested = null;
      setImmediate(() => runMarketing(next));
    }
    return result;
  }

  return { runMarketing, isRunning: () => Boolean(running) };
}

module.exports = { createRunner, events };
