module.exports = {
  apps: [
    {
      name: "memelab-notify",
      script: "./apps/backend/dist/index.js",
      cwd: "/opt/memelab-notify",
      env: {
        NODE_ENV: "production",
      },
      env_file: "/opt/memelab-notify/apps/backend/.env",
      node_args: "--env-file=apps/backend/.env",
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
