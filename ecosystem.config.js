module.exports = {
  apps: [
    {
      name: "CRM",
      script: "index.js",
      instances: 2,
      exec_mode: "cluster",
    },
    {
      name: "cron-worker",
      script: "cron-worker.js",
      instances: 1,
      exec_mode: "fork",
      watch: false
    }
  ]
};

