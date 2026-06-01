const path = require("path");
const fs = require("fs");
const { app, nativeImage } = require("electron");

function warnAsset(message) {
  console.warn(`[Easyfatt Sync] ${message}`);
}

/**
 * Percorso asset in dev (__dirname/assets) o packaged (process.resourcesPath/assets).
 * Restituisce null se il file non esiste in nessuna posizione candidata.
 */
function getAssetPath(fileName) {
  const candidates = [];

  if (app.isPackaged) {
    candidates.push(path.join(process.resourcesPath, "assets", fileName));
  }
  candidates.push(path.join(__dirname, "assets", fileName));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function loadNativeImageFromAsset(fileName) {
  const iconPath = getAssetPath(fileName);
  if (!iconPath) {
    return null;
  }

  try {
    const image = nativeImage.createFromPath(iconPath);
    if (image.isEmpty()) {
      warnAsset(`Icona vuota o non leggibile: ${fileName}`);
      return null;
    }
    return image;
  } catch (err) {
    warnAsset(
      `Impossibile caricare ${fileName}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

/** NativeImage per dock / tray; non lancia eccezioni. */
function loadAppIcon() {
  if (process.platform === "win32") {
    return loadNativeImageFromAsset("icon.ico") || loadNativeImageFromAsset("icon.png");
  }
  if (process.platform === "darwin") {
    return (
      loadNativeImageFromAsset("icon.png") || loadNativeImageFromAsset("icon.icns")
    );
  }
  return loadNativeImageFromAsset("icon.png");
}

/**
 * Path string per BrowserWindow.icon (Windows/Linux).
 * Su macOS l’icona finestra non è necessaria.
 */
function getWindowIconPath() {
  if (process.platform === "darwin") {
    return undefined;
  }

  if (process.platform === "win32") {
    return getAssetPath("icon.ico") || getAssetPath("icon.png") || undefined;
  }

  return getAssetPath("icon.png") || undefined;
}

/** Path per Notification.icon; undefined se assente (nessun crash). */
function getNotificationIconPath() {
  if (process.platform === "win32") {
    return getAssetPath("icon.ico") || getAssetPath("icon.png") || undefined;
  }
  return getAssetPath("icon.png") || undefined;
}

function applyDockIcon() {
  if (process.platform !== "darwin" || !app.dock) {
    return;
  }

  const image = loadAppIcon();
  if (!image) {
    warnAsset("Icona dock non disponibile; l’app continua senza icona personalizzata.");
    return;
  }

  try {
    app.dock.setIcon(image);
  } catch (err) {
    warnAsset(
      `Impossibile impostare l’icona del dock: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

module.exports = {
  getAssetPath,
  loadAppIcon,
  getWindowIconPath,
  getNotificationIconPath,
  applyDockIcon,
};
