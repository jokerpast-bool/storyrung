// 本地 CONNECT 代理：github.com 的 DNS 被污染（解析到 127.0.0.1），
// 这里用阿里 DoH 解析出真实 IP，再直连。只用来把 git push 送出去。
import net from "node:net";

const PORT = Number(process.env.GH_PROXY_PORT ?? 7899);
const cache = new Map();

async function resolveViaDoh(host) {
  if (cache.has(host)) return cache.get(host);
  const url = `https://dns.alidns.com/resolve?name=${encodeURIComponent(host)}&type=1`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const json = await res.json();
  const ips = (json.Answer ?? []).filter((a) => a.type === 1).map((a) => a.data);
  if (!ips.length) throw new Error(`DoH 无结果: ${host}`);
  cache.set(host, ips[0]);
  return ips[0];
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
      const ip = await resolveViaDoh(host);
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
