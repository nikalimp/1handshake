"use client";
import {
  cancelEventAdmin,
  closeOfferAdmin,
  deleteOfferAdmin,
  dismissMemberReports,
  hideOfferAdmin,
  keepOfferAdmin,
  newCheckinCodeAdmin,
  reviewEventAdmin,
} from "@/app/(admin)/admin/admin-actions";
import { Confirmed } from "@/components/admin/member-actions";

// Buttons for events, offers and member reports. Each opens a reason field and a confirm;
// the reason goes into the admin log.

export function EventReview({ id }: { id: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Confirmed label="approve" confirm="approve it? it goes on the public calendar and its check-in starts working" busyLabel="approving…" needReason={false} variant="primary" run={(r) => reviewEventAdmin(id, true, r)} />
      <Confirmed label="reject" confirm="reject it? the host sees your reason on the event" busyLabel="rejecting…" needReason run={(r) => reviewEventAdmin(id, false, r)} />
    </div>
  );
}

export function EventAdminControls({ id, review, cancelled }: { id: string; review: string; cancelled: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {!cancelled && review !== "approved" && (
        <Confirmed label="approve" confirm="approve it? it goes on the public calendar and its check-in starts working" busyLabel="approving…" needReason={false} variant="primary" run={(r) => reviewEventAdmin(id, true, r)} />
      )}
      {!cancelled && review !== "rejected" && (
        <Confirmed label="reject" confirm="reject it? the host sees your reason on the event" busyLabel="rejecting…" needReason run={(r) => reviewEventAdmin(id, false, r)} />
      )}
      {!cancelled && (
        <Confirmed label="cancel event" confirm="cancel it for everyone? it leaves the calendar and check-in stops" busyLabel="cancelling…" needReason variant="danger" run={(r) => cancelEventAdmin(id, r)} />
      )}
    </div>
  );
}

export function NewCheckinCode({ id }: { id: string }) {
  return <Confirmed label="new code" confirm="make a new check-in code? the old qr stops working" busyLabel="making…" needReason={false} run={() => newCheckinCodeAdmin(id)} />;
}

export function OfferAdminControls({ id, closed, hidden, flagged }: { id: string; closed: boolean; hidden: boolean; flagged: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {(hidden || flagged) && (
        <Confirmed
          label={hidden ? "show again" : "looks fine · keep"}
          confirm={hidden ? "show it to everyone again?" : "keep it? it's visible again and the reports close"}
          busyLabel="saving…"
          needReason={false}
          variant="secondary"
          run={(r) => keepOfferAdmin(id, r)}
        />
      )}
      {!hidden && <Confirmed label="hide" confirm="hide it? only the author sees it, with your reason" busyLabel="hiding…" needReason run={(r) => hideOfferAdmin(id, r)} />}
      {!closed && !hidden && <Confirmed label="close" confirm="close it? it stays on the card as closed" busyLabel="closing…" needReason={false} run={(r) => closeOfferAdmin(id, r)} />}
      <Confirmed label="delete" confirm="delete it for good? the author loses it too" busyLabel="deleting…" needReason variant="danger" run={(r) => deleteOfferAdmin(id, r)} />
    </div>
  );
}

export function DismissMemberReports({ id }: { id: string }) {
  return <Confirmed label="dismiss reports" confirm="close these reports without a ban?" busyLabel="saving…" needReason={false} variant="secondary" run={(r) => dismissMemberReports(id, r)} />;
}
