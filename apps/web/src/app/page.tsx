import { ViaMap } from "../components/map";

export default function HomePage(): React.JSX.Element {
  return (
    <main className="app-shell">
      <header className="app-header">Via</header>
      <ViaMap />
    </main>
  );
}
