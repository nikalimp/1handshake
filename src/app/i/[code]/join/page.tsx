export const metadata = { title: "tell us about yourself", robots: { index: false } };

// Next build step: voice → transcript → AI card → accept_invite() → confetti → feed.
// Interaction reference: Product/prototype/invite-join.html
export default async function Join(props: PageProps<"/i/[code]/join">) {
  const { code } = await props.params;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-10">
      <h1 className="text-[30px] leading-[34px] font-extrabold tracking-[-0.03em]">tell us about yourself</h1>
      <p className="meta mt-2">registration for invite {code} — coming in the next build step</p>
    </main>
  );
}
