import { App } from "@/components/App";
import { isLiveEnabled } from "@/lib/api/live";

export default function Home() {
  return <App liveEnabled={isLiveEnabled()} />;
}
