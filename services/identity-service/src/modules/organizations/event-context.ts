// Only test composition may inject a fixture. The normal application has no
// Event adapter in P5; nothing in environment configuration enables a fixture.
export const EVENT_CONTEXT = Symbol("EVENT_CONTEXT");
export interface EventContextResolver {
  resolve(eventId: string): Promise<unknown>;
}
export const ORGANIZATION_CLOCK = Symbol("ORGANIZATION_CLOCK");
