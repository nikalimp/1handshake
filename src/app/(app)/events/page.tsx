import { redirect } from "next/navigation";

// There is no list of events in the app: events live in the feed, and the public calendar is on
// 1handshake.com/events. Old links land on the feed.
export default function EventsPage() {
  redirect("/feed");
}
