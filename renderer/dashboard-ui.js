/**
 * Dashboard stato salute — "Sta funzionando tutto?"
 */
(function initDashboardUI() {
  const healthLevel = document.getElementById("healthLevel");
  const healthSummary = document.getElementById("healthSummary");
  const healthLastSync = document.getElementById("healthLastSync");
  const healthNextSync = document.getElementById("healthNextSync");
  const healthProfiles = document.getElementById("healthProfiles");
  const healthWatch = document.getElementById("healthWatch");
  const healthRowsToday = document.getElementById("healthRowsToday");
  const healthGoogleBadge = document.getElementById("healthGoogleBadge");
  const healthErrorsList = document.getElementById("healthErrorsList");

  if (!healthLevel) return;

  function formatDateTime(iso) {
    if (!iso) return "—";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString(undefined, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function renderErrors(errors) {
    if (!healthErrorsList) return;
    healthErrorsList.innerHTML = "";
    if (!errors?.length) {
      healthErrorsList.hidden = true;
      return;
    }
    healthErrorsList.hidden = false;
    errors.forEach((evt) => {
      const li = document.createElement("li");
      li.className = "health-error-item";
      const when = formatDateTime(evt.at);
      li.textContent = `${when} · ${evt.profileName}: ${evt.message || "Errore sync"}`;
      healthErrorsList.appendChild(li);
    });
  }

  function render(health) {
    if (!health) return;

    const level = health.level || "operational";
    healthLevel.textContent = health.levelLabel || "Operativo";
    healthLevel.dataset.level = level;
    healthSummary.textContent = health.summary || "";

    if (healthLastSync) {
      healthLastSync.textContent = health.lastSyncAt
        ? `${formatDateTime(health.lastSyncAt)}${health.lastSyncProfileName ? ` (${health.lastSyncProfileName})` : ""}`
        : "Mai eseguita";
    }

    if (healthNextSync) {
      healthNextSync.textContent = health.nextScheduledAt
        ? formatDateTime(health.nextScheduledAt)
        : "Non programmata";
    }

    if (healthProfiles) {
      healthProfiles.textContent = String(health.profileCount || 0);
    }

    if (healthWatch) {
      healthWatch.textContent = String(health.watchCount || 0);
    }

    if (healthRowsToday) {
      healthRowsToday.textContent = String(health.rowsSyncedToday ?? 0);
    }

    if (healthGoogleBadge) {
      const connected = !!health.googleAuthorized;
      healthGoogleBadge.textContent = connected ? "Collegato" : "Non collegato";
      healthGoogleBadge.dataset.tone = connected ? "success" : "inactive";
    }

    renderErrors(health.recentErrors);
  }

  async function refresh() {
    try {
      const health = await window.easyfattSync.getHealthStatus();
      render(health);
    } catch {
      /* non bloccare UI */
    }
  }

  window.EasyfattDashboardUI = { refresh, render };
  refresh();
})();
