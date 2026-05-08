import { LogoMark } from "../components/LogoMark";
import { RoutesNavLink } from "../components/RoutesNavLink";
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
      <header className="app-header">
        <LogoMark size={28} />
        <span className="app-header-wordmark">Routax</span>
        <span className="app-header-divider" />
        <RoutesNavLink />
      </header>
      <RouteMap initialRouteId={route} />
    </main>
  );
}
