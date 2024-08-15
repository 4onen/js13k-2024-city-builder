const u = new URL(window.location);
u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
u.hash = "";
u.search = "";
u.pathname = "/serve_hot.js";
const sck = (new WebSocket(u.href, "serve_hot")).addEventListener("message", (event) => {
    if (event.data === "reload") {
        window.location.reload();
    }
});