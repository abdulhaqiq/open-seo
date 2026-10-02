import { timingSafeEqual } from "node:crypto";
import http from "node:http";

const username = process.env.BASIC_AUTH_USERNAME?.trim() || "darwa";
const password = process.env.BASIC_AUTH_PASSWORD || "";
const listenPort = Number.parseInt(process.env.PORT || "10000", 10);
const upstreamPort = Number.parseInt(
  process.env.OPENSEO_INTERNAL_PORT || "3001",
  10,
);

if (password.length < 16) {
  throw new Error("BASIC_AUTH_PASSWORD must contain at least 16 characters");
}

function equal(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function authorized(request) {
  const header = request.headers.authorization || "";
  if (!header.startsWith("Basic ")) return false;

  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 0) return false;
    return (
      equal(decoded.slice(0, separator), username) &&
      equal(decoded.slice(separator + 1), password)
    );
  } catch {
    return false;
  }
}

function isPublicHealthCheck(request) {
  return new URL(request.url || "/", "http://localhost").pathname === "/api/health";
}

function challenge(response) {
  response.writeHead(401, {
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8",
    "WWW-Authenticate": 'Basic realm="Darwa OpenSEO", charset="UTF-8"',
  });
  response.end("Authentication required\n");
}

const server = http.createServer((request, response) => {
  if (!isPublicHealthCheck(request) && !authorized(request)) {
    challenge(response);
    return;
  }

  const headers = { ...request.headers };
  delete headers.authorization;
  headers.host = `127.0.0.1:${upstreamPort}`;
  headers["x-forwarded-host"] = request.headers.host || "";
  headers["x-forwarded-proto"] = request.headers["x-forwarded-proto"] || "https";

  const upstream = http.request(
    {
      host: "127.0.0.1",
      port: upstreamPort,
      method: request.method,
      path: request.url,
      headers,
    },
    (upstreamResponse) => {
      response.writeHead(
        upstreamResponse.statusCode || 502,
        upstreamResponse.headers,
      );
      upstreamResponse.pipe(response);
    },
  );

  upstream.on("error", (error) => {
    if (!response.headersSent) {
      response.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
    }
    response.end(`OpenSEO is starting: ${error.code || "upstream unavailable"}\n`);
  });
  request.pipe(upstream);
});

server.listen(listenPort, "0.0.0.0", () => {
  console.log(`OpenSEO login proxy listening on port ${listenPort}`);
});
