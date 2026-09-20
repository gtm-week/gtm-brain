# Dashboard frontend

React with shadcn/ui Button, Badge, Tooltip and Collapsible components, Radix primitives,
Lucide icons and Tailwind CSS. The checked-in shadcn components come from the official
`new-york` registry at https://ui.shadcn.com/r/styles/new-york/ and retain the MIT license.

Run `npm ci --prefix frontend/dashboard`, then `npm run build --prefix frontend/dashboard`.
Commit source, package-lock.json and generated assets under
`plugins/gtm-os/scripts/gtm-os-render/ui/` together. Users do not run npm; the Node renderer
copies the prebuilt assets into the read-only dashboard. No CDN, remote fonts or external
runtime scripts are loaded.

The Overview is rendered with React components. Existing evidence readers remain in the
HTML client and share its navigation, source formatting and record identity through the
small GtmDashboard bridge. All primary links use existing read-only navigation handlers;
Codex remains the place to make changes. The HTML Overview remains as a fallback if the
bundle cannot load. Tailwind preflight is disabled and utilities are scoped to dashboard-ui
so they do not reset existing evidence views. Shared visual tokens also style those views.

Browser verification must exercise the bundle, not just the legacy DOM harness. The
existing harness continues to verify underlying data access and navigation behavior.
