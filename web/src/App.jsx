// web/src/App.jsx
import { useState, useEffect, useRef } from "react";

/**
 * Backend resolution:
 * - VITE_BACKEND_URL is read at build time by Vite.
 * - If empty, this file will fall back to the mock endpoint on the same host:
 *   - For local dev you should use http://localhost:3001 or your server.
 *   - For production, set VITE_BACKEND_URL to your Render URL (https://...).
 */
const BACKEND = import.meta.env.VITE_BACKEND_URL || "";
console.log("▶ BACKEND (build-time VITE_BACKEND_URL):", BACKEND);

// helper: build final url for a path
function backendUrl(path = "/api/chat") {
  if (BACKEND && BACKEND !== "") {
    // remove trailing slash on BACKEND and append path
    return BACKEND.replace(/\/$/, "") + path;
  }
  // fallback: try local proxy for dev, then mock path
  // NOTE: if you want to force a specific URL for quick testing, replace below.
  return "http://localhost:3001/api/chat";

}

export default function App() {
  const [open, setOpen] = useState(false);
  const [conversation, setConversation] = useState([
    { role: "system", content: "You are Errorify — an intelligent assistant with a calm, helpful tone." }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorBanner, setErrorBanner] = useState(""); // show network/server errors
  const messagesRef = useRef(null);

  useEffect(() => {
    // small welcome message
    setTimeout(() => {
      setConversation(prev => [...prev, { role: "assistant", content: "Hello — I’m Errorify. How can I help you today?" }]);
    }, 120);
  }, []);

  useEffect(() => {
    if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [conversation, open, loading]);

  // helper to append message locally
  function append(role, text) {
    setConversation(prev => [...prev, { role, content: text }]);
  }

  async function sendMessage() {
    setErrorBanner("");
    const text = input.trim();
    if (!text) return;
    append("user", text);
    setInput("");
    setLoading(true);

    const payload = { messages: [...conversation, { role: "user", content: text }] };

    try {
      const url = backendUrl("/api/chat");
      // prepare headers
      const headers = { "Content-Type": "application/json" };
      const pw = sessionStorage.getItem("errorify_pw");
      if (pw) headers["x-errorify-password"] = pw;

      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        // keep credentials false unless you explicitly use cookies
      });

      // If no response (network-level), fetch will throw; otherwise we inspect response
      if (!res.ok) {
        // try parse JSON error body
        const textBody = await res.text();
        let errMsg = textBody || `Request failed: ${res.status}`;
        // If server returned HTML (like Vercel's 404 html), display short message
        if (errMsg.trim().startsWith("<!DOCTYPE") || errMsg.trim().startsWith("<html")) {
          errMsg = `Server error (HTML response). Check backend URL.`;
        } else {
          try {
            const json = JSON.parse(textBody);
            if (json?.error?.message) errMsg = json.error.message;
            else if (json?.error) errMsg = JSON.stringify(json.error);
          } catch (e) { /* not JSON */ }
        }
        append("assistant", `Error: ${errMsg}`);
        setErrorBanner(errMsg);
        setLoading(false);
        return;
      }

      // parse provider response (try common shapes)
      const data = await res.json();
      let assistantText = "";
      if (data.choices && data.choices[0] && data.choices[0].message) {
        assistantText = data.choices[0].message.content;
      } else if (data.output) {
        assistantText = typeof data.output === "string" ? data.output : (data.output[0] ?? JSON.stringify(data.output));
      } else if (data.result) {
        assistantText = data.result;
      } else {
        assistantText = (data?.choices && JSON.stringify(data)) || JSON.stringify(data);
      }

      append("assistant", assistantText);
    } catch (err) {
      // network or unexpected error
      const msg = err?.message || String(err);
      append("assistant", `Network error: ${msg}`);
      setErrorBanner(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <div className="noise" aria-hidden="true"></div>

      <div className="hero" role="main">
        <div className="brand">ERRORIFY</div>

        <div className="content">
          <h1 className="title">Errorify</h1>

          <p className="tagline">You’re not launching a bot. You’re introducing <strong>Errorify</strong> — an intelligence with presence.</p>

          <p className="desc">
            Your brand needs more than generic conversions. With Errorify AI, you’re offering connection, context, and conscious interaction.
          </p>

          <button className="cta" onClick={() => setOpen(true)}>START YOUR JOURNEY</button>

          <footer>© 2025 ERRORIFY AI — MODEL BY HAMZA</footer>
        </div>
      </div>

      {open && (
        <div className="chat-modal" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="chat-card" role="dialog" aria-modal="true" aria-labelledby="chatTitle">
            <div className="chat-header">
              <div id="chatTitle" className="title">Errorify — Assistant</div>
              <button className="close-btn" onClick={() => setOpen(false)} title="Close chat">✕</button>
            </div>

            <div style={{ padding: "6px 18px 0 18px" }}>
              {errorBanner && (
                <div style={{
                  background: "linear-gradient(90deg,#3b2b2b,#2b3136)",
                  color: "#ffd3d3",
                  padding: "8px 12px",
                  borderRadius: 8,
                  marginBottom: 10,
                  fontSize: 13
                }}>
                  {`Error: ${errorBanner}`}
                </div>
              )}
            </div>

            <div className="messages" ref={messagesRef}>
              {conversation.map((m, i) => (
                <div key={i} className={`bubble ${m.role === "user" ? "user" : m.role === "assistant" ? "ai" : ""}`}>
                  {m.content}
                </div>
              ))}
              {loading && <div className="bubble ai">Thinking…</div>}
            </div>

            <div className="composer">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Say something to Errorify..."
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              />
              <button className="send-btn" onClick={sendMessage} disabled={loading}>
                {loading ? <span className="loader" aria-hidden="true"></span> : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
