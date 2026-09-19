// Quick probe of the MEXC Futures WebSocket endpoint.
const url = "wss://contract.mexc.com/ws";
console.log("Attempting connection to", url);

const ws = new WebSocket(url);
const timer = setTimeout(() => {
  console.log("TIMEOUT after 8s, state =", ws.readyState);
  try { ws.close(); } catch {}
  process.exit(2);
}, 8000);

ws.onopen = () => {
  console.log("OPENED. readyState =", ws.readyState);
  ws.send(JSON.stringify({ method: "sub.ticker", param: { symbol: "BTC_USDT" } }));
  console.log("Sent sub.ticker for BTC_USDT");
};

ws.onmessage = (ev) => {
  const t = typeof ev.data === "string" ? ev.data : JSON.stringify(ev.data);
  console.log("MESSAGE:", t.slice(0, 200));
};

ws.onerror = (ev) => {
  console.log("ERROR event, message:", ev && ev.message || "(no message)");
};

ws.onclose = (ev) => {
  clearTimeout(timer);
  console.log("CLOSED code =", ev.code, "reason =", ev.reason || "(none)", "clean =", ev.wasClean);
  process.exit(0);
};