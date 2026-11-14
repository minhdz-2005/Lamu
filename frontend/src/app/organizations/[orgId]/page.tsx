import { Suspense } from "react";
import type { Metadata } from "next";
import { OrganizationDetailPage } from "@/features/organization-detail/OrganizationDetailPage";
import { OrganizationDetailPreview } from "@/features/organization-detail/OrganizationDetailPreview";
import { createDetailFixture, detailCopy } from "@/features/organization-detail/detailData";

export const metadata: Metadata = { title: detailCopy.title };

interface OrganizationDetailRouteProps { readonly params: Promise<{ orgId: string }>; }

export default async function OrganizationDetailRoute({ params }: OrganizationDetailRouteProps) {
  const { orgId } = await params;
  if (process.env.NODE_ENV === "development") return <Suspense fallback={<OrganizationDetailPage orgId={orgId} fixture={createDetailFixture(orgId, "loading")} />}><OrganizationDetailPreview orgId={orgId} /></Suspense>;
  return <OrganizationDetailPage key={orgId} orgId={orgId} />;
}
