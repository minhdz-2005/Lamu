"use client";

import { useSearchParams } from "next/navigation";
import { OrganizationsPage } from "./OrganizationsPage";
import { organizationsFixtures, dialogFixtures, type OrganizationsState, type DialogState } from "./organizationsData";

interface OrganizationsPreviewProps { readonly children?: never; }

export function OrganizationsPreview({}: OrganizationsPreviewProps = {}) {
  const params = useSearchParams();
  const pageKey = params.get("organizationsPreview");
  const dialogKey = params.get("dialogPreview");
  const fixture = process.env.NODE_ENV === "development" && pageKey && Object.hasOwn(organizationsFixtures, pageKey) ? organizationsFixtures[pageKey as OrganizationsState] : organizationsFixtures.success;
  const dialogFixture = process.env.NODE_ENV === "development" && dialogKey && Object.hasOwn(dialogFixtures, dialogKey) ? dialogFixtures[dialogKey as DialogState] : undefined;
  return <OrganizationsPage key={`${fixture.state}:${dialogFixture?.state ?? "closed"}`} fixture={fixture} dialogFixture={dialogFixture} />;
}
