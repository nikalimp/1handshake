import type { ReactNode } from "react";
import { ScreenTitle } from "@/components/screen-title";

/**
 * Loading skeletons for the member screens (loading.tsx). They are prefetched with the tab bar links,
 * so a tap switches the screen at once while the data streams in.
 */
export function Bone({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-full bg-surface-sunk ${className}`}
    />
  );
}

function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col gap-4 rounded-[var(--radius-lg)] bg-surface p-5 shadow-[var(--shadow-card)] ${className}`}
    >
      {children}
    </div>
  );
}

function PersonRow({ size = 44 }: { size?: number }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="animate-pulse shrink-0 rounded-full bg-surface-sunk"
        style={{ width: size, height: size }}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Bone className="h-4 w-2/5" />
        <Bone className="h-3 w-3/5" />
      </div>
    </div>
  );
}

function Lines({ n = 3 }: { n?: number }) {
  const widths = ["w-full", "w-11/12", "w-4/5", "w-2/3", "w-3/4"];
  return (
    <div className="flex flex-col gap-2.5">
      {Array.from({ length: n }, (_, i) => (
        <Bone
          key={i}
          className={`h-3.5 ${i === n - 1 ? "w-1/2" : widths[i % widths.length]}`}
        />
      ))}
    </div>
  );
}

/** Title is real text, so the screen reads as "switched" right away. */
export function ListSkeleton({
  title,
  action = true,
  cards = 3,
  avatar = 44,
}: {
  title: string;
  action?: boolean;
  cards?: number;
  avatar?: number;
}) {
  return (
    <div aria-busy="true" aria-label={`loading ${title}`}>
      <ScreenTitle title={title}>
        {action && <Bone className="h-10 w-28" />}
      </ScreenTitle>
      <Bone className="-mt-2 mb-4 h-3 w-1/2" />
      <div className="flex flex-col gap-4">
        {Array.from({ length: cards }, (_, i) => (
          <Card key={i}>
            <PersonRow size={avatar} />
            <Lines n={i % 2 ? 2 : 3} />
            <div className="flex gap-2">
              <Bone className="h-10 w-24" />
              <Bone className="h-10 w-20" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

/** A profile: avatar, name, role, about, a row of chips. Used for /profile and /people/[handle]. */
export function ProfileSkeleton({ title }: { title?: string }) {
  return (
    <div
      aria-busy="true"
      aria-label="loading profile"
      className={title ? "" : "pt-6"}
    >
      {title && (
        <ScreenTitle title={title}>
          <Bone className="h-10 w-28" />
        </ScreenTitle>
      )}
      <div className="flex flex-col items-center gap-3 pt-2">
        <div className="h-24 w-24 animate-pulse rounded-full bg-surface-sunk" />
        <Bone className="h-6 w-44" />
        <Bone className="h-3.5 w-56" />
      </div>
      <div className="mt-8 flex flex-col gap-4">
        <Card>
          <Lines n={4} />
        </Card>
        <div className="flex flex-wrap gap-2">
          {["w-20", "w-28", "w-16", "w-24"].map((w) => (
            <Bone key={w} className={`h-8 ${w}`} />
          ))}
        </div>
        <Card>
          <PersonRow />
          <Lines n={2} />
        </Card>
      </div>
    </div>
  );
}

export function GraphSkeleton() {
  return (
    <div aria-busy="true" aria-label="loading graph">
      <ScreenTitle title="graph" />
      <div className="flex gap-2 pb-4">
        <Bone className="h-9 w-20" />
        <Bone className="h-9 w-24" />
        <Bone className="h-9 w-16" />
      </div>
      <div className="relative aspect-square w-full animate-pulse rounded-[var(--radius-lg)] bg-surface-sunk/60">
        <div className="absolute top-1/2 left-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full bg-surface-sunk" />
      </div>
      <Card className="mt-4">
        <PersonRow size={48} />
      </Card>
    </div>
  );
}

export function EventSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="loading event"
      className="flex flex-col gap-5 pt-2"
    >
      <Bone className="h-3.5 w-16" />
      <div className="aspect-square w-full animate-pulse rounded-[var(--radius-lg)] bg-surface-sunk" />
      <Bone className="h-7 w-3/4" />
      <Bone className="h-3.5 w-1/2" />
      <div className="flex gap-2">
        <Bone className="h-12 w-36" />
        <Bone className="h-12 w-28" />
      </div>
      <Lines n={5} />
    </div>
  );
}

/** Forms (edit profile, new event, new offer). */
export function FormSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="loading"
      className="flex flex-col gap-5 pt-6"
    >
      <Bone className="h-8 w-40" />
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Bone className="h-3 w-20" />
          <div className="h-12 w-full animate-pulse rounded-[var(--radius-md)] bg-surface-sunk" />
        </div>
      ))}
    </div>
  );
}
