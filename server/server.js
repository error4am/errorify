// server/server.js
import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

dotenv.config();

const app = express();
app.use(helmet());
app.use(express.json({ limit: "200kb" }));

// parse FRONTEND_ORIGIN env (comma-separated list)
const rawOrigins = (process.env.FRONTEND_ORIGIN || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean); // remove empty strings

console.log("[startup] allowed frontend origins:", rawOrigins);

// CUSTOM CORS middleware - echoes back only the incoming origin if allowed
app.use((req, res, next) => {
  const origin = req.headers.origin;
  // Allow non-browser requests (curl, server-to-server) which have no origin
  if (!origin) return next();

  // If no allowed origins configured, deny by default (safer)
  if (rawOrigins.length === 0) {
    console.warn("[cors] no allowed origins configured; rejecting origin:", origin);
    return res.status(403).json({ error: "CORS: origin not allowed (no origins configured)" });
  }

  // check if the request origin matches any allowed origin exactly
  const isAllowed = rawOrigins.includes(origin);

  if (!isAllowed) {
    console.warn("[cors] origin not allowed:", origin);
    return res.status(403).json({ error: "CORS: origin not allowed" });
  }

  // allowed -> set single origin in header (echo)
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin"); // caches should vary by origin
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-errorify-password");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  // respond to preflight immediately
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

// basic protections & rate limiting
app.use("/api/", rateLimit({ windowMs: 60_000, max: 40 }));

const DEEPSEEK_API = process.env.DEEPSEEK_API_URL || "https://api.deepseek.com/v1/chat/completions";
const DEFAULT_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat-1";
const PORT = process.env.PORT || 3001;
const BOT_PASSWORD = process.env.BOT_PASSWORD || "";

// small helper: keep last N messages
function trimHistory(messages, max = 12) {
  if (!Array.isArray(messages)) return [];
  return messages.slice(-max);
}

// optional simple password middleware (useful for private testing)
function requirePassword(req, res, next) {
  if (!BOT_PASSWORD) return next(); // no password configured -> allow
  const provided = req.headers["x-errorify-password"] || req.query.pw || "";
  if (provided === BOT_PASSWORD) return next();
  return res.status(401).json({ error: "Unauthorized" });
}

// health route
app.get("/", (req, res) => res.send("Errorify backend ok"));

// mock endpoint for safe UI testing without spending tokens
app.post("/api/chat-mock", (req, res) => {
  const lastUser = (req.body?.messages || []).slice().reverse().find(m => m.role === "user");
  const reply = lastUser ? `Mock reply to: "${lastUser.content}"` : "Mock hello from Errorify";
  return res.json({ choices: [{ message: { content: reply } }] });
});

// main proxy route (protected by password middleware if BOT_PASSWORD is set)
app.post("/api/chat", requirePassword, async (req, res) => {
  try {
    if (!req.body) {
      return res.status(400).json({ error: "Request body required (JSON)." });
    }
    const { messages, model } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "messages array required in request body." });
    }

    // debug log
    console.log(`[proxy] incoming messages=${messages.length} requestedModel=${model || "<none>"} fromOrigin=${req.headers.origin || "<no-origin>"}`);

    const payload = {
      model: model || DEFAULT_MODEL,
      messages: trimHistory(messages, 12),
      max_tokens: 800
    };

    const response = await fetch(DEEPSEEK_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    const text = await response.text();

    if (!response.ok) {
      console.error("DeepSeek error:", response.status, text);
      try {
        const parsed = JSON.parse(text);
        return res.status(response.status).json(parsed);
      } catch (e) {
        return res.status(response.status).send(text);
      }
    }

    res.setHeader("Content-Type", "application/json");
    return res.send(text);
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: "server error", detail: err.message });
  }
});

app.listen(PORT, () => console.log(`Proxy server listening on http://localhost:${PORT} (model default: ${DEFAULT_MODEL})`));
