const { readFileSync } = require("fs");
const { resolve } = require("path");

/** Parse .env file into object (supports comments and empty lines) */
function loadEnv(filePath) {
  const env = {};
  try {
    const content = readFileSync(resolve(filePath), "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      let val = trimmed.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1).replace(/\\(.)/g, '$1');
      } else {
        // Strip inline comments (only for unquoted values)
        const commentIdx = val.indexOf(' #');
        if (commentIdx !== -1) val = val.slice(0, commentIdx).trimEnd();
      }
      env[trimmed.slice(0, idx).trim()] = val;
    }
  } catch {
    // .env missing — rely on system env
  }
  return env;
}

module.exports = {
  apps: [
    {
      name: "memelab-notify",
      script: "./apps/backend/dist/index.js",
      cwd: "/opt/memelab-notify",
      env: loadEnv("/opt/memelab-notify/apps/backend/.env"),
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      max_memory_restart: "256M",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: "/var/log/memelab-notify/error.log",
      out_file: "/var/log/memelab-notify/out.log",
      merge_logs: true,
    },
  ],
};
