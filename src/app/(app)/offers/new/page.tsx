import { OfferForm } from "@/components/offer-controls";
import { ScreenTitle } from "@/components/screen-title";
import { requireMe } from "@/lib/data";
import type { OfferKind } from "@/lib/offers";

export const metadata = { title: "new offer" };

export default async function NewOfferPage(props: PageProps<"/offers/new">) {
  await requireMe();
  const { kind } = await props.searchParams;
  const k = (["order", "project", "product", "service"] as OfferKind[]).find((x) => x === kind) ?? "service";
  return (
    <>
      <ScreenTitle title="new offer" />
      <OfferForm offerId={null} initial={{ kind: k, title: "", body_md: "", price: "", link: "" }} />
    </>
  );
}
