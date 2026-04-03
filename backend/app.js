#!/usr/bin/env node
import express from "express";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { registerRoutes } from "./routes.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = resolve(__dirname, "..");
const FRONTEND_DIR = resolve(PROJECT_DIR, "frontend");

const app = express();
app.use(express.json());

app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  next();
});

app.use("/frontend", express.static(FRONTEND_DIR));

registerRoutes(app, FRONTEND_DIR);

const PORT = parseInt(process.env.JARVIS_OFFICE_PORT || "19010", 10);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`jarvis-office listening on http://0.0.0.0:${PORT}`);
});
