import express from "express";
import { exec } from "child_process";

const app = express();
const PORT = 1112;

// Route for ping checks
app.get("/", (req, res) => res.send("🎃 SpookyTreatsBot is alive and spooky!"));

// Start Mastra in the background
exec("npm run mastra", (error, stdout, stderr) => {
  if (error) console.error(`Mastra error: ${error.message}`);
  if (stderr) console.error(`Mastra stderr: ${stderr}`);
  console.log(stdout);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Keepalive web server running on port ${PORT}`);
});
