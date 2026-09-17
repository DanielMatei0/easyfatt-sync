const { readWorkbookWithRetry, sheetToRows } = require("./excelUtils");
const { findProfile } = require("./syncState");
const { getMarketingConfig, createId, normalizeAutomation } = require("./marketingConfig");
const { buildVariableMap, getBusinessProfile } = require("./emailTemplateRenderer");

function excelSerialToDate(num) {
  const excelEpoch = new Date(1899, 11, 30);
  const d = new Date(excelEpoch.getTime() + num * 86400000);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseDate(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  // Cella data di Excel (anche formattata gg/mm): è un numero di giorni.
  // Qualsiasi anno, anche nati prima del 1954 (numeri sotto 20000).
  if (typeof value === "number" && Number.isFinite(value) && value >= 1 && value < 2958466) {
    return excelSerialToDate(Math.floor(value));
  }

  const s = String(value).trim();
  if (!s) return null;

  const iso = new Date(s);
  if (!Number.isNaN(iso.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(s)) return iso;

  const dmy = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/.exec(s);
  if (dmy) {
    let year = Number(dmy[3]);
    if (year < 100) year += 2000;
    const d = new Date(year, Number(dmy[2]) - 1, Number(dmy[1]));
    if (!Number.isNaN(d.getTime())) return d;
  }

  // Compleanno senza anno ("26/06"): conta solo giorno e mese; anno 2000 (bisestile) per tenere il 29/02.
  const dm = /^(\d{1,2})[\/\-.](\d{1,2})$/.exec(s);
  if (dm) {
    const day = Number(dm[1]);
    const month = Number(dm[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const d = new Date(2000, month - 1, day);
      if (d.getMonth() === month - 1) return d;
    }
    return null;
  }

  const num = Number(s);
  if (!Number.isNaN(num) && num > 20000 && num < 60000) {
    return excelSerialToDate(num);
  }

  const fallback = new Date(s);
  if (Number.isNaN(fallback.getTime())) return null;
  const year = fallback.getFullYear();
  return year >= 1900 && year <= 2100 ? fallback : null;
}

function parseNumber(value) {
  if (value == null || value === "") return null;
  const n = Number(String(value).replace(",", ".").trim());
  return Number.isNaN(n) ? null : n;
}

function isValidEmail(email) {
  const e = String(email || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function getCell(row, columnName) {
  if (!columnName) return "";
  if (row[columnName] !== undefined) return row[columnName];
  const key = Object.keys(row).find(
    (k) => k.trim().toLowerCase() === String(columnName).trim().toLowerCase()
  );
  return key != null ? row[key] : "";
}

function mapRowToCustomer(row, columnMapping) {
  const mapping = columnMapping || {};
  const firstName = String(getCell(row, mapping.firstName) ?? "").trim();
  const lastName = String(getCell(row, mapping.lastName) ?? "").trim();
  const email = String(getCell(row, mapping.email) ?? "").trim().toLowerCase();
  const phone = String(getCell(row, mapping.phone) ?? "").trim();
  const birthDateRaw = getCell(row, mapping.birthDate);
  const fidelityCardNumber = String(getCell(row, mapping.fidelityCardNumber) ?? "").trim();
  const fidelityActivatedAtRaw = getCell(row, mapping.fidelityActivatedAt);
  const pointsRaw = getCell(row, mapping.points);
  const marketingConsentRaw = getCell(row, mapping.marketingConsent);
  const lastPurchaseDateRaw = getCell(row, mapping.lastPurchaseDate);

  return {
    firstName,
    lastName,
    fullName: [firstName, lastName].filter(Boolean).join(" ").trim(),
    email,
    phone,
    birthDate: parseDate(birthDateRaw),
    birthDateRaw: String(birthDateRaw ?? "").trim(),
    fidelityCardNumber,
    fidelityActivatedAt: parseDate(fidelityActivatedAtRaw),
    fidelityActivatedAtRaw: String(fidelityActivatedAtRaw ?? "").trim(),
    points: parseNumber(pointsRaw),
    pointsRaw: String(pointsRaw ?? "").trim(),
    marketingConsent: String(marketingConsentRaw ?? "").trim(),
    lastPurchaseDate: parseDate(lastPurchaseDateRaw),
    lastPurchaseDateRaw: String(lastPurchaseDateRaw ?? "").trim(),
    _row: row,
  };
}

function hasMarketingConsent(customer, config, automation) {
  const requireConsent =
    automation?.conditions?.requireMarketingConsent !== undefined
      ? automation.conditions.requireMarketingConsent
      : config.requireMarketingConsent;

  if (!requireConsent) return true;

  const val = String(customer.marketingConsent || "")
    .trim()
    .toLowerCase();
  if (!val) return false;

  const allowed = (config.validConsentValues || []).map((v) =>
    String(v).trim().toLowerCase()
  );
  return allowed.includes(val);
}

function daysBetween(a, b) {
  const ms = Math.abs(b.getTime() - a.getTime());
  return Math.floor(ms / 86400000);
}

function isSameCalendarDay(d1, d2) {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function historyKey(automationId, email, extra = "") {
  return `${automationId}::${email.toLowerCase()}::${extra}`;
}

function wasSentThisYear(history, automationId, email) {
  const year = new Date().getFullYear();
  return history.some((h) => {
    if (h.automationId !== automationId) return false;
    if (h.recipientEmail !== email.toLowerCase()) return false;
    if (!["simulated", "sent"].includes(h.status)) return false;
    const d = new Date(h.sentAt);
    return !Number.isNaN(d.getTime()) && d.getFullYear() === year;
  });
}

function wasSentForThreshold(history, automationId, email, threshold) {
  const key = `threshold:${threshold}`;
  return history.some((h) => {
    if (h.automationId !== automationId) return false;
    if (h.recipientEmail !== email.toLowerCase()) return false;
    if (!["simulated", "sent"].includes(h.status)) return false;
    return h.meta?.thresholdKey === key || String(h.reason || "").includes(key);
  });
}

function wasContactedWithinCooldown(history, automationId, email, cooldownDays) {
  if (!cooldownDays || cooldownDays <= 0) return false;
  const cutoff = Date.now() - cooldownDays * 86400000;
  return history.some((h) => {
    if (h.automationId !== automationId) return false;
    if (h.recipientEmail !== email.toLowerCase()) return false;
    if (!["simulated", "sent"].includes(h.status)) return false;
    const t = new Date(h.sentAt).getTime();
    return !Number.isNaN(t) && t >= cutoff;
  });
}

function wasEverContactedForAutomation(history, automationId, email) {
  return history.some(
    (h) =>
      h.automationId === automationId &&
      h.recipientEmail === email.toLowerCase() &&
      ["simulated", "sent"].includes(h.status)
  );
}

function evaluateCustomerForAutomation(customer, automation, config, history, prevPoints) {
  const today = new Date();
  const email = customer.email;

  if (!email) {
    return { match: false, reason: "Email mancante" };
  }
  if (!isValidEmail(email)) {
    return { match: false, reason: "Email non valida" };
  }
  if (!hasMarketingConsent(customer, config, automation)) {
    return { match: false, reason: "Consenso marketing assente o non valido" };
  }

  const cooldown = automation.conditions?.cooldownDays ?? 30;

  switch (automation.type) {
    case "birthday": {
      if (automation.conditions?.birthdayEnabled === false) {
        return { match: false, reason: "Trigger compleanno disattivato" };
      }
      if (!customer.birthDate) {
        return { match: false, reason: "Data di nascita mancante" };
      }
      if (!isSameCalendarDay(customer.birthDate, today)) {
        return { match: false, reason: "Compleanno non è oggi" };
      }
      const oncePerYear = automation.conditions?.birthdayOncePerYear !== false;
      if (oncePerYear && wasSentThisYear(history, automation.id, email)) {
        return { match: false, reason: "Già contattato quest'anno" };
      }
      return { match: true };
    }

    case "points_threshold": {
      if (automation.conditions?.pointsTriggerEnabled === false) {
        return { match: false, reason: "Trigger punti disattivato" };
      }
      const thresholds =
        Array.isArray(automation.conditions?.pointsThresholds) &&
        automation.conditions.pointsThresholds.length
          ? automation.conditions.pointsThresholds
          : Number(automation.conditions?.pointsThreshold) > 0
            ? [Number(automation.conditions.pointsThreshold)]
            : [];
      if (!thresholds.length) {
        return { match: false, reason: "Nessuna soglia punti impostata" };
      }
      if (customer.points == null || !Number.isFinite(Number(customer.points))) {
        return { match: false, reason: "Punti non disponibili" };
      }
      const curr = Number(customer.points);
      // Edge-trigger con isteresi: serve il valore osservato in precedenza.
      if (prevPoints == null || !Number.isFinite(Number(prevPoints))) {
        return {
          match: false,
          reason: "Prima osservazione: invio al prossimo superamento soglia",
        };
      }
      const prev = Number(prevPoints);
      // Soglia "attraversata verso l'alto": prima sotto, ora pari/oltre.
      const crossed = thresholds.filter((t) => prev < t && curr >= t);
      if (!crossed.length) {
        return { match: false, reason: `Nessuna soglia attraversata (${prev} → ${curr})` };
      }
      const rewardsMap = automation.conditions?.pointsThresholdRewards || {};
      const rewardFor = (t) => {
        const r = String(rewardsMap[String(t)] || "").trim();
        return r || undefined;
      };
      const mode = automation.conditions?.multiCrossMode === "each" ? "each" : "highest";
      if (mode === "each") {
        return {
          match: true,
          metas: crossed.map((t) => ({
            thresholdKey: `threshold:${t}`,
            threshold: t,
            points: curr,
            reward: rewardFor(t),
          })),
        };
      }
      const top = Math.max(...crossed);
      return {
        match: true,
        meta: { thresholdKey: `threshold:${top}`, threshold: top, points: curr, reward: rewardFor(top) },
      };
    }

    case "new_fidelity": {
      const mode = automation.conditions?.fidelityMode || "new_fidelity";
      if (mode === "first_points") {
        if (customer.points == null || Number(customer.points) <= 0) {
          return { match: false, reason: "Nessun punto fidelity" };
        }
        if (wasEverContactedForAutomation(history, automation.id, email)) {
          return { match: false, reason: "Primi punti già notificati" };
        }
      } else if (mode === "new_row") {
        if (wasEverContactedForAutomation(history, automation.id, email)) {
          return { match: false, reason: "Cliente già contattato" };
        }
        if (!customer.fidelityCardNumber && !customer.email) {
          return { match: false, reason: "Dati cliente insufficienti" };
        }
      } else {
        if (!customer.fidelityCardNumber && !customer.fidelityActivatedAt) {
          return { match: false, reason: "Nessun dato fidelity" };
        }
        const activatedToday =
          customer.fidelityActivatedAt && isSameCalendarDay(customer.fidelityActivatedAt, today);
        const neverContacted = !wasEverContactedForAutomation(history, automation.id, email);
        if (!activatedToday && !neverContacted) {
          return { match: false, reason: "Fidelity già notificata o attivazione non oggi" };
        }
      }
      if (wasContactedWithinCooldown(history, automation.id, email, cooldown)) {
        return { match: false, reason: `In cooldown (${cooldown} giorni)` };
      }
      return { match: true, meta: { fidelityMode: mode } };
    }

    case "inactive_customer": {
      const inactiveDays = Number(automation.conditions?.inactiveDays) || 90;
      if (!customer.lastPurchaseDate) {
        return { match: false, reason: "Data ultimo acquisto mancante" };
      }
      const days = daysBetween(customer.lastPurchaseDate, today);
      if (days < inactiveDays) {
        return { match: false, reason: `Attivo negli ultimi ${inactiveDays} giorni` };
      }
      if (wasContactedWithinCooldown(history, automation.id, email, cooldown)) {
        return { match: false, reason: `In cooldown (${cooldown} giorni)` };
      }
      return { match: true, meta: { inactiveDays } };
    }

    case "custom":
    default:
      if (wasContactedWithinCooldown(history, automation.id, email, cooldown)) {
        return { match: false, reason: `In cooldown (${cooldown} giorni)` };
      }
      return { match: true };
  }
}

function evaluateBirthdayAutomation(customer, automation, config, history) {
  if (automation.type !== "birthday") {
    return { match: false, reason: "Tipo automazione non compleanno" };
  }
  return evaluateCustomerForAutomation(customer, automation, config, history);
}

function evaluatePointsThresholdAutomation(customer, automation, config, history) {
  if (automation.type !== "points_threshold") {
    return { match: false, reason: "Tipo automazione non soglia punti" };
  }
  return evaluateCustomerForAutomation(customer, automation, config, history);
}

function evaluateNewFidelityAutomation(customer, automation, config, history) {
  if (automation.type !== "new_fidelity") {
    return { match: false, reason: "Tipo automazione non fidelity" };
  }
  return evaluateCustomerForAutomation(customer, automation, config, history);
}

function evaluateInactiveCustomerAutomation(customer, automation, config, history) {
  if (automation.type !== "inactive_customer") {
    return { match: false, reason: "Tipo automazione non inattivo" };
  }
  return evaluateCustomerForAutomation(customer, automation, config, history);
}

function getEligibleRecipients(automation, customers, config, history) {
  return evaluateAutomation(automation, customers, history, config);
}

function buildEventKey(automation, email, meta = {}) {
  const aId = automation.id;
  const e = String(email || "").toLowerCase();
  if (automation.type === "birthday") {
    return `${aId}:${e}:birthday:${new Date().getFullYear()}`;
  }
  if (automation.type === "points_threshold" && meta.thresholdKey) {
    return `${aId}:${e}:${meta.thresholdKey}`;
  }
  if (automation.type === "new_fidelity") {
    return `${aId}:${e}:fidelity`;
  }
  if (automation.type === "inactive_customer") {
    return `${aId}:${e}:inactive`;
  }
  return `${aId}:${e}`;
}

function evaluateAutomation(automation, customers, history, config, pointsObs = {}) {
  const recipients = [];
  const skipped = [];

  customers.forEach((customer) => {
    const emailKey = String(customer.email || "").trim().toLowerCase();
    const prevPoints =
      emailKey && pointsObs[emailKey] ? pointsObs[emailKey].points : undefined;
    const result = evaluateCustomerForAutomation(
      customer,
      automation,
      config,
      history,
      prevPoints
    );
    if (result.match) {
      // Modalità "each": un destinatario per ogni soglia attraversata.
      const metas = Array.isArray(result.metas) ? result.metas : [result.meta || {}];
      metas.forEach((meta) => recipients.push({ customer, meta }));
    } else {
      skipped.push({
        customer,
        reason: result.reason || "Non idoneo",
      });
    }
  });

  return { recipients, skipped };
}

function renderTemplate(template, customer, marketingOrVars = {}) {
  const { renderMarketingEmail } = require("./emailTemplateRenderer");
  const isConfig =
    marketingOrVars &&
    (marketingOrVars.businessProfile ||
      marketingOrVars.templates ||
      marketingOrVars.marketingProfiles);
  const marketingConfig = isConfig ? marketingOrVars : { businessName: marketingOrVars.businessName || "" };
  const extra = isConfig ? {} : marketingOrVars;

  return renderMarketingEmail(template, marketingConfig, customer, {
    reward: extra.reward,
    businessName: extra.businessName,
    logoDataUrl: extra.logoDataUrl,
  });
}

async function loadMarketingRows(syncProfile) {
  if (!syncProfile?.excelPath) {
    throw new Error("File Excel non configurato per questo profilo sync.");
  }

  const workbook = await readWorkbookWithRetry(syncProfile.excelPath);
  const { headers, rows } = sheetToRows(workbook);

  if (!headers.length) {
    return { headers: [], customers: [], totalRows: 0 };
  }

  return {
    headers,
    rows,
    totalRows: rows.length,
  };
}

async function loadCustomersForMarketingProfile(
  store,
  appConfig,
  marketingProfileId,
  columnMappingOverride
) {
  const marketing = getMarketingConfig(store);
  const profiles = marketing.marketingProfiles || [];
  const mProfile =
    profiles.find((p) => p.id === marketingProfileId) ||
    (profiles.length === 1 ? profiles[0] : null);
  if (!mProfile) {
    throw new Error(
      "Profilo clienti non trovato. Apri Marketing > Impostazioni e collega il file Excel clienti."
    );
  }

  const effectiveProfile = columnMappingOverride
    ? {
        ...mProfile,
        columnMapping: {
          ...mProfile.columnMapping,
          ...(columnMappingOverride && typeof columnMappingOverride === "object"
            ? columnMappingOverride
            : {}),
        },
      }
    : mProfile;

  const syncProfile = findProfile(appConfig, effectiveProfile.syncProfileId);
  if (!syncProfile) {
    throw new Error("Profilo sync collegato non trovato.");
  }

  const { headers, rows, totalRows } = await loadMarketingRows(syncProfile);
  const customers = rows.map((row) => mapRowToCustomer(row, effectiveProfile.columnMapping));

  return {
    marketingProfile: effectiveProfile,
    syncProfile,
    headers,
    customers,
    totalRows,
  };
}

function countDuplicateEmails(customers) {
  const seen = new Set();
  let duplicates = 0;
  customers.forEach((c) => {
    const email = String(c.email || "")
      .trim()
      .toLowerCase();
    if (!email) return;
    if (seen.has(email)) duplicates += 1;
    else seen.add(email);
  });
  return duplicates;
}

function buildRecipientsPayload(automation, customers, marketing, marketingProfile, syncProfile, headers = []) {
  const pointsObs = (marketing.pointsState && marketing.pointsState[automation.id]) || {};
  const { recipients, skipped } = evaluateAutomation(
    automation,
    customers,
    marketing.sendHistory,
    marketing,
    pointsObs
  );

  const withoutEmail = customers.filter((c) => !c.email).length;
  const withoutConsent = customers.filter(
    (c) => c.email && !hasMarketingConsent(c, marketing, automation)
  ).length;
  const duplicateEmails = countDuplicateEmails(customers);
  const excluded = customers.length - recipients.length;

  return {
    automation,
    marketingProfile,
    syncProfile,
    // Intestazioni Excel (ordine colonne) per mostrare tutti i campi nell'anteprima.
    headers: Array.isArray(headers) ? headers : [],
    summary: {
      total: customers.length,
      valid: recipients.length,
      excluded,
      withoutEmail,
      withoutConsent,
      skipped: skipped.length,
      duplicateEmails,
      alreadyContacted: skipped.filter((s) => /già|cooldown|quest'anno/i.test(s.reason || ""))
        .length,
    },
        recipients: recipients.map((r) => ({
          email: r.customer.email,
          name: r.customer.fullName || r.customer.firstName,
          firstName: r.customer.firstName,
          lastName: r.customer.lastName,
          points: r.customer.points,
          fidelityCardNumber: r.customer.fidelityCardNumber,
          meta: r.meta,
          customer: r.customer,
          row: r.customer._row || {},
        })),
        skipped: skipped.map((s) => ({
          email: s.customer.email || "—",
          name: s.customer.fullName || s.customer.firstName || "—",
          reason: s.reason,
          row: s.customer?._row || {},
        })),
  };
}

function getAutomationRecipientsFromAutomation(
  store,
  appConfig,
  automation,
  columnMappingOverride
) {
  const marketing = getMarketingConfig(store);
  const normalized = normalizeAutomation(automation);

  return loadCustomersForMarketingProfile(
    store,
    appConfig,
    normalized.marketingProfileId,
    columnMappingOverride
  ).then(({ customers, marketingProfile, syncProfile, headers }) =>
    buildRecipientsPayload(normalized, customers, marketing, marketingProfile, syncProfile, headers)
  );
}

function getAutomationRecipients(store, appConfig, automationId) {
  const marketing = getMarketingConfig(store);
  const automation = marketing.automations.find((a) => a.id === automationId);
  if (!automation) {
    throw new Error("Automazione non trovata.");
  }

  return getAutomationRecipientsFromAutomation(store, appConfig, automation);
}

function buildBackendBusinessProfile(marketing) {
  const bp = getBusinessProfile(marketing);
  return {
    businessName: bp.businessName,
    senderName: bp.senderName,
    senderEmail: marketing.senderEmail || "",
    replyToEmail: bp.replyToEmail,
    phone: bp.phone,
    website: bp.website,
    address: bp.address,
    city: bp.city,
    vatNumber: bp.vatNumber,
    logoUrl: "",
    primaryColor: bp.primaryColor,
    secondaryColor: bp.secondaryColor,
    footerText: bp.footerText,
    privacyDisclaimer: bp.privacyDisclaimer,
    unsubscribeText: bp.unsubscribeText,
    footerDisplay: bp.footerDisplay,
  };
}

function buildRecipientVariables(customer, marketing, meta = {}) {
  const bp = getBusinessProfile(marketing);
  return buildVariableMap(customer, bp, {
    reward: meta.reward || "un omaggio speciale",
    threshold: meta.threshold,
    businessName: bp.businessName,
  });
}

function buildMarketingSendPayload(
  marketing,
  automation,
  template,
  recipientRows,
  { appVersion, dryRun }
) {
  const bp = buildBackendBusinessProfile(marketing);

  return {
    businessProfile: bp,
    automation: {
      id: automation.id,
      name: automation.name,
      type: automation.type,
    },
    template: {
      id: template.id,
      name: template.name,
      subject: template.subject,
      previewText: template.previewText,
      blocks: template.blocks || [],
    },
    recipients: recipientRows.map((r) => ({
      id: createId("rcpt"),
      email: r.customer.email,
      firstName: r.customer.firstName || "",
      lastName: r.customer.lastName || "",
      variables: buildRecipientVariables(r.customer, marketing, r.meta),
    })),
    metadata: {
      appVersion: appVersion || "",
      createdAt: new Date().toISOString(),
      dryRun: !!dryRun,
    },
  };
}

async function simulateTestEmail(store, appConfig, { templateId, testEmail }) {
  const marketing = getMarketingConfig(store);
  const template = marketing.templates.find((t) => t.id === templateId);
  if (!template) {
    throw new Error("Template non trovato.");
  }

  const email = String(testEmail || marketing.replyToEmail || "").trim().toLowerCase();
  if (!isValidEmail(email)) {
    throw new Error("Inserisci un indirizzo email di test valido.");
  }

  const sampleCustomer = {
    firstName: "Mario",
    lastName: "Rossi",
    fullName: "Mario Rossi",
    email,
    points: 150,
    fidelityCardNumber: "FID-12345",
    birthDate: new Date(1990, 4, 15),
    birthDateRaw: "15/05/1990",
  };

  const rendered = renderTemplate(template, sampleCustomer, marketing);

  return {
    ok: true,
    simulated: true,
    realSendEnabled: marketing.realSendEnabled,
    message: marketing.realSendEnabled
      ? "Usa «Invia email reali» per un test con backend."
      : "Simulazione test completata. Nessun invio reale.",
    to: email,
    rendered,
  };
}

module.exports = {
  parseDate,
  mapRowToCustomer,
  hasMarketingConsent,
  evaluateAutomation,
  evaluateBirthdayAutomation,
  evaluatePointsThresholdAutomation,
  evaluateNewFidelityAutomation,
  evaluateInactiveCustomerAutomation,
  getEligibleRecipients,
  buildEventKey,
  evaluateCustomerForAutomation,
  renderTemplate,
  loadMarketingRows,
  loadCustomersForMarketingProfile,
  getAutomationRecipients,
  getAutomationRecipientsFromAutomation,
  buildMarketingSendPayload,
  buildBackendBusinessProfile,
  buildRecipientVariables,
  simulateTestEmail,
  isValidEmail,
};
