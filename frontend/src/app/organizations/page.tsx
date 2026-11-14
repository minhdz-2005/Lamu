import { Suspense } from "react";
import type { Metadata } from "next";
import { OrganizationsPage } from "@/features/organizations/OrganizationsPage";
import { OrganizationsPreview } from "@/features/organizations/OrganizationsPreview";
import { organizationsCopy, organizationsFixtures } from "@/features/organizations/organizationsData";

export const metadata: Metadata = { title: organizationsCopy.title };

interface OrganizationsRouteProps { readonly children?: never; }

export default function OrganizationsRoute({}: OrganizationsRouteProps) {
  if (process.env.NODE_ENV === "development") return <Suspense fallback={<OrganizationsPage fixture={organizationsFixtures.loading} />}><OrganizationsPreview /></Suspense>;
  return <OrganizationsPage />;
}
