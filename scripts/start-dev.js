#!/usr/bin/env node

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete process.env.ELECTRON_RUN_AS_NODE;

const { spawn } = require("child_process");
const electron = require("electron");

const child = spawn(electron, ["."], {
  cwd: process.cwd(),
  env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
