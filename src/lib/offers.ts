// Offers: what a member puts out to the network — an order, a project, a product or a service.
export type OfferKind = "order" | "project" | "product" | "service";

export const OFFER_KINDS: { id: OfferKind; label: string; hint: string }[] = [
  { id: "order", label: "order", hint: "you're looking for someone to do a job" },
  { id: "project", label: "project", hint: "you're looking for people to build something with" },
  { id: "product", label: "product", hint: "something you sell" },
  { id: "service", label: "service", hint: "work you offer" },
];
export const kindLabel = (k: OfferKind) => OFFER_KINDS.find((x) => x.id === k)?.label ?? k;

export type Offer = {
  id: string;
  profile_id: string;
  kind: OfferKind;
  title: string;
  body_md: string;
  price: string | null;
  link: string | null;
  closed_at: string | null;
  created_at: string;
};
export const OFFER_FIELDS = "id, profile_id, kind, title, body_md, price, link, closed_at, created_at";
export const MAX_OPEN_OFFERS = 10;
