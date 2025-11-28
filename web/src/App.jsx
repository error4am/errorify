// web/src/App.jsx
import { useState, useEffect, useRef } from "react";

/* Backend base from Vite env (baked at build time) */
const BACKEND = import.meta.env.VITE_BACKEND_URL || "";
console.log("▶ BACKEND (build-time):", BACKEND);

function backendUrl(path = "/api/chat") {
  if (BACKEND && BACKEND !== "") return BACKEND.replace(/\/$/, "") + path;
  // safe mock when backend not configured
  return "/api/chat-mock";
}

/* small util: format timestamp */
function timeNow() {
  const d = new Date();
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/* streaming helper: simulate client-side streaming by slicing text into chunks */
function simulateStreaming(text, onChunk, speed = 30) {
  // split by words and gradually emit
  const tokens = text.split(/(\s+)/);
  let i = 0;
  let cancelled = false;
  async function run() {
    while (i < tokens.length && !cancelled) {
      onChunk(tokens[i]);
      i++;
      // pacing: small delay per token
      await new Promise(r => setTimeout(r, speed));
    }
  }
  run();
  return () => { cancelled = true; };
}

export default function App() {
  const [open, setOpen] = useState(false);
  const [conversation, setConversation] = useState([
    { role: "system", content: "You are Errorify — calm, helpful, and crisp.", ts: timeNow() },
    { role: "assistant", content: "Hello — I’m Errorify. How can I help you today?", ts: timeNow() }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamCancel, setStreamCancel] = useState(null);
  const [errorBanner, setErrorBanner] = useState("");
  const messagesRef = useRef(null);

  useEffect(() => {
    if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [conversation, loading, streaming]);

  function appendMessage(role, content, meta = {}) {
    setConversation(prev => [...prev, { role, content, ts: timeNow(), ...meta }]);
    // small visual delay
    setTimeout(() => {
      if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }, 80);
  }

  async function sendMessage() {
    setErrorBanner("");
    const text = input.trim();
    if (!text) return;
    appendMessage("user", text);
    setInput("");
    setLoading(true);

    const payload = { messages: [...conversation, { role: "user", content: text }] };

    try {
      const url = backendUrl("/api/chat");
      const headers = { "Content-Type": "application/json" };
      const pw = sessionStorage.getItem("errorify_pw");
      if (pw) headers["x-errorify-password"] = pw;

      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const body = await res.text();
        // handle HTML error responses gracefully
        const msg = body.trim().startsWith("<") ? "Server responded with an HTML error. Check backend URL." : body;
        appendMessage("assistant", `Error: ${msg}`);
        setErrorBanner(msg);
        setLoading(false);
        return;
      }

      const data = await res.json();

      // attempt to extract assistant text
      let assistantText = "";
      if (data.choices && data.choices[0] && data.choices[0].message) assistantText = data.choices[0].message.content;
      else if (data.output) assistantText = typeof data.output === "string" ? data.output : (data.output[0] ?? JSON.stringify(data.output));
      else if (data.result) assistantText = data.result;
      else assistantText = JSON.stringify(data);

      // STREAMING: simulate incremental token-by-token streaming client-side
      setStreaming(true);
      let buffer = "";
      appendMessage("assistant", ""); // placeholder bubble
      const cancel = simulateStreaming(assistantText, (chunk) => {
        buffer += chunk;
        // update the last assistant message
        setConversation(prev => {
          const copy = [...prev];
          // find last assistant msg index
          const idx = copy.map(m => m.role).lastIndexOf("assistant");
          if (idx >= 0) {
            copy[idx] = { ...copy[idx], content: buffer, ts: copy[idx].ts || timeNow() };
          } else {
            copy.push({ role: "assistant", content: buffer, ts: timeNow() });
          }
          return copy;
        });
      }, 22); // speed (lower = faster)

      setStreamCancel(() => () => {
        cancel();
        setStreaming(false);
        setStreamCancel(null);
      });

      // when simulation completes, we set streaming false after small pause
      // But because simulateStreaming is opaque, we stop it via the cancel closure above
      // We'll set streaming false after 600ms if not canceled
      setTimeout(() => {
        if (streaming) {
          setStreaming(false);
          setStreamCancel(null);
        }
      }, Math.max(600, Math.min(assistantText.length * 12, 3000)));

    } catch (err) {
      appendMessage("assistant", `Network error: ${err?.message ?? err}`);
      setErrorBanner(err?.message ?? "Network error");
    } finally {
      setLoading(false);
    }
  }

  // stop streaming early (user pressed stop)
  function stopStream() {
    if (streamCancel) {
      streamCancel();
      setStreaming(false);
      setStreamCancel(null);
    }
  }

  return (
    <div className="page">
      <div className="noise" aria-hidden="true"></div>

      <div className="hero" role="main" aria-hidden={open}>
        <div className="brand">ERRORIFY</div>

        <div className="content">
          <h1 className="title">Errorify</h1>
          <p className="tagline">You’re not launching a bot. You’re introducing <strong>Errorify</strong> — an intelligence with presence.</p>
          <p className="desc">Your brand needs more than generic conversions. With Errorify AI, you’re offering connection, context, and conscious interaction.</p>

          <div className="ctaRow">
            <button className="cta" onClick={() => setOpen(true)}>
              <span className="ctaSpark" aria-hidden="true"></span>
              START YOUR JOURNEY
            </button>
            <div className="miniNote">Beta — private testing</div>
          </div>

          <footer>© 2025 ERRORIFY AI — MODEL BY HAMZA</footer>
        </div>
      </div>

      {open && (
        <div className="chat-modal" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="chat-card" role="dialog" aria-modal="true" aria-labelledby="chatTitle">
            <div className="chat-header">
              <div id="chatTitle" className="title">Errorify — Assistant</div>

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {streaming ? (
                  <button className="stripe-btn" onClick={stopStream} title="Stop streaming">Stop</button>
                ) : null}
                <button className="close-btn" onClick={() => setOpen(false)} title="Close chat">✕</button>
              </div>
            </div>

            <div style={{ padding: "8px 18px 0 18px" }}>
              {errorBanner && (
                <div className="errorBanner">Error: {errorBanner}</div>
              )}
            </div>

            <div className="messages" ref={messagesRef} aria-live="polite">
              {conversation.map((m, i) => (
                <div
                  key={i}
                  className={`messageRow ${m.role === "user" ? "fromUser" : m.role === "assistant" ? "fromAI" : "meta"}`}
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <div className="avatar">{m.role === "user" ? "H" : "E"}</div>
                  <div className="bubbleWrap">
                    <div className={`bubble ${m.role === "user" ? "user" : m.role === "assistant" ? "ai" : ""}`}>
                      {m.content}
                    </div>
                    <div className="ts">{m.ts}</div>
                  </div>
                </div>
              ))}

              {loading && (
                <div className="messageRow fromAI" style={{ animationDelay: "0ms" }}>
                  <div className="avatar">E</div>
                  <div className="bubbleWrap">
                    <div className="bubble ai">
                      <span className="dotPulse"><span/><span/><span/></span>
                    </div>
                    <div className="ts">{timeNow()}</div>
                  </div>
                </div>
              )}
            </div>

            <div className="composer">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Say something to Errorify..."
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                aria-label="Message input"
              />
              <div className="sendGroup">
                <button className="send-btn" onClick={sendMessage} disabled={loading || streaming}>
                  {loading ? "..." : "Send"}
                </button>
                <button
                  className="quick-btn"
                  onClick={() => { setInput(prev => prev + (prev ? " " : "") + "Explain like I'm five"); }}
                  title="Quick prompt"
                >ELI5</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
