import { RouteMap } from "../components/map";

export default function HomePage(): React.JSX.Element {
  return (
    <main className="app-shell">
      <header className="app-header">Routax</header>
      <RouteMap />
    </main>
  );
}
