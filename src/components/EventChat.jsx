import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Send, MessageCircle } from "lucide-react";

export default function EventChat({ eventId, user, isHost }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    base44.entities.EventMessage.filter({ event_id: eventId }, "created_date", 100).then(setMessages);

    const unsub = base44.entities.EventMessage.subscribe((event) => {
      if (event.data?.event_id !== eventId) return;
      if (event.type === "create") {
        setMessages((prev) => [...prev, event.data]);
      }
    });
    return unsub;
  }, [eventId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    if (!text.trim() || sending) return;
    setSending(true);
    await base44.entities.EventMessage.create({
      event_id: eventId,
      sender_email: user.email,
      sender_name: user.full_name,
      sender_picture: user.profile_picture || "",
      text: text.trim(),
      is_host: isHost,
    });
    setText("");
    setSending(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <MessageCircle className="w-4 h-4 text-primary" />
        <h3 className="font-heading font-semibold text-sm">Event Chat</h3>
        <span className="text-xs text-muted-foreground">(approved guests only)</span>
      </div>

      <div className="bg-secondary/30 rounded-2xl border border-border/50 flex flex-col" style={{ height: 320 }}>
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <p className="text-xs text-muted-foreground">No messages yet — start the conversation!</p>
            </div>
          )}
          {messages.map((msg) => {
            const isMe = msg.sender_email === user.email;
            return (
              <div key={msg.id} className={`flex gap-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0 overflow-hidden">
                  {msg.sender_picture ? (
                    <img src={msg.sender_picture} className="w-full h-full object-cover" />
                  ) : (
                    (msg.sender_name || msg.sender_email)[0].toUpperCase()
                  )}
                </div>
                <div className={`max-w-[70%] ${isMe ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] text-muted-foreground ${isMe ? "order-last" : ""}`}>
                      {msg.sender_name || msg.sender_email}
                    </span>
                    {msg.is_host && (
                      <span className="text-[9px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-semibold">Host</span>
                    )}
                  </div>
                  <div className={`px-3 py-2 rounded-2xl text-sm leading-snug ${
                    isMe
                      ? "bg-primary text-primary-foreground rounded-tr-sm"
                      : "bg-secondary text-foreground rounded-tl-sm"
                  }`}>
                    {msg.text}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="p-2 border-t border-border/50 flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="Message guests..."
            className="flex-1 h-9 px-3 text-sm bg-secondary/50 border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            onClick={handleSend}
            disabled={sending || !text.trim()}
            className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center disabled:opacity-40 transition-opacity"
          >
            <Send className="w-4 h-4 text-primary-foreground" />
          </button>
        </div>
      </div>
    </div>
  );
}