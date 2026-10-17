import { ListSkeleton } from "@/components/skeleton";

export default function Loading() {
  return <ListSkeleton title="connections" action={false} cards={4} />;
}
