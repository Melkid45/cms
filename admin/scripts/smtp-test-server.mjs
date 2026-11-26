import net from "node:net";
// In-process SMTP sink: listens only on loopback and never forwards mail.
export async function smtpSink() {
  const messages = [];
  const state = { reject: false };
  const sockets = new Set();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("error", () => {});
    socket.on("close", () => sockets.delete(socket));
    socket.write("220 localhost test SMTP\r\n");
    let buffer = "",
      data = false,
      body = [];
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      let end;
      while ((end = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (data) {
          if (line === ".") {
            data = false;
            messages.push(body.join("\n"));
            body = [];
            socket.write("250 Queued\r\n");
          } else body.push(line);
          continue;
        }
        if (/^EHLO|^HELO/i.test(line)) socket.write("250 localhost\r\n");
        else if (/^MAIL|^RCPT|^RSET/i.test(line)) socket.write("250 OK\r\n");
        else if (/^DATA/i.test(line)) {
          if (state.reject) socket.write("550 Test rejection\r\n");
          else {
            data = true;
            socket.write("354 Send data\r\n");
          }
        } else if (/^QUIT/i.test(line)) {
          socket.end("221 Bye\r\n");
        } else socket.write("250 OK\r\n");
      }
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    messages,
    state,
    port: server.address().port,
    close: () => {
      for (const s of sockets) s.destroy();
      server.close();
    },
  };
}
