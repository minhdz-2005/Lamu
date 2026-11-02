import { Suspense } from "react";

import { EventListPage } from "@/features/event-discovery/EventListPage";

export default function EventsRoute() {
  return (
    <Suspense fallback={null}>
      <EventListPage />
    </Suspense>
  );
}
