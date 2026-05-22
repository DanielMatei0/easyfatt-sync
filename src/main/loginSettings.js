const { app } = require("electron");

let lastAppliedOpenAtLogin = null;
let devMacLoginWarningShown = false;

/**
 * Avvio con il sistema (openAtLogin).
 *
 * Su macOS in sviluppo (npm run dev) l'app non è firmata: il sistema
 * rifiuta spesso con "Operation not permitted". Funziona nella build
 * installata e firmata (Windows e macOS).
 */
function applyOpenAtLoginSetting(openAtLogin, log = () => {}) {
  const enabled = !!openAtLogin;

  if (lastAppliedOpenAtLogin === enabled) {
    return { ok: true, skipped: true };
  }

  if (process.platform === "darwin" && !app.isPackaged) {
    lastAppliedOpenAtLogin = enabled;

    if (enabled && !devMacLoginWarningShown) {
      devMacLoginWarningShown = true;
      log(
        "Avvio con macOS: disponibile nella versione installata e firmata. In sviluppo macOS può bloccare questa opzione."
      );
    }

    return {
      ok: false,
      skipped: true,
      reason: "mac-dev-unsigned",
    };
  }

  if (process.platform !== "win32" && process.platform !== "darwin") {
    lastAppliedOpenAtLogin = enabled;
    return { ok: true, skipped: true, reason: "unsupported-platform" };
  }

  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      name: "Easyfatt Sync",
      path: process.execPath,
    });
    lastAppliedOpenAtLogin = enabled;
    return { ok: true };
  } catch {
    lastAppliedOpenAtLogin = enabled;
    return { ok: false, reason: "set-login-item-failed" };
  }
}

module.exports = {
  applyOpenAtLoginSetting,
};
