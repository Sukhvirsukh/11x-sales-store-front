import { isRecord } from "./config.js";

function messageFrom(payload) {
  const value = isRecord(payload?.data) ? payload.data : payload;
  const message = isRecord(value?.message) ? value.message : value;
  if (!isRecord(message)) return null;
  const text = message.reply ?? message.text;
  if (typeof text !== "string" || !text.trim()) return null;
  if (message.role && !["bot", "assistant"].includes(message.role))
    return null;
  return {
    id: message.id ?? message.messageId ?? null,
    text: text.trim(),
    products: Array.isArray(message.products) ? message.products : [],
    conversationId: message.conversationId ?? value?.conversationId ?? null,
  };
}

export class ChatTransport {
  constructor(widget, options = {}) {
    this.widget = widget;
    this.options = options;
    this.socket = null;
    this.pending = new Set();
    this.seen = new Set();
    this.conversationId = options.conversationId || null;
    this.destroyed = false;
    this.wantConnected = false;
    this.reconnectDelay = 1000;
    this.reconnectTimer = null;
  }

  connect() {
    this.wantConnected = true;
    if (!this.options.socketUrl || this.socket || this.destroyed) return;
    const factory = this.options.socketFactory || ((url) => new WebSocket(url));
    try {
      const socket = factory(this.options.socketUrl);
      this.socket = socket;
      socket.addEventListener("open", () => {
        this.reconnectDelay = 1000;
      });
      socket.addEventListener("message", (event) => {
        if (this.destroyed) return;
        try {
          const payload = JSON.parse(event.data);
          this.receive(payload);
        } catch (error) {
          console.error("[11x Sales chat] invalid socket message", error);
        }
      });
      socket.addEventListener("close", () => {
        if (this.socket !== socket) return;
        this.socket = null;
        if (this.wantConnected && !this.destroyed) {
          this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
          }, this.reconnectDelay);
          this.reconnectDelay = Math.min(this.reconnectDelay * 2, 10000);
        }
      });
      socket.addEventListener("error", () => {
        console.error("[11x Sales chat] socket connection failed");
      });
    } catch (error) {
      this.socket = null;
      console.error("[11x Sales chat] socket connection failed", error);
    }
  }

  receive(payload) {
    if (this.destroyed) return;
    const value = isRecord(payload?.data) ? payload.data : payload;
    if (isRecord(value) && value.conversationId)
      this.conversationId = value.conversationId;
    const message = messageFrom(payload);
    if (!message) return;
    if (message.id != null && this.seen.has(String(message.id))) return;
    if (message.id != null) {
      this.seen.add(String(message.id));
      if (this.seen.size > 200) this.seen.delete(this.seen.values().next().value);
    }
    if (message.conversationId) this.conversationId = message.conversationId;
    this.widget.addMessage(message.text, "bot", {
      products: message.products,
    });
  }

  async send(text) {
    if (!this.options.chatApiUrl || this.destroyed) return;
    const controller = new AbortController();
    this.pending.add(controller);
    try {
      const fetcher = this.options.fetch || fetch;
      const response = await fetcher(this.options.chatApiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        body: JSON.stringify({
          message: text,
          ...(this.conversationId
            ? { conversationId: this.conversationId }
            : {}),
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Chat request failed (${response.status})`);
      const payload = response.status === 204 ? null : await response.json();
      if (!this.destroyed) this.receive(payload);
    } finally {
      this.pending.delete(controller);
    }
  }

  disconnect() {
    this.wantConnected = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }

  destroy() {
    this.destroyed = true;
    for (const controller of this.pending) controller.abort();
    this.pending.clear();
    this.disconnect();
  }
}
