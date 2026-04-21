import type { RoutingProfile } from "@via/shared";

const defaultProfile: RoutingProfile = {
  avoidTraffic: 0.5,
  preferQuietSurfaces: 0.5,
  maxGradient: 10,
};

export default function HomePage(): React.JSX.Element {
  return (
    <main>
      <h1>Via</h1>
      <p>Cycling route planner — coming soon.</p>
      <pre>{JSON.stringify(defaultProfile, null, 2)}</pre>
    </main>
  );
}
