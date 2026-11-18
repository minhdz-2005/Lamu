import { Suspense } from "react";
import type { Metadata } from "next";
import { OrganizationDetailPage } from "@/features/organization-detail/OrganizationDetailPage";
import { OrganizationDetailLive } from "@/features/organization-detail/OrganizationDetailLive";
import { OrganizationDetailPreview } from "@/features/organization-detail/OrganizationDetailPreview";
import { detailCopy } from "@/features/organization-detail/detailData";

export const metadata: Metadata = { title: detailCopy.title };

interface OrganizationDetailRouteProps { readonly params: Promise<{ orgId: string }>; }

export default async function OrganizationDetailRoute({ params }: OrganizationDetailRouteProps) {
  const { orgId } = await params;
  if (process.env.NODE_ENV === "development") {
    return <Suspense fallback={<OrganizationDetailPage orgId={orgId} state="loading" />}><OrganizationDetailPreview orgId={orgId} /></Suspense>;
  }
  return <OrganizationDetailLive orgId={orgId} />;
}
