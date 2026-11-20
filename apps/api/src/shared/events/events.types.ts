/** Real-time cache-invalidation / presence signals (Phase 0 foundation). */
export const AppEvent = {
  SystemPing: "system.ping",
  SitePublished: "site.published",
} as const;

export type AppEvent = (typeof AppEvent)[keyof typeof AppEvent];

export interface EventPayloadMap {
  "system.ping": { at: string };
  "site.published": { at: string };
}
