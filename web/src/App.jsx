import { useState, useEffect, useRef } from "react";

export default function App() {
  const [open, setOpen] = useState(false);
  const [conversation, setConversation] = useState([
    { role: "system", content: "You are Errorify — an intelligent assistant with a calm, helpful tone." }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesRef = useRef(null);

  useEffect(() => {
    // small welcome message after mount
    setTimeout(() => {
      setConversation(prev => [...prev, { role: "assistant", content: "Hello — I'm Errorify. How can I help you today?" }]);
    }, 120);
  }, []);

  useEffect(() => {
    if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [conversation, open, loading]);

  async function sendMessage() {
    const text = input.trim();
    if (!text) return;
    setConversation(prev => [...prev, { role: "user", content: text }]);
    setInput("");
    setLoading(true);

    try {
      // dev: this calls your proxy at localhost:3001.
      // If you don't have a backend yet, this will error — that's fine while styling.
      const payload = { messages: [...conversation, { role: "user", content: text }] };
      const res = await fetch("http://localhost:3001/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const t = await res.text();
        setConversation(prev => [...prev, { role: "assistant", content: "Error: " + t }]);
        setLoading(false);
        return;
      }

      const data = await res.json();
      let assistantText = "";

      if (data.choices && data.choices[0] && data.choices[0].message) {
        assistantText = data.choices[0].message.content;
      } else if (data.output) {
        assistantText = typeof data.output === "string" ? data.output : (data.output[0] ?? JSON.stringify(data.output));
      } else if (data.result) {
        assistantText = data.result;
      } else {
        assistantText = JSON.stringify(data);
      }

      setConversation(prev => [...prev, { role: "assistant", content: assistantText }]);
    } catch (err) {
      // while styling, network errors are okay — we still show the UI
      setConversation(prev => [...prev, { role: "assistant", content: "Network error: " + err.message }]);
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
