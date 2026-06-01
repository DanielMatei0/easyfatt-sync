/**
 * Cronologia sincronizzazioni
 */
(function initHistoryUI() {
  const historyList = document.getElementById("historyList");
  const historyEmpty = document.getElementById("historyEmpty");
  const historyFilterProfile = document.getElementById("historyFilterProfile");
  const historyFilterStatus = document.getElementById("historyFilterStatus");
  const historyExportBtn = document.getElementById("historyExportBtn");

  if (!historyList) return;

  function formatDateTime(iso) {
    if (!iso) return "—";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString(undefined, {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatDuration(ms) {
    const n = Number(ms) || 0;
    if (n < 1000) return `${n} ms`;
    return `${(n / 1000).toFixed(1)} s`;
  }

  function getFilters() {
    return {
      profileId: historyFilterProfile?.value || "",
      status: historyFilterStatus?.value || "all",
    };
  }

  function populateProfileFilter(config) {
    if (!historyFilterProfile) return;
    const current = historyFilterProfile.value;
    historyFilterProfile.innerHTML = '<option value="">Tutti i profili</option>';
    (config?.syncProfiles || []).forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name;
      historyFilterProfile.appendChild(opt);
    });
    if (current) historyFilterProfile.value = current;
  }

  function render(events) {
    historyList.innerHTML = "";
    if (!events?.length) {
      if (historyEmpty) historyEmpty.hidden = false;
      return;
    }
    if (historyEmpty) historyEmpty.hidden = true;

    events.slice(0, 100).forEach((evt) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "history-row history-row-clickable";
      row.dataset.status = evt.status;
      row.setAttribute("aria-label", `Apri dettaglio sincronizzazione ${evt.profileName || "Sync"} del ${formatDateTime(evt.at)}`);

      const statusLabel = evt.status === "success" ? "Successo" : "Errore";
      const detail =
        evt.status === "success"
          ? `${evt.rows} righe`
          : evt.message || "Errore sincronizzazione";

      const main = document.createElement("div");
      main.className = "history-row-main";

      const pill = document.createElement("span");
      pill.className = "history-status-pill";
      pill.dataset.status = evt.status;
      pill.textContent = statusLabel;

      const profile = document.createElement("span");
      profile.className = "history-profile";
      profile.textContent = evt.profileName || "Sync";

      main.appendChild(pill);
      main.appendChild(profile);

      // Badge diff se disponibile
      if (evt.diffSummary && !evt.diffSummary.firstSnapshot) {
        const ds = evt.diffSummary;
        const badges = document.createElement("span");
        badges.className = "history-diff-badges";
        const parts = [];
        if (ds.addedCount > 0)
          parts.push(`<span class="diff-mini-badge" data-tone="added">+${ds.addedCount}</span>`);
        if (ds.modifiedCount > 0)
          parts.push(`<span class="diff-mini-badge" data-tone="modified">~${ds.modifiedCount}</span>`);
        if (ds.removedCount > 0)
          parts.push(`<span class="diff-mini-badge" data-tone="removed">−${ds.removedCount}</span>`);
        if (parts.length > 0) {
          badges.innerHTML = parts.join("");
          main.appendChild(badges);
        }
      } else if (evt.diffSummary?.firstSnapshot) {
        const tag = document.createElement("span");
        tag.className = "history-diff-tag";
        tag.textContent = "Primo snapshot";
        main.appendChild(tag);
      }

      const meta = document.createElement("div");
      meta.className = "history-row-meta";

      [formatDateTime(evt.at), formatDuration(evt.durationMs), detail].forEach((text) => {
        const span = document.createElement("span");
        span.textContent = text;
        meta.appendChild(span);
      });

      const cta = document.createElement("span");
      cta.className = "history-row-cta";
      cta.textContent = "Vedi dettagli →";
      meta.appendChild(cta);

      row.appendChild(main);
      row.appendChild(meta);

      row.addEventListener("click", () => {
        window.EasyfattDiffUI?.openByEvent?.(evt);
      });

      historyList.appendChild(row);
    });
  }

  async function refresh() {
    try {
      const events = await window.easyfattSync.getSyncHistory(getFilters());
      render(events);
    } catch {
      render([]);
    }
  }

  historyFilterProfile?.addEventListener("change", refresh);
  historyFilterStatus?.addEventListener("change", refresh);

  historyExportBtn?.addEventListener("click", async () => {
    try {
      const result = await window.easyfattSync.exportSyncHistory(getFilters());
      if (result?.ok && result.filePath) {
        alert("Report esportato correttamente.");
      }
    } catch {
      alert("Esportazione non riuscita.");
    }
  });

  window.easyfattSync?.onHistoryUpdated?.(() => refresh());

  window.EasyfattHistoryUI = {
    refresh,
    populateProfileFilter,
  };
})();
