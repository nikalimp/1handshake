// robots.txt of admin.1handshake.com (mapped here in next.config.ts): nothing to index.
export function GET() {
  return new Response("User-agent: *\nDisallow: /\n", { headers: { "content-type": "text/plain; charset=utf-8" } });
}
