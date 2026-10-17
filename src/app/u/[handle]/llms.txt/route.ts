import { cardToMarkdown, getCardByHandle, getOpenOffers } from "@/lib/cards";

export async function GET(_req: Request, ctx: RouteContext<"/u/[handle]/llms.txt">) {
  const { handle } = await ctx.params;
  const card = await getCardByHandle(handle);
  if (!card || card.status !== "active") return new Response("not found\n", { status: 404 });
  return new Response(cardToMarkdown(card, await getOpenOffers(card.id)) + "\n", {
    headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}
