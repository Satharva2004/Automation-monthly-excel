// api/cron.js
const { exec } = require("child_process");
const path = require("path");

export default async function handler(req, res) {
  // Option 1: Directly require and run your analytics logic (recommended for Vercel)
  // require('../../group-analytics.js');
  // res.status(200).json({ status: 'Analytics job started' });

  // Option 2: If you need to run as a child process (less common for Vercel)
  const scriptPath = path.join(process.cwd(), "group-analytics.js");
  exec(`node ${scriptPath}`, (error, stdout, stderr) => {
    if (error) {
      console.error("Error running analytics:", error);
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(200).json({ status: "Analytics job completed", output: stdout });
  });
}
