import { notFound } from "next/navigation";
import { OfferForm } from "@/components/offer-controls";
import { ScreenTitle } from "@/components/screen-title";
import { requireMe } from "@/lib/data";
import { OFFER_FIELDS, type Offer } from "@/lib/offers";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "edit offer" };

export default async function EditOfferPage(props: PageProps<"/offers/[id]/edit">) {
  const { id } = await props.params;
  const me = await requireMe();
  const supabase = await createClient();
  const { data: o } = await supabase.from("offers").select(OFFER_FIELDS).eq("id", id).eq("profile_id", me.id).maybeSingle<Offer>();
  if (!o) notFound();
  return (
    <>
      <ScreenTitle title="edit offer" />
      <OfferForm offerId={o.id} initial={{ kind: o.kind, title: o.title, body_md: o.body_md, price: o.price ?? "", link: o.link ?? "" }} />
    </>
  );
}
