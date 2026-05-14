import { RouteMap } from "../components/map";

type SearchParams = { route?: string | string[] };

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const raw = sp.route;
  const route = Array.isArray(raw) ? raw[0] : raw;

  return (
    <main className="app-shell">
      <RouteMap initialRouteId={route} />
    </main>
  );
}
