import { Suspense } from "react";

import { OrganizerPage } from "@/features/organizer/OrganizerPage";

export default function OrganizerRoute() {
  return (
    <Suspense fallback={null}>
      <OrganizerPage />
    </Suspense>
  );
}
