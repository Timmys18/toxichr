// No .env loading, API keys, model URI, generation requests or TLS bypass.
// {} is intentionally invalid. HTTP 400/401 establishes an HTTP response only.
import { lookup } from "node:dns/promises";
import { spawn } from "node:child_process";

const hosts = ["ai.api.cloud.yandex.net", "llm.api.cloud.yandex.net"];
const codes = error => [error?.code, error?.cause?.code, ...(error?.cause?.errors ?? []).map(e => e.code)].filter(Boolean);
const curlProbe = url => new Promise(resolve => {
  const child = spawn(process.platform === "win32" ? "curl.exe" : "curl", [
    "--disable", "--silent", "--show-error", "--connect-timeout", "6", "--max-time", "8",
    "--output", process.platform === "win32" ? "NUL" : "/dev/null",
    "--write-out", "%{http_code} %{http_connect} %{time_connect} %{time_appconnect}",
    "--header", "Content-Type: application/json", "--header", "x-data-logging-enabled: false", "--data", "{}", url,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  let output = "", settled = false;
  const timer = setTimeout(() => { child.kill(); finish({ error: "process_timeout" }); }, 10_000);
  function finish(result) { if (!settled) { settled = true; clearTimeout(timer); resolve(result); } }
  child.stdout.on("data", chunk => { output += chunk.toString(); });
  // stderr can contain proxy configuration: drain it without printing.
  child.stderr.resume();
  child.on("error", error => finish({ error: error.code ?? error.name }));
  child.on("close", exitCode => {
    const [http, proxyConnect, tcpSeconds, tlsSeconds] = output.trim().split(/\s+/);
    finish({ exitCode, httpStatus: Number(http) || null, proxyConnectStatus: Number(proxyConnect) || null, tcpSeconds: Number(tcpSeconds) || 0, tlsSeconds: Number(tlsSeconds) || 0 });
  });
});

async function nodeProbe(url) {
  const started = Date.now();
  try {
    const response = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json", "x-data-logging-enabled": "false" },
      body: "{}", redirect: "manual", signal: AbortSignal.timeout(8000),
    });
    await response.body?.cancel();
    return { httpStatus: response.status, server: response.headers.get("server"), elapsedMs: Date.now() - started };
  } catch (error) { return { error: error.name, codes: codes(error), elapsedMs: Date.now() - started }; }
}

async function dnsProbe(host) {
  let timer;
  try {
    return await Promise.race([
      lookup(host, { all: true }).then(result => ({ families: [...new Set(result.map(r => r.family))], addressCount: result.length })),
      new Promise(resolve => { timer = setTimeout(() => resolve({ error: "dns_timeout" }), 3000); }),
    ]);
  } catch (error) { return { error: error.code ?? error.name }; }
  finally { clearTimeout(timer); }
}

const results = await Promise.all(hosts.map(async host => {
  const url = `https://${host}/v1/chat/completions`;
  const [dns, node, curl] = await Promise.all([dnsProbe(host), nodeProbe(url), curlProbe(url)]);
  return { host, dns, node, curl };
}));
console.log(JSON.stringify({
  scope: "unauthenticated-invalid-body-no-generation", nodeVersion: process.version,
  proxyConfigured: Object.fromEntries(["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY"].map(name => [name, Boolean(process.env[name])])),
  nodeEnvProxyEnabled: process.env.NODE_USE_ENV_PROXY === "1", results,
  note: "HTTP response does not validate an API key, model or schema. DNS failure can coexist with HTTP success through a proxy. Compare the same command inside Codex and in a normal terminal before diagnosing the user's machine.",
}, null, 2));
// Terminate any pending system DNS lookup after the bounded probes finish.
process.exit(results.some(r => r.node.httpStatus || r.curl.httpStatus) ? 0 : 1);
