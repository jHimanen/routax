import * as Sentry from "@sentry/node";

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? "local",
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: 0,
    beforeSend(event) {
      if (event.request?.headers) {
        const headers = event.request.headers as Record<string, unknown>;
        headers.Authorization = undefined;
        headers.authorization = undefined;
        headers.cookie = undefined;
      }
      if (event.request?.data) {
        const data: Record<string, unknown> =
          typeof event.request.data === "string"
            ? (JSON.parse(event.request.data) as Record<string, unknown>)
            : (event.request.data as Record<string, unknown>);
        for (const field of ["start", "end"]) {
          const pt = data[field] as { lat?: number; lng?: number } | undefined;
          if (pt?.lat != null) pt.lat = Math.round(pt.lat * 100) / 100;
          if (pt?.lng != null) pt.lng = Math.round(pt.lng * 100) / 100;
        }
        event.request.data = data;
      }
      return event;
    },
  });
}
