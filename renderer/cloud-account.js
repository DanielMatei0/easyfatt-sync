/* Riquadro "Account Aven" nella sezione Marketing: accesso, caricamento della
 * configurazione sul server, stato del negozio, password, scollegamento. */
(function () {
  const api = () => window.easyfattSync;
  const $ = (id) => document.getElementById(id);

  const STEPS = [
    ["backup", "Copia di sicurezza sul PC"],
    ["config", "Automazioni e template"],
    ["customers", "Clienti già presenti"],
    ["ledger", "Storico degli invii"],
    ["complete", "Verifica finale"],
  ];

  let status = null;
  let loggingIn = false;

  function show(id, visible) {
    const el = $(id);
    if (el) el.hidden = !visible;
  }

  function text(id, value) {
    const el = $(id);
    if (el) el.textContent = value;
  }

  function fmt(iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  }

  function renderSteps(step) {
    const el = $("cloudAccountSteps");
    if (!el) return;
    const idx = STEPS.findIndex(([k]) => k === step);
    el.innerHTML = STEPS.map(([key, label], i) => {
      const state = step === "done" || i < idx ? "done" : i === idx ? "active" : "todo";
      return `<div class="cloud-step" data-state="${state}"><span class="cloud-step-dot"></span>${label}</div>`;
    }).join("");
  }

  function render() {
    if (!$("cloudAccountCard") || !status) return;
    const s = status;
    const migrationDone = s.migration?.step === "done";
    const inMigration = s.connected && !migrationDone;
    const badge = $("cloudAccountBadge");

    show("cloudLoginBtn", !s.connected && !loggingIn);
    show("cloudCancelLoginBtn", loggingIn);
    show("cloudMigrateBtn", inMigration && !s.migrating);
    show("cloudRunNowBtn", s.connected && migrationDone && !s.managementOnly);
    show("cloudPasswordBtn", s.connected && migrationDone);
    show("cloudLogoutBtn", s.connected && !s.migrating);
    show("cloudAccountSteps", inMigration);
    if (inMigration) renderSteps(s.migration?.step);

    const err = s.lastError;
    show("cloudAccountError", Boolean(err));
    text("cloudAccountError", err || "");

    if (!s.connected) {
      text("cloudAccountTitle", loggingIn ? "Completa l'accesso nel browser" : "Accedi per inviare le email");
      text(
        "cloudAccountDesc",
        loggingIn
          ? "Si è aperta la pagina di accesso Aven: usa il codice via email, la password o Google."
          : "Gli invii vengono registrati sul server Aven: ogni email parte una volta sola, anche con più PC. Le tue campagne restano come sono.",
      );
      if (badge) {
        badge.dataset.state = "unconfigured";
        badge.textContent = "Non collegato";
      }
      return;
    }

    if (inMigration) {
      text("cloudAccountTitle", s.migrating ? "Caricamento della configurazione…" : "Caricamento da completare");
      text(
        "cloudAccountDesc",
        `Negozio: ${s.shop?.name || "—"}. Porto sul server campagne, clienti e storico. Sul PC non viene cancellato nulla. Gli invii ripartono a caricamento completato.`,
      );
      if (badge) {
        badge.dataset.state = "simulation";
        badge.textContent = s.migrating ? "In corso" : "Da completare";
      }
      return;
    }

    text("cloudAccountTitle", s.shop?.name || "Account collegato");
    const parts = [`${s.user?.email || ""} · ${s.device?.name || "questo PC"}`];
    if (s.lastRun?.at) {
      const sum = s.lastRun.summary;
      parts.push(
        sum ? `Ultimo giro ${fmt(s.lastRun.at)}: ${sum.sent} inviate${sum.failed ? `, ${sum.failed} non riuscite` : ""}` : `Ultimo giro ${fmt(s.lastRun.at)}`,
      );
    }
    if (s.managementOnly) parts.push("Solo gestione: su questo PC non c'è il file clienti, le email partono dai PC del negozio");
    if (s.pendingConfirms) parts.push(`${s.pendingConfirms} esiti da confermare al server`);
    text("cloudAccountDesc", parts.join(" — "));
    text("cloudPasswordBtn", s.user?.has_password ? "Cambia password" : "Imposta password");
    if (badge) {
      if (s.marketingPaused) {
        badge.dataset.state = "simulation";
        badge.textContent = "Invii in pausa";
      } else {
        badge.dataset.state = "active";
        badge.textContent = "Attivo";
      }
    }
  }

  async function refresh() {
    try {
      status = await api()?.getCloudStatus?.();
    } catch {
      /* il riquadro resta com'è */
    }
    render();
  }

  function toast(message, isError) {
    const fn = window.EasyfattMarketingUI?.showToast;
    if (fn) fn(message, isError ? { error: true } : {});
    else if (isError) window.alert(message);
  }

  async function bind() {
    $("cloudLoginBtn")?.addEventListener("click", async () => {
      loggingIn = true;
      render();
      const res = await api()?.cloudLogin?.();
      loggingIn = false;
      status = res?.status || status;
      if (!res?.ok && res?.message && !/annullato/i.test(res.message)) {
        status = { ...status, lastError: res.message };
      }
      render();
      window.EasyfattMarketingUI?.loadData?.().then(() => window.EasyfattMarketingUI?.renderAll?.());
    });

    $("cloudCancelLoginBtn")?.addEventListener("click", () => api()?.cloudCancelLogin?.());

    $("cloudMigrateBtn")?.addEventListener("click", async () => {
      await api()?.cloudMigrate?.();
      await refresh();
    });

    $("cloudRunNowBtn")?.addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = "Invio in corso…";
      try {
        const r = await api()?.runMarketingNow?.();
        if (r?.busy) toast("Un invio è già in corso.");
        else if (r?.skipped) toast("Nessun invio: controlla che il marketing e l'invio reale siano attivi.");
        else if (r && !r.ok) toast(r.message || "Invio non riuscito.", true);
        else if (r?.summary) toast(`Giro completato: ${r.summary.sent} email inviate.`);
      } finally {
        btn.disabled = false;
        btn.textContent = "Invia ora";
        refresh();
      }
    });

    $("cloudPasswordBtn")?.addEventListener("click", async () => {
      const r = await api()?.cloudPasswordCode?.();
      if (r && r.ok === false) return toast(r.message || "Invio del codice non riuscito.", true);
      show("cloudPasswordForm", true);
      $("cloudPasswordCode")?.focus();
    });

    $("cloudPasswordForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const r = await api()?.cloudSetPassword?.({ code: $("cloudPasswordCode").value.trim(), password: $("cloudPasswordNew").value });
      if (!r?.ok) return toast(r?.message || "Password non salvata.", true);
      $("cloudPasswordForm").reset();
      show("cloudPasswordForm", false);
      toast("Password salvata. Da ora puoi accedere anche con email e password.");
      refresh();
    });

    $("cloudLogoutBtn")?.addEventListener("click", async () => {
      const ok = window.confirm(
        "Scollegare questo PC dall'account Aven?\n\nDa questo PC non partiranno più email marketing finché non accedi di nuovo. Campagne e impostazioni restano salvate.",
      );
      if (!ok) return;
      status = await api()?.cloudLogout?.();
      render();
    });

    api()?.onCloudStatus?.((next) => {
      status = next;
      render();
    });
  }

  async function init() {
    if (!$("cloudAccountCard")) return;
    await bind();
    await refresh();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
