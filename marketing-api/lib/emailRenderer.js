/**
 * Renderer email condiviso con Easyfatt Sync (stesso modulo della app).
 * In deploy isolato copiare emailTemplateRenderer.js accanto a questo file.
 */
const path = require("path");

let renderer;
try {
  renderer = require(path.join(__dirname, "..", "..", "src", "main", "emailTemplateRenderer"));
} catch {
  renderer = require(path.join(__dirname, "emailTemplateRenderer.standalone"));
}

module.exports = renderer;
