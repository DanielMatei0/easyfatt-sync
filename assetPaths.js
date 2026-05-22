const fs = require("fs");
const path = require("path");

function getElectronApi() {
  const electron = require("electron");
  return electron && typeof electron === "object" ? electron : {};
}

function warnAsset(message) {
  console.warn(`[Easyfatt Sync] ${message}`);
}

function isPackaged() {
  const { app } = getElectronApi();
  return Boolean(app?.isPackaged);
}

function isAsarPath(assetPath) {
  return assetPath.includes(".asar");
}

function getAssetPath(fileName) {
  if (isPackaged()) {
    const packagedPath = path.join(process.resourcesPath, "assets", fileName);
    if (fs.existsSync(packagedPath)) {
      return packagedPath;
    }
  }

  return path.join(__dirname, "assets", fileName);
}

function getExistingAssetPath(fileName) {
  const assetPath = getAssetPath(fileName);
  if (!fs.existsSync(assetPath)) {
    return undefined;
  }
  if (isPackaged() && isAsarPath(assetPath)) {
    warnAsset(`Ignoro icona dentro app.asar: ${assetPath}`);
    return undefined;
  }
  return assetPath;
}

function loadNativeImage(fileName) {
  const { nativeImage } = getElectronApi();
  if (!nativeImage) {
    return null;
  }

  const iconPath = getAssetPath(fileName);
  if (!fs.existsSync(iconPath)) {
    warnAsset(`Icona non trovata: ${iconPath}`);
    return null;
  }
  if (isPackaged() && isAsarPath(iconPath)) {
    warnAsset(`Ignoro icona dentro app.asar: ${iconPath}`);
    return null;
  }

  try {
    const image = nativeImage.createFromPath(iconPath);
    if (image.isEmpty()) {
      warnAsset(`Icona vuota o non leggibile: ${iconPath}`);
      return null;
    }
    return image;
  } catch (error) {
    warnAsset(
      `Impossibile caricare ${iconPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
}

function getWindowIconPath() {
  if (process.platform === "darwin") {
    return undefined;
  }

  if (process.platform === "win32") {
    return getExistingAssetPath("icon.ico") || getExistingAssetPath("icon.png");
  }

  return getExistingAssetPath("icon.png");
}

function getNotificationIconPath() {
  if (process.platform === "win32") {
    return getExistingAssetPath("icon.ico") || getExistingAssetPath("icon.png");
  }

  return getExistingAssetPath("icon.png");
}

function applyDockIcon() {
  const { app } = getElectronApi();
  if (process.platform !== "darwin" || !app.dock) {
    return;
  }

  const icon = loadNativeImage("icon.png") || loadNativeImage("icon.icns");
  if (!icon) {
    warnAsset("Icona dock non disponibile; avvio senza icona personalizzata.");
    return;
  }

  try {
    app.dock.setIcon(icon);
  } catch (error) {
    warnAsset(
      `Impossibile impostare l'icona dock: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

module.exports = {
  getAssetPath,
  getWindowIconPath,
  getNotificationIconPath,
  applyDockIcon,
};
