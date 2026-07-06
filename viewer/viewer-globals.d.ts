// Globals the offline archive wires up around the bundled viewer: the archiver
// injects the base64 map bundle as `window.__CHARTBUNDLE_DATA__`, and the viewer
// exposes its entry point as `window.initChartbundleViewer` for the page's
// inline bootstrap script to call.
interface Window {
  __CHARTBUNDLE_DATA__?: string;
  initChartbundleViewer?: (opts: ChartbundleOpts) => void;
}

interface ChartbundleOpts {
  type: string;
  bg: number;
  debug?: boolean;
  min_z: number;
  max_z: number;
  initial_z: number;
  cdn: string;
  icons: Record<string, string>;
}
