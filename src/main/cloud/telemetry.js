/**
 * Battito dell'app verso il server (solo con account collegato):
 * - "attivo adesso" per il pannello staff;
 * - tempo di utilizzo per giorno: app aperta, e finestra in primo piano con
 *   l'utente non inattivo da più di 5 minuti;
 * - sincronizzazioni eseguite (esito, righe, durata), in coda se offline.
 * Nessun dato dei clienti del negozio.
 */
const crypto = require("crypto");
const { localDateKey } = require("./marketingRules");

const TICK_MS = 60 * 1000;
const IDLE_LIMIT_SECONDS = 5 * 60;
const QUEUE_KEY = "cloud.telemetryQueue";
const MAX_QUEUED_SYNCS = 1000;

function createTelemetry({ store, client, isConnected, isWindowFocused, getIdleSeconds, onServerConfigVersion, now = () => new Date() }) {
  let timer = null;
  let lastTick = now().getTime();
  let flushing = false;

  function queue() {
    const q = store.get(QUEUE_KEY);
    return q && typeof q === "object" ? { activity: q.activity || {}, syncs: Array.isArray(q.syncs) ? q.syncs : [] } : { activity: {}, syncs: [] };
  }

  function saveQueue(q) {
    store.set(QUEUE_KEY, { activity: q.activity, syncs: q.syncs.slice(-MAX_QUEUED_SYNCS) });
  }

  function accumulate() {
    const t = now();
    const elapsed = Math.round((t.getTime() - lastTick) / 1000);
    lastTick = t.getTime();
    // Sospensione del PC o orologio spostato: non si conta tempo che non c'è stato.
    if (elapsed <= 0 || elapsed > 5 * 60) return;
    if (!isConnected()) return;
    const q = queue();
    const day = localDateKey(t);
    const a = q.activity[day] || { open_seconds: 0, focused_seconds: 0 };
    a.open_seconds += elapsed;
    let idle = 0;
    try {
      idle = Number(getIdleSeconds()) || 0;
    } catch {
      idle = 0;
    }
    if (isWindowFocused() && idle < IDLE_LIMIT_SECONDS) a.focused_seconds += elapsed;
    q.activity[day] = a;
    saveQueue(q);
  }

  async function flush() {
    if (flushing || !isConnected()) return;
    flushing = true;
    try {
      const q = queue();
      const activity = Object.entries(q.activity)
        .slice(-31)
        .map(([day, v]) => ({ day, open_seconds: Math.min(86_400, v.open_seconds), focused_seconds: Math.min(86_400, v.focused_seconds) }));
      const syncs = q.syncs.slice(0, 200);
      const res = await client.telemetry({ activity, syncs });
      // Rimuove solo ciò che è stato inviato: nel frattempo può essere arrivato altro.
      const after = queue();
      activity.forEach(({ day, open_seconds, focused_seconds }) => {
        const cur = after.activity[day];
        if (!cur) return;
        cur.open_seconds -= open_seconds;
        cur.focused_seconds -= focused_seconds;
        if (cur.open_seconds <= 0 && cur.focused_seconds <= 0) delete after.activity[day];
      });
      const sent = new Set(syncs.map((s) => s.id));
      after.syncs = after.syncs.filter((s) => !sent.has(s.id));
      saveQueue(after);
      if (res && typeof res.config_version === "number" && onServerConfigVersion) onServerConfigVersion(res.config_version);
    } catch {
      /* offline o server giù: riprova al prossimo battito */
    } finally {
      flushing = false;
    }
  }

  function recordSync(event) {
    if (!isConnected()) return;
    const q = queue();
    q.syncs.push({
      id: crypto.randomUUID(),
      profile_id: event.profileId ? String(event.profileId).slice(0, 80) : null,
      profile_name: event.profileName ? String(event.profileName).slice(0, 120) : null,
      trigger: String(event.trigger || "manual").slice(0, 32),
      status: event.status,
      rows: Number.isFinite(event.rows) ? event.rows : null,
      duration_ms: Number.isFinite(event.durationMs) ? Math.round(event.durationMs) : null,
      error: event.error ? String(event.error).slice(0, 300) : null,
      started_at: new Date(event.startedAt || Date.now()).toISOString(),
    });
    saveQueue(q);
  }

  function start() {
    if (timer) return;
    lastTick = now().getTime();
    timer = setInterval(() => {
      accumulate();
      flush();
    }, TICK_MS);
    if (timer.unref) timer.unref();
    setTimeout(() => flush(), 5000).unref?.();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { start, stop, flush, recordSync, accumulate };
}

module.exports = { createTelemetry };
