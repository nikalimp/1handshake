import { TabBar } from "@/components/tab-bar";
import { requireMe } from "@/lib/data";

export default async function MemberLayout({ children }: LayoutProps<"/">) {
  await requireMe();
  return (
    <div className="mx-auto min-h-dvh max-w-md px-4 pt-6 pb-32">
      {children}
      <TabBar />
    </div>
  );
}
