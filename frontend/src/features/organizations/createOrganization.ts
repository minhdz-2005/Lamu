export function normalizeOrganizationName(value: string): string | null {
  const name = value.trim();
  return name && Array.from(name).length <= 100 ? name : null;
}
