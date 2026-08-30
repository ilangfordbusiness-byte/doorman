import { useState, useEffect, useRef } from "react";
import { api } from "@/api/data";
import { Send, MessageCircle } from "lucide-react";
import UserAvatar from "./UserAvatar";
import Avatar from "./Avatar";

export default function EventChat({ eventId, user, isHost, canChat, hostIsBusiness = false, businessName = "", businessPicture = "" }) {
  const canSend = isHost || canChat === true;
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    api.entities.EventMessage.filter({ event_id: eventId }, "created_date", 100).then(setMessages);

    const unsub = api.entities.EventMessage.subscribe((event) => {
      if (event.data?.event_id !== eventId) return;
      if (event.type === "create") {
        setMessages((prev) => (prev.some((m) => m.id === event.data.id) ? prev : [...prev, event.data]));
      }
    }, `event_id=eq.${eventId}`);
    return unsub;
  }, [eventId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    if (!text.trim() || sending || !canSend) return;
    setSending(true);
    await api.entities.EventMessage.create({
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
        <span className="text-xs text-muted-foreground">
          {isHost ? "(host)" : canSend ? "(chat access granted)" : "(host-only · read only)"}
        </span>
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
            // Host messages on a business-hosted event show the business identity.
            const asBusiness = msg.is_host && hostIsBusiness;
            const displayName = asBusiness ? businessName : (msg.sender_name || msg.sender_email);
            return (
              <div key={msg.id} className={`flex gap-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
                {asBusiness ? (
                  <Avatar src={businessPicture} name={businessName} size="w-7 h-7" textClass="text-xs" />
                ) : (
                  <UserAvatar email={msg.sender_email} fallbackSrc={msg.sender_picture} name={msg.sender_name || msg.sender_email} size="w-7 h-7" textClass="text-xs" />
                )}
                <div className={`max-w-[70%] ${isMe ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] text-muted-foreground ${isMe ? "order-last" : ""}`}>
                      {displayName}
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
          {canSend ? (
            <>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                placeholder={isHost ? "Message guests..." : "Message..."}
                className="flex-1 h-9 px-3 text-sm bg-secondary/50 border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                onClick={handleSend}
                disabled={sending || !text.trim()}
                className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center disabled:opacity-40 transition-opacity"
              >
                <Send className="w-4 h-4 text-primary-foreground" />
              </button>
            </>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-2 flex-1">
              Only the host can send messages. Ask the host for chat access.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}