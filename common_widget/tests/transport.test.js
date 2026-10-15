import test from "node:test";
import assert from "node:assert/strict";
import { ChatTransport } from "../src/transport.js";

test("chat send uses the API and keeps the server conversation id", async () => {
  const messages = [];
  const requests = [];
  const widget = {
    addMessage: (text, role, options) => messages.push({ text, role, options }),
  };
  const transport = new ChatTransport(widget, {
    chatApiUrl: "https://example.test/chat",
    fetch: async (url, init) => {
      requests.push({ url, init });
      return {
        ok: true,
        json: async () => ({
          data: {
            id: requests.length,
            reply: "Hello",
            conversationId: "conversation-1",
          },
        }),
      };
    },
  });

  await transport.send("Hi");
  await transport.send("Again");
  assert.equal(requests[0].url, "https://example.test/chat");
  assert.deepEqual(JSON.parse(requests[0].init.body), { message: "Hi" });
  assert.deepEqual(JSON.parse(requests[1].init.body), {
    message: "Again",
    conversationId: "conversation-1",
  });
  assert.equal(requests[0].init.credentials, "omit");
  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, "bot");
});

test("socket connects on demand, ignores duplicate replies, and disconnects", () => {
  const messages = [];
  const listeners = {};
  const socket = {
    addEventListener: (name, listener) => (listeners[name] = listener),
    close: () => (socket.closed = true),
  };
  const transport = new ChatTransport(
    { addMessage: (text) => messages.push(text) },
    { socketUrl: "wss://example.test/chat", socketFactory: () => socket },
  );

  assert.equal(transport.socket, null);
  transport.connect();
  listeners.message({
    data: JSON.stringify({ message: { id: "reply-1", role: "assistant", text: "Hi" } }),
  });
  listeners.message({
    data: JSON.stringify({ message: { id: "reply-1", role: "assistant", text: "Hi" } }),
  });
  listeners.message({
    data: JSON.stringify({ message: { id: "visitor-1", role: "user", text: "Hi" } }),
  });
  assert.deepEqual(messages, ["Hi"]);
  transport.disconnect();
  assert.equal(socket.closed, true);
  assert.equal(transport.socket, null);
});

test("destroy aborts a pending chat request", async () => {
  let signal;
  const transport = new ChatTransport(
    { addMessage: () => {} },
    {
      chatApiUrl: "https://example.test/chat",
      fetch: (_url, init) => {
        signal = init.signal;
        return new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")));
        });
      },
    },
  );
  const request = transport.send("Hi");
  transport.destroy();
  await assert.rejects(request, /aborted/);
  assert.equal(signal.aborted, true);
});
