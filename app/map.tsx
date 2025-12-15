import { Redirect } from 'expo-router';

// Kept for backwards compatibility in case anything links to /map.
// The actual map screen now lives inside the (tabs) navigator so the bottom tab bar stays visible.
export default function MapRedirect() {
  return <Redirect href="/(tabs)/map" />;
}


