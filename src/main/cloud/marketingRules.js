/**
 * Regole delle automazioni marketing, senza effetti collaterali.
 *
 * Chi riceve cosa si decide qui, a partire da:
 * - il cliente letto dall'Excel (`mapRowToCustomer` di marketingEngine);
 * - lo stato che il server conosce per quel cliente (prima volta visto, punti
 *   dell'ultima osservazione, riarmo delle soglie);
 * - l'orologio (`now`), sempre passato da fuori: così i test sono deterministici.
 *
 * Ogni invio ha una chiave evento: il server la accetta una volta sola, quindi
 * la chiave È la regola "non inviare due volte". Niente storico locale.
 */
const crypto = require("crypto");

const DAY_MS = 86400000;
const WELCOME_ACTIVATION_WINDOW_DAYS = 30;

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

/** Identità del cliente sul server: hash legato al negozio, niente email in chiaro. */
function customerKey(shopId, email) {
  return sha256(`${shopId}:email:${normalizeEmail(email)}`);
}

function cardKey(shopId, cardNumber) {
  const card = String(cardNumber || "").trim().toUpperCase().replace(/\s+/g, "");
  return card ? sha256(`${shopId}:card:${card}`) : null;
}

/** L'id automazione entra nella chiave: se ha caratteri strani si usa un suo hash. */
function safeAutomationId(id) {
  const s = String(id || "");
  return /^[A-Za-z0-9_-]{1,80}$/.test(s) ? s : `h${sha256(s).slice(0, 32)}`;
}

function formatThreshold(t) {
  const n = Number(t);
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** Data locale del PC (il negozio), non UTC: il compleanno è "oggi" per il negozio. */
function localDateKey(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function startOfNextLocalDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
}

function isLeapYear(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/**
 * Compleanno oggi: conta giorno e mese, mai l'anno di nascita.
 * Chi è nato il 29 febbraio lo festeggia il 28 negli anni non bisestili.
 */
function isBirthdayToday(birthDate, now) {
  if (!(birthDate instanceof Date) || Number.isNaN(birthDate.getTime())) return false;
  const month = birthDate.getMonth();
  let day = birthDate.getDate();
  if (month === 1 && day === 29 && !isLeapYear(now.getFullYear())) day = 28;
  return now.getMonth() === month && now.getDate() === day;
}

function toDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

function hasMarketingConsent(customer, marketing, automation) {
  const requireConsent =
    automation?.conditions?.requireMarketingConsent !== undefined
      ? automation.conditions.requireMarketingConsent
      : marketing?.requireMarketingConsent;
  if (!requireConsent) return true;
  const val = String(customer.marketingConsent || "").trim().toLowerCase();
  if (!val) return false;
  return (marketing?.validConsentValues || []).map((v) => String(v).trim().toLowerCase()).includes(val);
}

function getThresholds(automation) {
  const c = automation?.conditions || {};
  const list = Array.isArray(c.pointsThresholds) && c.pointsThresholds.length
    ? c.pointsThresholds
    : Number(c.pointsThreshold) > 0
      ? [Number(c.pointsThreshold)]
      : [];
  return [...new Set(list.map(Number).filter((t) => Number.isFinite(t) && t > 0))].sort((a, b) => a - b);
}

/** Tutte le soglie di tutte le automazioni punti attive: il riarmo è per cliente e soglia. */
function collectThresholds(automations) {
  const all = new Set();
  (automations || []).forEach((a) => {
    if (a && a.type === "points_threshold") getThresholds(a).forEach((t) => all.add(t));
  });
  return [...all].sort((a, b) => a - b);
}

function numberOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Punti "prima" per un'automazione, o null se non si può sapere (solo baseline).
 * - cliente mai visto: parte da 0 (0 → 60 invia le soglie superate);
 * - osservato dopo l'attivazione dell'automazione: i punti di quell'osservazione;
 * - osservato solo prima dell'attivazione: nessun invio, si registra la baseline.
 */
function previousPoints(state, automation) {
  if (!state) return 0;
  const activatedAt = toDate(automation?.activatedAt);
  const observedAt = toDate(state.last_observed_at);
  if (!activatedAt || !observedAt || observedAt < activatedAt) return null;
  return numberOrNull(state.last_points);
}

/**
 * Nuovo stato del cliente da salvare sul server (una volta per cliente, per
 * tutte le automazioni). Il riarmo di una soglia sale quando i punti scendono
 * sotto di essa: la prossima risalita è un evento nuovo.
 */
function nextCustomerState(customer, state, automations) {
  const curr = numberOrNull(customer.points);
  const prev = state ? numberOrNull(state.last_points) : null;
  const rearm = { ...(state?.points_rearm || {}) };
  if (curr !== null && prev !== null) {
    collectThresholds(automations).forEach((t) => {
      const key = formatThreshold(t);
      if (prev >= t && curr < t) rearm[key] = (Number(rearm[key]) || 0) + 1;
    });
  }
  return { points: curr, points_rearm: rearm };
}

function isRealNewCustomer(state, cardMatch, automation) {
  if (cardMatch) return false;
  const activatedAt = toDate(automation?.activatedAt);
  if (!activatedAt) return false;
  if (!state) return true;
  const firstSeen = toDate(state.first_seen_at);
  return Boolean(firstSeen && firstSeen > activatedAt);
}

/**
 * Valuta un cliente per un'automazione.
 *
 * @param {object} p
 * @param {object} p.customer      cliente da mapRowToCustomer
 * @param {object} p.automation    automazione normalizzata (con activatedAt)
 * @param {object} p.marketing     config marketing (consensi)
 * @param {string} p.shopId
 * @param {object|null} p.state    stato server del cliente, null se mai visto
 * @param {boolean} p.cardMatch    la tessera appartiene già a un altro cliente noto (cambio email)
 * @param {object} p.nextState     risultato di nextCustomerState (riarmo aggiornato)
 * @param {Date|null} p.lastSentAt ultimo invio riuscito di questa automazione a questo cliente
 * @param {Date} p.now
 * @returns {{ match: boolean, reason?: string, events: Array<{event_key:string, expires_at:string|null, meta:object}> }}
 */
function evaluateCustomer(p) {
  const { customer, automation, marketing, shopId, state, cardMatch, nextState, lastSentAt, now } = p;
  const no = (reason) => ({ match: false, reason, events: [] });
  const email = normalizeEmail(customer.email);
  if (!email) return no("Email mancante");
  if (!isValidEmail(email)) return no("Email non valida");
  if (!hasMarketingConsent(customer, marketing, automation)) return no("Consenso marketing assente o non valido");
  if (!toDate(automation.activatedAt)) return no("Automazione da riattivare");

  const auto = safeAutomationId(automation.id);
  const cust = customerKey(shopId, email);
  const c = automation.conditions || {};
  const inDays = (days) => new Date(now.getTime() + days * DAY_MS).toISOString();
  const cooldownDays = Math.max(0, Number(c.cooldownDays ?? 30) || 0);
  const inCooldown = () => lastSentAt && now.getTime() - toDate(lastSentAt).getTime() < cooldownDays * DAY_MS;

  switch (automation.type) {
    case "birthday": {
      if (c.birthdayEnabled === false) return no("Trigger compleanno disattivato");
      if (!customer.birthDate) return no("Data di nascita mancante");
      if (!isBirthdayToday(customer.birthDate, now)) return no("Compleanno non è oggi");
      return {
        match: true,
        events: [{
          event_key: `bday:${auto}:${cust}:${now.getFullYear()}`,
          expires_at: startOfNextLocalDay(now).toISOString(),
          meta: {},
        }],
      };
    }

    case "points_threshold": {
      if (c.pointsTriggerEnabled === false) return no("Trigger punti disattivato");
      const thresholds = getThresholds(automation);
      if (!thresholds.length) return no("Nessuna soglia punti impostata");
      const curr = numberOrNull(customer.points);
      if (curr === null) return no("Punti non disponibili");
      const prev = previousPoints(state, automation);
      if (prev === null) return no("Punti registrati: invio al prossimo superamento soglia");
      const crossed = thresholds.filter((t) => prev < t && curr >= t);
      if (!crossed.length) return no(`Nessuna soglia superata (${prev} → ${curr})`);
      const chosen = c.multiCrossMode === "each" ? crossed : [Math.max(...crossed)];
      const rewards = c.pointsThresholdRewards || {};
      return {
        match: true,
        events: chosen.map((t) => {
          const key = formatThreshold(t);
          const gen = Number(nextState?.points_rearm?.[key]) || 0;
          const reward = String(rewards[key] || rewards[String(t)] || "").trim();
          return {
            event_key: `pts:${auto}:${cust}:${key}:g${gen}`,
            expires_at: inDays(14),
            meta: { soglia: key, points: curr, ...(reward ? { premio: reward } : {}) },
          };
        }),
      };
    }

    case "new_fidelity": {
      const mode = c.fidelityMode || "new_fidelity";
      if (mode === "first_points") {
        const curr = numberOrNull(customer.points);
        if (curr === null || curr <= 0) return no("Nessun punto fidelity");
        const prev = previousPoints(state, automation);
        if (prev === null) return no("Cliente già presente prima dell'attivazione");
        if (prev > 0) return no("Aveva già punti");
        return {
          match: true,
          events: [{ event_key: `fpts:${auto}:${cust}`, expires_at: inDays(14), meta: { fidelityMode: mode } }],
        };
      }
      if (mode === "new_fidelity" && !customer.fidelityCardNumber && !customer.fidelityActivatedAt) {
        return no("Nessun dato fidelity");
      }
      const activatedAt = toDate(automation.activatedAt);
      const cardActivated = toDate(customer.fidelityActivatedAt);
      const recentActivation =
        mode === "new_fidelity" &&
        cardActivated &&
        cardActivated >= new Date(activatedAt.getFullYear(), activatedAt.getMonth(), activatedAt.getDate()) &&
        now.getTime() - cardActivated.getTime() <= WELCOME_ACTIVATION_WINDOW_DAYS * DAY_MS;
      if (!isRealNewCustomer(state, cardMatch, automation) && !recentActivation) {
        return no(cardMatch ? "Stessa tessera di un cliente già noto" : "Cliente già presente prima dell'attivazione");
      }
      return {
        match: true,
        events: [{ event_key: `welc:${auto}:${cust}`, expires_at: inDays(14), meta: { fidelityMode: mode } }],
      };
    }

    case "inactive_customer": {
      const inactiveDays = Number(c.inactiveDays) || 90;
      const last = toDate(customer.lastPurchaseDate);
      if (!last) return no("Data ultimo acquisto mancante");
      if (Math.floor((now.getTime() - last.getTime()) / DAY_MS) < inactiveDays) {
        return no(`Attivo negli ultimi ${inactiveDays} giorni`);
      }
      if (inCooldown()) return no(`In cooldown (${cooldownDays} giorni)`);
      return {
        match: true,
        events: [{ event_key: `inact:${auto}:${cust}:${localDateKey(last)}`, expires_at: inDays(7), meta: { inactiveDays } }],
      };
    }

    case "custom":
    default: {
      if (inCooldown()) return no(`In cooldown (${cooldownDays} giorni)`);
      return {
        match: true,
        events: [{ event_key: `cust:${auto}:${cust}:${localDateKey(now)}`, expires_at: startOfNextLocalDay(now).toISOString(), meta: {} }],
      };
    }
  }
}

/**
 * Guardie contro gli invii di massa: gli eventi non partono, restano "trattenuti"
 * finché lo staff non li approva.
 * - troppi clienti mai visti in un colpo (colonna email cambiata, file sbagliato):
 *   benvenuti e primi punti trattenuti;
 * - un'automazione (tranne i compleanni) con troppi destinatari insieme.
 */
function applyGuards({ candidates, knownCount, newCustomerCount, totalCustomers }) {
  const suspiciousNew = newCustomerCount > Math.max(20, Math.ceil(knownCount * 0.1));
  const perAutomation = new Map();
  candidates.forEach((e) => perAutomation.set(e.automation_id, (perAutomation.get(e.automation_id) || 0) + 1));
  const heldAutomations = new Set();
  perAutomation.forEach((count, id) => {
    const sample = candidates.find((e) => e.automation_id === id);
    if (sample.automation_type === "birthday") return;
    if (count > 100 || (totalCustomers > 0 && count > Math.max(10, totalCustomers * 0.2))) heldAutomations.add(id);
  });
  const reasons = [];
  if (suspiciousNew) reasons.push(`${newCustomerCount} clienti nuovi in una volta`);
  heldAutomations.forEach((id) => reasons.push(`${perAutomation.get(id)} destinatari per ${id}`));

  return {
    events: candidates.map((e) => {
      const isWelcome = e.event_key.startsWith("welc:") || e.event_key.startsWith("fpts:");
      const held = (suspiciousNew && isWelcome) || heldAutomations.has(e.automation_id);
      return { ...e, status: held ? "HELD" : "QUEUED" };
    }),
    reasons,
  };
}

module.exports = {
  sha256,
  normalizeEmail,
  customerKey,
  cardKey,
  safeAutomationId,
  formatThreshold,
  isBirthdayToday,
  getThresholds,
  collectThresholds,
  previousPoints,
  nextCustomerState,
  evaluateCustomer,
  applyGuards,
  localDateKey,
};
