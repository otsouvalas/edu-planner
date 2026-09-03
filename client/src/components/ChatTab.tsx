import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { ChatMessage } from "../types";

interface Props {
  classId: number;
  aiEnabled: boolean;
  onError: (message: string) => void;
}

export function ChatTab({ classId, aiEnabled, onError }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .listChat(classId)
      .then(setMessages)
      .catch((error: Error) => onError(error.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages]);

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setDraft("");
    try {
      await api.sendChat(classId, text);
      setMessages(await api.listChat(classId));
    } catch (error) {
      onError((error as Error).message);
      setDraft(text);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="card chat">
      <div className="chat-log" ref={logRef}>
        {messages.length === 0 && (
          <p className="empty">
            Ρωτήστε τον βοηθό για την ύλη και το πρόγραμμα αυτού του τμήματος. Μπορεί να
            τροποποιήσει απευθείας το πρόγραμμα (προσθήκη/αφαίρεση ενοτήτων, σήμανση ως
            ολοκληρωμένων).
          </p>
        )}
        {messages.map((message) => (
          <div key={message.id} className={`bubble ${message.role}`}>
            {message.content}
          </div>
        ))}
        {sending && <div className="bubble assistant muted">…</div>}
      </div>

      <form className="chat-input" onSubmit={send}>
        <textarea
          className="grow"
          placeholder={
            aiEnabled
              ? "Γράψτε το μήνυμά σας…"
              : "Λείπει το ANTHROPIC_API_KEY — η συνομιλία είναι ανενεργή."
          }
          value={draft}
          disabled={!aiEnabled}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send(event);
            }
          }}
        />
        <button type="submit" className="primary" disabled={!aiEnabled || sending}>
          {sending ? "…" : "Αποστολή"}
        </button>
      </form>
    </div>
  );
}
