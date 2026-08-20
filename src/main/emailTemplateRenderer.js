/**
 * Generazione HTML email marketing (inline styles, table layout).
 * Nessun CSS esterno; testi sanitizzati.
 */

const SAMPLE_CUSTOMER = {
  firstName: "Mario",
  lastName: "Rossi",
  fullName: "Mario Rossi",
  email: "mario.rossi@esempio.it",
  points: 120,
  fidelityCardNumber: "FID-12345",
  birthDateRaw: "15 maggio",
  birthDate: null,
};

const LOGO_WIDTH = { small: 80, medium: 120, large: 160 };

function sanitizeText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeUrl(url) {
  const s = String(url || "").trim();
  if (!s) return "";
  if (/^(https?:\/\/|mailto:|tel:)/i.test(s)) return sanitizeText(s);
  if (s.startsWith("#")) return sanitizeText(s);
  return "";
}

function stripHtmlToText(html) {
  return String(html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildVariableMap(customer, businessProfile, extra = {}) {
  const bp = businessProfile || {};
  const c = customer || {};
  const businessName = bp.businessName || extra.businessName || "";

  let birthday = c.birthDateRaw || "";
  if (c.birthDate instanceof Date && !Number.isNaN(c.birthDate.getTime())) {
    birthday = c.birthDate.toLocaleDateString("it-IT", { day: "numeric", month: "long" });
  }

  const reward = extra.reward || "un omaggio speciale";
  // {{soglia}} = soglia punti superata (fallback ai punti reali); {{premio}} = alias di {{reward}}.
  const soglia =
    extra.threshold != null && extra.threshold !== ""
      ? String(extra.threshold)
      : c.points != null
        ? String(c.points)
        : "100";

  return {
    firstName: c.firstName || "Mario",
    lastName: c.lastName || "Rossi",
    points: c.points != null ? String(c.points) : "120",
    businessName,
    fidelityCardNumber: c.fidelityCardNumber || "FID-12345",
    birthday: birthday || "15 maggio",
    reward,
    premio: reward,
    soglia,
  };
}

function replaceVariables(text, map) {
  let out = String(text || "");
  Object.entries(map).forEach(([key, val]) => {
    out = out.split(`{{${key}}}`).join(val);
  });
  return out;
}

function getBusinessProfile(marketingConfig) {
  const cfg = marketingConfig || {};
  const bp = cfg.businessProfile && typeof cfg.businessProfile === "object" ? cfg.businessProfile : {};
  return {
    businessName: bp.businessName || cfg.businessName || "",
    senderName: bp.senderName || cfg.senderName || "",
    replyToEmail: bp.replyToEmail || cfg.replyToEmail || "",
    phone: bp.phone || "",
    website: bp.website || "",
    address: bp.address || "",
    city: bp.city || "",
    vatNumber: bp.vatNumber || "",
    logoPath: bp.logoPath || "",
    logoDataUrl: bp.logoDataUrl || "",
    logoPosition: bp.logoPosition || "top_center",
    logoSize: bp.logoSize || "medium",
    primaryColor: bp.primaryColor || "#ff7a00",
    secondaryColor: bp.secondaryColor || "#14161a",
    instagramUrl: bp.instagramUrl || "",
    facebookUrl: bp.facebookUrl || "",
    whatsappUrl: bp.whatsappUrl || "",
    footerText: bp.footerText || "",
    privacyDisclaimer: bp.privacyDisclaimer || "",
    unsubscribeText:
      bp.unsubscribeText ||
      "Ricevi questa email perché sei iscritto al programma fidelity di {{businessName}}.",
    footerDisplay: {
      phone: bp.footerDisplay?.phone !== false,
      website: bp.footerDisplay?.website !== false,
      address: bp.footerDisplay?.address !== false,
      vatNumber: !!bp.footerDisplay?.vatNumber,
      social: bp.footerDisplay?.social !== false,
      privacy: bp.footerDisplay?.privacy !== false,
    },
  };
}

function renderEmailButton(label, url, primaryColor) {
  const safeLabel = sanitizeText(label || "Scopri di più");
  const safeUrl = sanitizeUrl(url) || "#";
  const bg = primaryColor || "#ff7a00";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px auto;">
  <tr><td align="center" style="border-radius:8px;background:${bg};">
    <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${safeLabel}</a>
  </td></tr></table>`;
}

function renderLogoHtml(businessProfile, position) {
  const bp = businessProfile || {};
  if (bp.logoPosition === "hidden" || bp.logoPosition !== position) return "";
  const src = bp.logoDataUrl || "";
  if (!src) return "";
  const w = LOGO_WIDTH[bp.logoSize] || LOGO_WIDTH.medium;
  const align = position === "top_left" ? "left" : "center";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;">
  <tr><td align="${align}"><img src="${sanitizeText(src)}" alt="${sanitizeText(bp.businessName || "Logo")}" width="${w}" style="display:block;max-width:100%;height:auto;border:0;" /></td></tr>
  </table>`;
}

function renderEmailFooter(businessProfile, variableMap) {
  const bp = businessProfile || {};
  const fd = bp.footerDisplay || {};
  const lines = [];

  if (fd.phone && bp.phone) {
    lines.push(`Tel: ${sanitizeText(bp.phone)}`);
  }
  if (fd.website && bp.website) {
    const url = sanitizeUrl(bp.website);
    if (url) {
      lines.push(`<a href="${url}" style="color:${bp.primaryColor};text-decoration:none;">${sanitizeText(bp.website)}</a>`);
    }
  }
  if (fd.address && (bp.address || bp.city)) {
    const addr = [bp.address, bp.city].filter(Boolean).join(", ");
    lines.push(sanitizeText(addr));
  }
  if (fd.vatNumber && bp.vatNumber) {
    lines.push(`P.IVA / CF: ${sanitizeText(bp.vatNumber)}`);
  }

  const social = [];
  if (fd.social) {
    if (bp.instagramUrl) {
      const u = sanitizeUrl(bp.instagramUrl);
      if (u) social.push(`<a href="${u}" style="color:${bp.primaryColor};margin:0 8px;">Instagram</a>`);
    }
    if (bp.facebookUrl) {
      const u = sanitizeUrl(bp.facebookUrl);
      if (u) social.push(`<a href="${u}" style="color:${bp.primaryColor};margin:0 8px;">Facebook</a>`);
    }
    if (bp.whatsappUrl) {
      const u = sanitizeUrl(bp.whatsappUrl);
      if (u) social.push(`<a href="${u}" style="color:${bp.primaryColor};margin:0 8px;">WhatsApp</a>`);
    }
  }

  const footerCustom = bp.footerText ? replaceVariables(bp.footerText, variableMap) : "";
  const privacy = fd.privacy
    ? replaceVariables(bp.privacyDisclaimer || "", variableMap)
    : "";
  const unsub = replaceVariables(bp.unsubscribeText || "", variableMap);

  const parts = [];
  if (footerCustom) {
    parts.push(`<p style="margin:0 0 8px;font-size:13px;color:#606674;line-height:1.5;">${sanitizeText(footerCustom).replace(/\n/g, "<br/>")}</p>`);
  }
  if (lines.length) {
    parts.push(
      `<p style="margin:0 0 8px;font-size:13px;color:#606674;line-height:1.5;">${lines.join("<br/>")}</p>`
    );
  }
  if (social.length) {
    parts.push(`<p style="margin:8px 0;font-size:13px;">${social.join("")}</p>`);
  }
  if (privacy) {
    parts.push(`<p style="margin:12px 0 0;font-size:11px;color:#9094a0;line-height:1.45;">${sanitizeText(privacy).replace(/\n/g, "<br/>")}</p>`);
  }
  if (unsub) {
    parts.push(`<p style="margin:8px 0 0;font-size:11px;color:#9094a0;line-height:1.45;">${sanitizeText(unsub).replace(/\n/g, "<br/>")}</p>`);
  }
  parts.push(
    `<p style="margin:12px 0 0;font-size:10px;color:#b0b4bc;">{{unsubscribeLinkPlaceholder}}</p>`.replace(
      "{{unsubscribeLinkPlaceholder}}",
      "Preferenze comunicazioni: link disiscrizione in arrivo."
    )
  );

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;padding-top:20px;border-top:1px solid #e8eaef;">
  <tr><td style="font-family:Arial,Helvetica,sans-serif;">${parts.join("")}</td></tr>
  </table>`;
}

function renderBlock(block, businessProfile, variableMap) {
  const type = block?.type || "text";
  const c = block?.content && typeof block.content === "object" ? block.content : {};
  const primary = businessProfile.primaryColor || "#ff7a00";
  const secondary = businessProfile.secondaryColor || "#14161a";

  switch (type) {
    case "heading": {
      const text = replaceVariables(c.text || "", variableMap);
      return `<h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:${secondary};line-height:1.3;font-family:Arial,Helvetica,sans-serif;">${sanitizeText(text)}</h1>`;
    }
    case "text": {
      const text = replaceVariables(c.text || "", variableMap);
      const paras = text
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map(
          (p) =>
            `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#333840;font-family:Arial,Helvetica,sans-serif;">${sanitizeText(p).replace(/\n/g, "<br/>")}</p>`
        )
        .join("");
      return paras || "";
    }
    case "button": {
      const label = replaceVariables(c.label || c.text || "", variableMap);
      const url = replaceVariables(c.url || c.link || "", variableMap);
      return renderEmailButton(label, url, primary);
    }
    case "reward_box": {
      const title = replaceVariables(c.title || "Il tuo premio", variableMap);
      const text = replaceVariables(c.text || "{{reward}}", variableMap);
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;background:#fff8f0;border:1px solid ${primary}33;border-radius:10px;">
      <tr><td style="padding:16px 18px;font-family:Arial,Helvetica,sans-serif;">
        <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:${primary};">${sanitizeText(title)}</p>
        <p style="margin:0;font-size:15px;color:#333840;line-height:1.5;">${sanitizeText(text)}</p>
      </td></tr></table>`;
    }
    case "image": {
      const src = c.imageDataUrl || c.imageUrl || "";
      if (!src) return "";
      const alt = sanitizeText(c.alt || "");
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;">
      <tr><td align="center"><img src="${sanitizeText(src)}" alt="${alt}" style="max-width:100%;height:auto;border-radius:8px;" /></td></tr>
      </table>`;
    }
    case "divider":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;"><tr><td style="border-top:1px solid #e8eaef;font-size:0;line-height:0;">&nbsp;</td></tr></table>`;
    case "footer":
      return renderEmailFooter(businessProfile, variableMap);
    default:
      return "";
  }
}

function sortBlocks(blocks) {
  return [...(blocks || [])].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
}

function compileBlocksToHtml(blocks, businessProfile, variableMap, options = {}) {
  const bp = businessProfile || {};
  const sorted = sortBlocks(blocks);
  const includeAutoFooter = !sorted.some((b) => b.type === "footer");

  let body = "";
  if (bp.logoPosition === "top_center" || bp.logoPosition === "top_left") {
    body += renderLogoHtml(bp, bp.logoPosition);
  }

  sorted.forEach((block) => {
    if (block.type === "footer") return;
    body += renderBlock(block, bp, variableMap);
  });

  if (includeAutoFooter) {
    if (bp.logoPosition === "footer_only") {
      body += renderLogoHtml(bp, "footer_only");
    }
    body += renderEmailFooter(bp, variableMap);
  } else {
    sorted
      .filter((b) => b.type === "footer")
      .forEach((block) => {
        body += renderBlock(block, bp, variableMap);
      });
  }

  const preheader = options.previewText
    ? `<div style="display:none;max-height:0;overflow:hidden;">${sanitizeText(replaceVariables(options.previewText, variableMap))}</div>`
    : "";

  return `${preheader}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f6fb;margin:0;padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(20,22,26,0.06);">
      <tr><td style="padding:28px 24px 24px;font-family:Arial,Helvetica,sans-serif;">${body}</td></tr>
    </table>
  </td></tr></table>`;
}

function renderMarketingEmail(template, marketingConfig, customer, options = {}) {
  const bp = getBusinessProfile(marketingConfig);
  if (options.logoDataUrl) bp.logoDataUrl = options.logoDataUrl;

  const sample = customer || SAMPLE_CUSTOMER;
  const variableMap = buildVariableMap(sample, bp, options);

  const tpl = template || {};
  let bodyHtml = "";

  if (Array.isArray(tpl.blocks) && tpl.blocks.length > 0) {
    bodyHtml = compileBlocksToHtml(tpl.blocks, bp, variableMap, {
      previewText: tpl.previewText,
    });
  } else if (tpl.bodyHtml) {
    bodyHtml = replaceVariables(tpl.bodyHtml, variableMap);
  }

  const subject = replaceVariables(tpl.subject || "", variableMap);
  const previewText = replaceVariables(tpl.previewText || "", variableMap);

  return {
    subject,
    previewText,
    bodyHtml,
    bodyText: stripHtmlToText(bodyHtml),
  };
}

function htmlToTextBlock(html) {
  const text = stripHtmlToText(html);
  return text;
}

function migrateLegacyTemplate(template, createId) {
  const t = template || {};
  if (Array.isArray(t.blocks) && t.blocks.length > 0) {
    return { ...t, legacy: false };
  }
  if (!t.bodyHtml) {
    return { ...t, blocks: [], legacy: false };
  }

  const id = createId || ((p) => `${p}_${Date.now()}`);
  const blocks = [
    {
      id: id("blk"),
      type: "text",
      order: 0,
      content: { text: htmlToTextBlock(t.bodyHtml) },
    },
    {
      id: id("blk"),
      type: "footer",
      order: 1,
      content: {},
    },
  ];

  return {
    ...t,
    blocks,
    legacy: true,
  };
}

function createStarterBlocks(type, createId) {
  const id = createId || ((p) => `${p}_${Date.now()}`);
  const n = (t, content, order) => ({
    id: id("blk"),
    type: t,
    order,
    content: content || {},
  });

  const starters = {
    birthday: [
      n("heading", { text: "Buon compleanno {{firstName}}! 🎂" }, 0),
      n(
        "text",
        {
          text: "Ciao {{firstName}},\n\nda tutto il team di {{businessName}} ti auguriamo un felice compleanno!\n\nPassa a trovarci per festeggiare insieme.",
        },
        1
      ),
      n("reward_box", { title: "Un pensiero per te", text: "{{reward}}" }, 2),
      n("footer", {}, 3),
    ],
    points_threshold: [
      n("heading", { text: "Hai raggiunto {{points}} punti!" }, 0),
      n(
        "text",
        {
          text: "Ciao {{firstName}},\n\ncomplimenti! Hai raggiunto {{points}} punti sulla tua fidelity card {{businessName}}.",
        },
        1
      ),
      n("reward_box", { title: "Il tuo premio", text: "{{reward}}" }, 2),
      n("button", { label: "Scopri i premi", url: "{{website}}" }, 3),
      n("footer", {}, 4),
    ],
    new_fidelity: [
      n("heading", { text: "Benvenuto in {{businessName}}" }, 0),
      n(
        "text",
        {
          text: "Ciao {{firstName}},\n\nla tua fidelity card {{fidelityCardNumber}} è attiva. Accumula punti ad ogni acquisto!",
        },
        1
      ),
      n("footer", {}, 2),
    ],
    inactive_customer: [
      n("heading", { text: "Ci manchi, {{firstName}}!" }, 0),
      n(
        "text",
        {
          text: "Ciao {{firstName}},\n\nè da un po' che non ti vediamo da {{businessName}}. Torna a trovarci: abbiamo novità per te.",
        },
        1
      ),
      n("button", { label: "Visita il negozio", url: "{{website}}" }, 2),
      n("footer", {}, 3),
    ],
  };

  return starters[type] || [
    n("heading", { text: "Messaggio da {{businessName}}" }, 0),
    n("text", { text: "Ciao {{firstName}},\n\nun messaggio per te." }, 1),
    n("footer", {}, 2),
  ];
}

module.exports = {
  SAMPLE_CUSTOMER,
  sanitizeText,
  sanitizeUrl,
  stripHtmlToText,
  replaceVariables,
  buildVariableMap,
  getBusinessProfile,
  renderEmailButton,
  renderEmailFooter,
  renderBlock,
  compileBlocksToHtml,
  renderMarketingEmail,
  migrateLegacyTemplate,
  createStarterBlocks,
  sortBlocks,
};
