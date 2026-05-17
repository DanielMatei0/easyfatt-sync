/**
 * Renderer email condiviso con Easyfatt Sync (stesso modulo della app).
 * In deploy isolato copiare emailTemplateRenderer.js dalla root del repo.
 */
const path = require("path");

let renderer;
try {
  renderer = require(path.join(__dirname, "..", "..", "emailTemplateRenderer"));
} catch {
  renderer = require(path.join(__dirname, "emailTemplateRenderer.standalone"));
}

module.exports = renderer;
