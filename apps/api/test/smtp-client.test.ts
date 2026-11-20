import assert from "node:assert/strict";
import net from "node:net";
import test from "node:test";
import { sendSmtpMessage, usesImplicitTls, verifySmtpLogin } from "../src/shared/mail/smtp-client.ts";

function listen(handler: (socket: net.Socket) => void) {
  const server = net.createServer(handler);
  return new Promise<{ port: number; close: () => Promise<void> }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("No port");
      resolve({
        port: address.port,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

function reply(socket: net.Socket) {
  let stage: "login" | "user" | "pass" | "mail" = "login";
  socket.write("220 ready\r\n");
  socket.on("data", (chunk) => {
    for (const line of chunk.toString().split("\r\n").filter(Boolean)) {
      if (line.startsWith("EHLO")) socket.write("250-hello\r\n250 AUTH LOGIN\r\n");
      else if (stage === "login" && line.startsWith("AUTH LOGIN")) {
        stage = "user";
        socket.write("334 go\r\n");
      } else if (stage === "user") {
        stage = "pass";
        socket.write("334 go\r\n");
      } else if (stage === "pass") {
        stage = "mail";
        socket.write("235 ok\r\n");
      } else if (line.startsWith("MAIL FROM") || line.startsWith("RCPT TO") || line === "QUIT") socket.write("250 ok\r\n");
      else if (line === "DATA") socket.write("354 send\r\n");
      else if (line === ".") socket.write("250 queued\r\n");
    }
  });
}

test("a plain mailbox can log in and send", async () => {
  const server = await listen((socket) => {
    reply(socket);
  });
  try {
    const target = { host: "127.0.0.1", port: server.port, secure: false, user: "shop@uniqbd.com", pass: "secret" };
    await verifySmtpLogin(target);
    await sendSmtpMessage(target, {
      from: "shop@uniqbd.com",
      to: "buyer@example.com",
      subject: "UniQbd SMTP test",
      text: "hello",
    });
  } finally {
    await server.close();
  }
});

test("port 465 stays on TLS and port 587 upgrades after connect", () => {
  assert.equal(usesImplicitTls({ port: 465, secure: true }), true);
  assert.equal(usesImplicitTls({ port: 587, secure: true }), false);
  assert.equal(usesImplicitTls({ port: 587, secure: false }), false);
});

test("a submission port sends STARTTLS before the password", async () => {
  const seen: string[] = [];
  const server = await listen((socket) => {
    socket.write("220 ready\r\n");
    socket.on("data", (chunk) => {
      const line = chunk.toString().trim();
      seen.push(line);
      if (line.startsWith("EHLO")) socket.write("250-hello\r\n250-STARTTLS\r\n250 AUTH LOGIN\r\n");
      else if (line === "STARTTLS") socket.write("220 ready\r\n");
      else socket.end();
    });
  });
  try {
    await assert.rejects(() =>
      verifySmtpLogin({ host: "127.0.0.1", port: server.port, secure: false, user: "a", pass: "b" }),
    );
    assert.ok(seen.some((line) => line === "STARTTLS"));
    assert.equal(seen.some((line) => line.startsWith("AUTH")), false);
  } finally {
    await server.close();
  }
});
