const crypto = require("crypto");
const {
  DEFAULT_CONSENT_VALUES,
  MAX_SEND_HISTORY,
  MARKETING_API_URL,
} = require("./marketingConstants");
const {
  migrateLegacyTemplate,
  createStarterBlocks,
} = require("./emailTemplateRenderer");

const STORE_KEY = "marketingConfig";

function createId(prefix) {
  if (crypto.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function getDefaultMarketingConfig() {
  return {
    enabled: false,
    senderName: "",
    senderEmail: "",
    businessName: "",
    replyToEmail: "",
    requireMarketingConsent: true,
    validConsentValues: [...DEFAULT_CONSENT_VALUES],
    marketingProfiles: [],
    automations: [],
    templates: [],
    sendHistory: [],
    deletedAutomationNames: {},
    automationWizardDraft: null,
    businessProfile: getDefaultBusinessProfile(),
    realSendEnabled: true,
    marketingApiUrl: MARKETING_API_URL,
    runMarketingAfterSync: true,
  };
}

function getDefaultBusinessProfile() {
  return {
    businessName: "",
    senderName: "",
    replyToEmail: "",
    phone: "",
    website: "",
    address: "",
    city: "",
    vatNumber: "",
    logoPath: "",
    logoPosition: "top_center",
    logoSize: "medium",
    primaryColor: "#ff7a00",
    secondaryColor: "#14161a",
    instagramUrl: "",
    facebookUrl: "",
    whatsappUrl: "",
    footerText: "",
    privacyDisclaimer: "",
    unsubscribeText:
      "Ricevi questa email perché sei iscritto al programma fidelity di {{businessName}}.",
    footerDisplay: {
      phone: true,
      website: true,
      address: true,
      vatNumber: false,
      social: true,
      privacy: true,
    },
  };
}

function normalizeFooterDisplay(raw) {
  const d = raw && typeof raw === "object" ? raw : {};
  return {
    phone: d.phone !== false,
    website: d.website !== false,
    address: d.address !== false,
    vatNumber: !!d.vatNumber,
    social: d.social !== false,
    privacy: d.privacy !== false,
  };
}

function normalizeBusinessProfile(raw, legacyCfg = {}) {
  const b = raw && typeof raw === "object" ? raw : {};
  const primary = String(b.primaryColor || "#ff7a00").trim() || "#ff7a00";
  const secondary = String(b.secondaryColor || "#14161a").trim() || "#14161a";
  const logoPos = ["top_center", "top_left", "footer_only", "hidden"].includes(b.logoPosition)
    ? b.logoPosition
    : "top_center";
  const logoSize = ["small", "medium", "large"].includes(b.logoSize) ? b.logoSize : "medium";

  return {
    businessName: String(b.businessName || legacyCfg.businessName || "").trim(),
    senderName: String(b.senderName || legacyCfg.senderName || "").trim(),
    replyToEmail: String(b.replyToEmail || legacyCfg.replyToEmail || "").trim(),
    phone: String(b.phone || "").trim(),
    website: String(b.website || "").trim(),
    address: String(b.address || "").trim(),
    city: String(b.city || "").trim(),
    vatNumber: String(b.vatNumber || "").trim(),
    logoPath: String(b.logoPath || "").trim(),
    logoPosition: logoPos,
    logoSize,
    primaryColor: primary,
    secondaryColor: secondary,
    instagramUrl: String(b.instagramUrl || "").trim(),
    facebookUrl: String(b.facebookUrl || "").trim(),
    whatsappUrl: String(b.whatsappUrl || "").trim(),
    footerText: String(b.footerText || "").trim(),
    privacyDisclaimer: String(b.privacyDisclaimer || "").trim(),
    unsubscribeText:
      String(b.unsubscribeText || "").trim() ||
      "Ricevi questa email perché sei iscritto al programma fidelity di {{businessName}}.",
    footerDisplay: normalizeFooterDisplay(b.footerDisplay),
  };
}

function normalizeTemplateBlock(block, index = 0) {
  const b = block && typeof block === "object" ? block : {};
  const type = [
    "heading",
    "text",
    "button",
    "reward_box",
    "image",
    "divider",
    "footer",
  ].includes(b.type)
    ? b.type
    : "text";
  const content = b.content && typeof b.content === "object" ? { ...b.content } : {};
  return {
    id: String(b.id || "").trim() || createId("blk"),
    type,
    order: b.order != null ? Number(b.order) || index : index,
    content,
  };
}

function normalizeAutomationWizardDraft(raw) {
  if (!raw || typeof raw !== "object") return null;
  const step = Number(raw.step);
  if (!Number.isFinite(step) || step < 0 || step > 6) return null;
  const data = raw.data && typeof raw.data === "object" ? raw.data : {};
  const conditions =
    data.conditions && typeof data.conditions === "object" ? { ...data.conditions } : {};
  const schedule =
    data.schedule && typeof data.schedule === "object"
      ? {
          mode: data.schedule.mode === "daily" ? "daily" : "manual",
          time: String(data.schedule.time || "09:00").trim() || "09:00",
        }
      : { mode: "manual", time: "09:00" };

  return {
    step,
    updatedAt: raw.updatedAt || new Date().toISOString(),
    editingAutomationId: String(raw.editingAutomationId || "").trim() || null,
    data: {
      type: ["birthday", "points_threshold", "new_fidelity", "inactive_customer", "custom"].includes(
        data.type
      )
        ? data.type
        : "custom",
      name: String(data.name || "").trim(),
      marketingProfileId: String(data.marketingProfileId || "").trim(),
      templateId: String(data.templateId || "").trim(),
      enabled: data.enabled !== false,
      conditions,
      schedule,
      columnMapping: normalizeColumnMapping(data.columnMapping),
    },
  };
}

function normalizeDeletedAutomationNames(raw) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const out = {};
  Object.entries(src).forEach(([id, name]) => {
    const key = String(id || "").trim();
    const label = String(name || "").trim();
    if (key && label) out[key] = label;
  });
  return out;
}

function normalizeColumnMapping(mapping) {
  const m = mapping && typeof mapping === "object" ? mapping : {};
  const keys = [
    "firstName",
    "lastName",
    "email",
    "phone",
    "birthDate",
    "fidelityCardNumber",
    "fidelityActivatedAt",
    "points",
    "marketingConsent",
    "lastPurchaseDate",
  ];
  const out = {};
  keys.forEach((k) => {
    const v = String(m[k] || "").trim();
    if (v) out[k] = v;
  });
  return out;
}

function normalizeMarketingProfile(profile, index = 0) {
  const p = profile && typeof profile === "object" ? profile : {};
  return {
    id: String(p.id || "").trim() || createId("mprof"),
    syncProfileId: String(p.syncProfileId || "").trim(),
    name: String(p.name || "").trim() || `Profilo marketing ${index + 1}`,
    columnMapping: normalizeColumnMapping(p.columnMapping),
  };
}

function normalizeAutomation(automation) {
  const a = automation && typeof automation === "object" ? automation : {};
  const conditions = a.conditions && typeof a.conditions === "object" ? a.conditions : {};
  const schedule = a.schedule && typeof a.schedule === "object" ? a.schedule : {};

  const archived = !!a.archived;

  return {
    id: String(a.id || "").trim() || createId("auto"),
    name: String(a.name || "").trim() || "Automazione",
    type: ["birthday", "points_threshold", "new_fidelity", "inactive_customer", "custom"].includes(
      a.type
    )
      ? a.type
      : "custom",
    enabled: archived ? false : a.enabled !== false,
    archived,
    marketingProfileId: String(a.marketingProfileId || "").trim(),
    conditions: {
      pointsThreshold:
        conditions.pointsThreshold != null ? Number(conditions.pointsThreshold) || 0 : undefined,
      inactiveDays:
        conditions.inactiveDays != null ? Number(conditions.inactiveDays) || 0 : undefined,
      requireMarketingConsent:
        conditions.requireMarketingConsent !== undefined
          ? !!conditions.requireMarketingConsent
          : true,
      cooldownDays:
        conditions.cooldownDays != null ? Math.max(0, Number(conditions.cooldownDays) || 0) : 30,
      birthdayEnabled: conditions.birthdayEnabled !== false,
      birthdayOncePerYear: conditions.birthdayOncePerYear !== false,
      pointsTriggerEnabled: conditions.pointsTriggerEnabled !== false,
      firstThresholdOnly: !!conditions.firstThresholdOnly,
      fidelityMode: ["new_row", "new_fidelity", "first_points"].includes(conditions.fidelityMode)
        ? conditions.fidelityMode
        : "new_fidelity",
    },
    templateId: String(a.templateId || "").trim(),
    schedule: {
      mode: schedule.mode === "daily" ? "daily" : "manual",
      time: String(schedule.time || "09:00").trim() || "09:00",
    },
    lastSimulationAt: a.lastSimulationAt || null,
    lastSimulationRecipients:
      a.lastSimulationRecipients != null && !Number.isNaN(Number(a.lastSimulationRecipients))
        ? Math.max(0, Number(a.lastSimulationRecipients))
        : null,
    createdAt: a.createdAt || new Date().toISOString(),
    updatedAt: a.updatedAt || new Date().toISOString(),
  };
}

function isAutomationRunnable(automation) {
  return !!automation && automation.enabled !== false && !automation.archived;
}

function normalizeTemplate(template) {
  const t = template && typeof template === "object" ? template : {};
  let blocks = Array.isArray(t.blocks)
    ? t.blocks.map((b, i) => normalizeTemplateBlock(b, i))
    : [];

  let migrated = migrateLegacyTemplate(
    {
      ...t,
      blocks,
      bodyHtml: String(t.bodyHtml || "").trim(),
    },
    createId
  );

  if (!blocks.length && migrated.blocks?.length) {
    blocks = migrated.blocks.map((b, i) => normalizeTemplateBlock(b, i));
  }

  return {
    id: String(t.id || "").trim() || createId("tmpl"),
    name: String(t.name || "").trim() || "Template",
    subject: String(t.subject || "").trim(),
    previewText: String(t.previewText || "").trim(),
    blocks,
    bodyHtml: String(t.bodyHtml || migrated.bodyHtml || "").trim(),
    bodyText: String(t.bodyText || "").trim(),
    legacy: !!t.legacy || !!migrated.legacy,
    starterType: String(t.starterType || "").trim() || null,
    createdAt: t.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeSendHistoryEntry(entry) {
  const e = entry && typeof entry === "object" ? entry : {};
  return {
    id: String(e.id || "").trim() || createId("send"),
    automationId: String(e.automationId || "").trim(),
    recipientEmail: String(e.recipientEmail || "").trim().toLowerCase(),
    recipientName: String(e.recipientName || "").trim(),
    sentAt: e.sentAt || new Date().toISOString(),
    status: ["simulated", "sent", "failed", "skipped"].includes(e.status) ? e.status : "simulated",
    reason: String(e.reason || "").trim(),
    eventKey: String(e.eventKey || e.meta?.eventKey || "").trim(),
    meta: e.meta && typeof e.meta === "object" ? e.meta : {},
  };
}

function normalizeMarketingConfig(raw) {
  const base = getDefaultMarketingConfig();
  const cfg = raw && typeof raw === "object" ? raw : {};

  const profiles = Array.isArray(cfg.marketingProfiles)
    ? cfg.marketingProfiles.map((p, i) => normalizeMarketingProfile(p, i))
    : [];

  const automations = Array.isArray(cfg.automations)
    ? cfg.automations.map(normalizeAutomation)
    : [];

  const templates = Array.isArray(cfg.templates)
    ? cfg.templates.map(normalizeTemplate)
    : [];

  let sendHistory = Array.isArray(cfg.sendHistory)
    ? cfg.sendHistory.map(normalizeSendHistoryEntry)
    : [];

  if (sendHistory.length > MAX_SEND_HISTORY) {
    sendHistory = sendHistory.slice(0, MAX_SEND_HISTORY);
  }

  const consentValues = Array.isArray(cfg.validConsentValues)
    ? cfg.validConsentValues.map((v) => String(v).trim().toLowerCase()).filter(Boolean)
    : [...DEFAULT_CONSENT_VALUES];

  const legacyFlat = {
    businessName: cfg.businessName,
    senderName: cfg.senderName,
    replyToEmail: cfg.replyToEmail,
  };
  const businessProfile = normalizeBusinessProfile(cfg.businessProfile, legacyFlat);

  return {
    enabled: !!cfg.enabled,
    senderName: businessProfile.senderName || String(cfg.senderName || "").trim(),
    senderEmail: String(cfg.senderEmail || "").trim(),
    businessName: businessProfile.businessName,
    replyToEmail: businessProfile.replyToEmail,
    businessProfile,
    requireMarketingConsent:
      cfg.requireMarketingConsent !== undefined ? !!cfg.requireMarketingConsent : true,
    validConsentValues: consentValues.length ? consentValues : [...DEFAULT_CONSENT_VALUES],
    marketingProfiles: profiles,
    automations,
    templates,
    sendHistory,
    deletedAutomationNames: normalizeDeletedAutomationNames(cfg.deletedAutomationNames),
    automationWizardDraft: normalizeAutomationWizardDraft(cfg.automationWizardDraft),
    realSendEnabled: cfg.realSendEnabled === false ? false : true,
    marketingApiUrl: String(cfg.marketingApiUrl || MARKETING_API_URL).trim() || MARKETING_API_URL,
    runMarketingAfterSync: cfg.runMarketingAfterSync !== false,
  };
}

function getMarketingConfig(store) {
  return normalizeMarketingConfig(store.get(STORE_KEY));
}

function setMarketingConfig(store, config) {
  const normalized = normalizeMarketingConfig(config);
  store.set(STORE_KEY, normalized);
  return normalized;
}

function appendSendHistory(store, entries) {
  if (!entries?.length) return getMarketingConfig(store);
  const cfg = getMarketingConfig(store);
  const next = [...entries.map(normalizeSendHistoryEntry), ...cfg.sendHistory].slice(
    0,
    MAX_SEND_HISTORY
  );
  return setMarketingConfig(store, { ...cfg, sendHistory: next });
}

function clearSendHistory(store) {
  const cfg = getMarketingConfig(store);
  return setMarketingConfig(store, { ...cfg, sendHistory: [] });
}

function seedDefaultTemplates(config) {
  const { AUTOMATION_TYPES } = require("./marketingConstants");
  const { compileBlocksToHtml, getBusinessProfile } = require("./emailTemplateRenderer");
  const templates = [...(config.templates || [])];
  if (templates.length > 0) return config;

  const bp = getBusinessProfile(config);

  Object.entries(AUTOMATION_TYPES).forEach(([type, meta]) => {
    if (type === "custom") return;
    const blocks = createStarterBlocks(type, createId);
    const tpl = normalizeTemplate({
      id: createId("tmpl"),
      name: meta.label,
      subject: meta.defaultSubject,
      previewText: "",
      blocks,
      starterType: type,
      createdAt: new Date().toISOString(),
    });
    const compiled = compileBlocksToHtml(
      tpl.blocks,
      bp,
      require("./emailTemplateRenderer").buildVariableMap(
        require("./emailTemplateRenderer").SAMPLE_CUSTOMER,
        bp
      ),
      { previewText: tpl.previewText }
    );
    templates.push({ ...tpl, bodyHtml: compiled });
  });

  return { ...config, templates };
}

module.exports = {
  STORE_KEY,
  createId,
  getDefaultMarketingConfig,
  getMarketingConfig,
  setMarketingConfig,
  normalizeMarketingConfig,
  normalizeMarketingProfile,
  normalizeAutomation,
  normalizeTemplate,
  isAutomationRunnable,
  appendSendHistory,
  clearSendHistory,
  seedDefaultTemplates,
  normalizeAutomationWizardDraft,
  getDefaultBusinessProfile,
  normalizeBusinessProfile,
  normalizeTemplateBlock,
};
