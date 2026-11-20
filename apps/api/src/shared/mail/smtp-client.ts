import net from "node:net";
import tls from "node:tls";

export type SmtpTarget = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
};

type Reply = { code: number; text: string };

class SmtpConnection {
  private buffer = "";
  private waiters: Array<(line: string) => void> = [];
  private failed: Error | null = null;
  private readonly raw: net.Socket;

  constructor(raw: net.Socket) {
    this.raw = raw;
    raw.setEncoding("utf8");
    raw.setTimeout(12_000);
    raw.on("data", (chunk: string) => {
      this.buffer += chunk;
      this.flush();
    });
    raw.on("timeout", () => this.fail(new Error("SMTP connection timed out")));
    raw.on("error", (error) => this.fail(error));
  }

  private fail(error: Error) {
    if (this.failed) return;
    this.failed = error;
    const waiting = this.waiters.splice(0);
    for (const waiter of waiting) waiter("");
    this.raw.destroy();
  }

  private flush() {
    while (this.waiters.length > 0) {
      const breakAt = this.buffer.indexOf("\n");
      if (breakAt < 0) return;
      const line = this.buffer.slice(0, breakAt).replace(/\r$/, "");
      this.buffer = this.buffer.slice(breakAt + 1);
      const waiter = this.waiters.shift();
      waiter?.(line);
    }
  }

  private readLine(): Promise<string> {
    if (this.failed) return Promise.reject(this.failed);
    const breakAt = this.buffer.indexOf("\n");
    if (breakAt >= 0) {
      const line = this.buffer.slice(0, breakAt).replace(/\r$/, "");
      this.buffer = this.buffer.slice(breakAt + 1);
      return Promise.resolve(line);
    }
    return new Promise((resolve, reject) => {
      this.waiters.push((line) => {
        if (this.failed && !line) reject(this.failed);
        else resolve(line);
      });
    });
  }

  async readReply(): Promise<Reply> {
    const lines: string[] = [];
    for (;;) {
      const line = await this.readLine();
      lines.push(line);
      if (/^\d{3} /.test(line)) {
        return { code: Number(line.slice(0, 3)), text: lines.join("\n") };
      }
      if (!/^\d{3}-/.test(line)) {
        throw new Error("Unexpected SMTP reply");
      }
    }
  }

  write(line: string) {
    this.raw.write(`${line}\r\n`);
  }

  async expect(code: number, command?: string) {
    if (command) this.write(command);
    const reply = await this.readReply();
    if (reply.code !== code) {
      throw new Error(reply.text.replace(/\s+/g, " ").slice(0, 180));
    }
    return reply;
  }

  close() {
    this.raw.end();
  }

  release() {
    this.raw.removeAllListeners("data");
    this.raw.removeAllListeners("timeout");
    this.raw.removeAllListeners("error");
    this.raw.setTimeout(0);
    this.waiters = [];
  }

  takeSocket() {
    return this.raw;
  }
}

export function usesImplicitTls(target: Pick<SmtpTarget, "port" | "secure">) {
  return target.port === 465 || (target.secure && target.port !== 587);
}

function openSocket(target: Pick<SmtpTarget, "host" | "port" | "secure">): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const secure = usesImplicitTls(target);
    const socket = secure
      ? tls.connect({ host: target.host, port: target.port, servername: target.host })
      : net.connect({ host: target.host, port: target.port });
    const fail = (error: Error) => {
      socket.destroy();
      reject(error);
    };
    socket.setTimeout(12_000);
    socket.once("timeout", () => fail(new Error("SMTP connection timed out")));
    socket.once("error", fail);
    socket.once(secure ? "secureConnect" : "connect", () => {
      socket.off("error", fail);
      socket.off("timeout", fail);
      resolve(socket);
    });
  });
}

function upgradeTls(socket: net.Socket, host: string): Promise<tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const secure = tls.connect({ socket, servername: host });
    const fail = (error: Error) => {
      secure.destroy();
      reject(error);
    };
    secure.setTimeout(12_000);
    secure.once("timeout", () => fail(new Error("SMTP connection timed out")));
    secure.once("error", fail);
    secure.once("secureConnect", () => {
      secure.off("error", fail);
      secure.off("timeout", fail);
      resolve(secure);
    });
  });
}

async function authenticate(conn: SmtpConnection, target: SmtpTarget) {
  await conn.expect(220);
  let active = conn;
  let hello = await active.expect(250, `EHLO ${target.host}`);
  if (!usesImplicitTls(target) && /STARTTLS/i.test(hello.text)) {
    await active.expect(220, "STARTTLS");
    const plain = active.takeSocket();
    active.release();
    const secure = await upgradeTls(plain, target.host);
    active = new SmtpConnection(secure);
    hello = await active.expect(250, `EHLO ${target.host}`);
  }
  await login(active, target, hello.text);
  return active;
}

async function login(conn: SmtpConnection, target: SmtpTarget, hello: string) {
  const advertised = hello.toUpperCase();
  if (!advertised.includes("LOGIN") && advertised.includes("PLAIN")) {
    const token = Buffer.from(`\0${target.user}\0${target.pass}`).toString("base64");
    await conn.expect(235, `AUTH PLAIN ${token}`);
    return;
  }
  await conn.expect(334, "AUTH LOGIN");
  await conn.expect(334, Buffer.from(target.user).toString("base64"));
  await conn.expect(235, Buffer.from(target.pass).toString("base64"));
}

export async function verifySmtpLogin(target: SmtpTarget): Promise<void> {
  const socket = await openSocket(target);
  let conn = new SmtpConnection(socket);
  try {
    conn = await authenticate(conn, target);
    conn.write("QUIT");
  } finally {
    conn.close();
  }
}

export async function sendSmtpMessage(
  target: SmtpTarget,
  input: { from: string; to: string; subject: string; text: string },
): Promise<void> {
  const socket = await openSocket(target);
  let conn = new SmtpConnection(socket);
  try {
    conn = await authenticate(conn, target);
    await conn.expect(250, `MAIL FROM:<${input.from}>`);
    await conn.expect(250, `RCPT TO:<${input.to}>`);
    await conn.expect(354, "DATA");
    const body = [
      `From: ${input.from}`,
      `To: ${input.to}`,
      `Subject: ${input.subject}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      "",
      input.text.replace(/^\./gm, ".."),
      ".",
    ].join("\r\n");
    conn.write(body);
    await conn.expect(250);
    conn.write("QUIT");
  } finally {
    conn.close();
  }
}
