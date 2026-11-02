import { EventDetailPage } from "@/features/event-detail/EventDetailPage";

const DEGRADED_SOURCES = ["event", "organization", "availability"];

export default async function EventDetailRoute({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const raw = (await searchParams).degraded;
  // Nút chặn nguồn để demo nhánh degraded: ?degraded=availability,organization
  const degraded = (Array.isArray(raw) ? raw.join(",") : raw)
    ?.split(",")
    .filter((token) => DEGRADED_SOURCES.includes(token))
    .join(",");
  return <EventDetailPage slug={slug} degradedParam={degraded || undefined} />;
}
