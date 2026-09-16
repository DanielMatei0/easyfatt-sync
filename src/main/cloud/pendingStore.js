/**
 * Diario locale degli invii in corso. Si scrive PRIMA di inviare e subito DOPO:
 * se l'app si chiude a metà, al giro dopo si sa cosa confermare.
 * - marker senza esito → UNCERTAIN (la mail potrebbe essere partita: niente reinvio automatico);
 * - marker con esito   → si conferma quell'esito.
 */
const KEY = "cloud.pendingSends";

function all(store) {
  const v = store.get(KEY);
  return v && typeof v === "object" ? v : {};
}

function mark(store, event) {
  store.set(KEY, { ...all(store), [event.id]: { event_id: event.id, claim_token: event.claim_token, startedAt: new Date().toISOString() } });
}

function setOutcome(store, eventId, outcome) {
  const current = all(store);
  if (!current[eventId]) return;
  store.set(KEY, { ...current, [eventId]: { ...current[eventId], ...outcome } });
}

function remove(store, eventIds) {
  const current = all(store);
  eventIds.forEach((id) => delete current[id]);
  store.set(KEY, current);
}

/** Esiti da mandare al server per ciò che è rimasto in sospeso. */
function pendingResults(store) {
  return Object.values(all(store)).map((p) =>
    p.outcome
      ? { event_id: p.event_id, claim_token: p.claim_token, outcome: p.outcome, error: p.error || null, provider: p.provider || null, sent_at: p.sent_at || null }
      : { event_id: p.event_id, claim_token: p.claim_token, outcome: "UNCERTAIN", error: "App chiusa durante l'invio" },
  );
}

function count(store) {
  return Object.keys(all(store)).length;
}

module.exports = { mark, setOutcome, remove, pendingResults, count };
