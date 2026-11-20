// 本地 CONNECT 代理：github.com 的 DNS 被污染（解析到 127.0.0.1），
// 这里解析出能连通的真实 IP，再直连。只用来把 git push 送出去。
import net from "node:net";
import tls from "node:tls";

const PORT = Number(process.env.GH_PROXY_PORT ?? 7899);
const cache = new Map();

// 阿里 DoH 会返回"能连上但不是 GitHub"的 IP（比如 57.155.x / 20.247.x），
// 光测 TCP 会误判，所以这里做一次带 SNI 的 TLS 握手，证书校验通过才算数。
// 全都不通时退回 GitHub 常用的几个地址。
const FALLBACK_IPS = ["20.205.243.166", "140.82.112.3", "140.82.113.3"];

function probe(ip, host, port, timeout = 6000) {
  return new Promise((resolve) => {
    const socket = tls.connect({ host: ip, port, servername: host, rejectUnauthorized: true });
    const done = (ok) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeout, () => done(false));
    socket.once("secureConnect", () => done(true));
    socket.once("error", () => done(false));
  });
}

async function dohIps(host) {
  const url = `https://dns.alidns.com/resolve?name=${encodeURIComponent(host)}&type=1`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const json = await res.json();
  return (json.Answer ?? []).filter((a) => a.type === 1).map((a) => a.data);
}

async function resolveHost(host, port) {
  if (cache.has(host)) return cache.get(host);

  const candidates = [];
  try {
    candidates.push(...(await dohIps(host)));
  } catch (error) {
    console.error(`DoH 解析 ${host} 失败: ${error.message}`);
  }
  candidates.push(...FALLBACK_IPS);

  for (const ip of [...new Set(candidates)]) {
    if (await probe(ip, host, port)) {
      cache.set(host, ip);
      console.log(`resolve ${host}:${port} -> ${ip}`);
      return ip;
    }
  }
  throw new Error(`没有可连通的地址: ${host}:${port}`);
}

const server = net.createServer((client) => {
  client.once("data", async (buf) => {
    const head = buf.toString("latin1");
    const m = head.match(/^CONNECT ([^:\s]+):(\d+)/);
    if (!m) {
      client.end("HTTP/1.1 400 Bad Request\r\n\r\n");
      return;
    }
    const host = m[1];
    const port = Number(m[2]);
    const rest = buf.subarray(head.indexOf("\r\n\r\n") + 4);
    try {
      const ip = await resolveHost(host, port);
      const upstream = net.connect({ host: ip, port }, () => {
        client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (rest.length) upstream.write(rest);
        client.pipe(upstream);
        upstream.pipe(client);
      });
      upstream.on("error", () => client.destroy());
      client.on("error", () => upstream.destroy());
    } catch (error) {
      console.error(`CONNECT ${host} 失败: ${error.message}`);
      client.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
    }
  });
});

server.listen(PORT, "127.0.0.1", () => console.log(`gh proxy on 127.0.0.1:${PORT}`));
