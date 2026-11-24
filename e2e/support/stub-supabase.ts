import { createServer, type Server } from "node:http";

/**
 * Stub backend for the `degraded` project: answers every request with HTTP 540 (Supabase "project
 * paused") or any other status, so the app must show `/servizio` and never redirect to the login
 * (plan 4.7, DES-16). Listen on the port of E2E_DEGRADED_SUPABASE_URL (default 54499).
 * With no stub running, that port is closed: the "unreachable" case.
 */
export type StubSupabase = { url: string; close: () => Promise<void>; requests: () => number };

export async function startStubSupabase(
  options: { port?: number; status?: number } = {},
): Promise<StubSupabase> {
  const port =
    options.port ??
    Number(new URL(process.env["E2E_DEGRADED_SUPABASE_URL"] ?? "http://127.0.0.1:54499").port);
  let count = 0;
  const server: Server = createServer((request, response) => {
    count += 1;
    request.resume();
    response.writeHead(options.status ?? 540, { "content-type": "application/json" });
    response.end(JSON.stringify({ message: "project paused (stub)" }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return {
    url: `http://127.0.0.1:${port}`,
    requests: () => count,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
