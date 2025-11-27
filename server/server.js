// server/server.js (safer, more verbose)
import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cors from "cors";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

dotenv.config();

const app = express();
app.use(helmet());
app.use(express.json({ limit: "100kb" })); // parse JSON bodies
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173" }));

app.use("/api/", rateLimit({ windowMs: 60_000, max: 60 }));

const DEEPSEEK_API = process.env.DEEPSEEK_API_URL || "https://api.deepseek.com/v1/chat/completions";
const PORT = process.env.PORT || 3001;
const DEFAULT_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat-1";

// helper: keep last N messages to control tokens
function trimHistory(messages, max = 12) {
  if (!Array.isArray(messages)) return [];
  return messages.slice(-max);
}

// Mock endpoint (safe dev, no cost)
app.post("/api/chat-mock", (req, res) => {
  const lastUser = (req.body?.messages || []).slice().reverse().find(m => m.role === "user");
  const reply = lastUser ? `Mock reply to: "${lastUser.content}"` : "Mock hello from Errorify";
  return res.json({ choices: [{ message: { content: reply } }] });
});

// Main proxy endpoint
app.post("/api/chat", async (req, res) => {
  try {
    // defensive checks
    if (!req.body) {
      console.warn("Empty body received for /api/chat");
      return res.status(400).json({ error: "Request body required (JSON)." });
    }

    const { messages, model } = req.body;

    if (!messages || !Array.isArray(messages)) {
      console.warn("Invalid messages payload:", req.body);
      return res.status(400).json({ error: "messages array required in request body." });
    }

    // debug log so you can inspect what frontend sent
    console.log(`[proxy] Received ${messages.length} messages; requestedModel=${model || "<none>"}; usingModel=${model || DEFAULT_MODEL}`);

    const payload = {
      model: model || DEFAULT_MODEL,
      messages: trimHistory(messages, 12),
      max_tokens: 800
    };

    const resp = await fetch(DEEPSEEK_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify(payload)
    });

    const text = await resp.text();

    if (!resp.ok) {
      // forward the provider error, but also log it for debugging
      console.error("DeepSeek error:", resp.status, text);
      // try to parse JSON error to return JSON to frontend
      try {
        const parsed = JSON.parse(text);
        return res.status(resp.status).json(parsed);
      } catch (e) {
        return res.status(resp.status).send(text);
      }
    }

    // success — forward provider JSON to client
    res.setHeader("Content-Type", "application/json");
    return res.send(text);
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: "server error", detail: err.message });
  }
});

app.listen(PORT, () => console.log(`Proxy server listening on http://localhost:${PORT} (model default: ${DEFAULT_MODEL})`));
