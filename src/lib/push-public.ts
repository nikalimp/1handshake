// The VAPID public key is not a secret: browsers need it to subscribe. The private half lives in VAPID_PRIVATE_KEY.
export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "BIPBijwicTS7u2dqmNEH13idVUl63VZnJTSl_ovkOxeWqSCsdHMBeKo-wc5DnUDnLevwvCa3HLDBPDlEiTdWXOQ";
