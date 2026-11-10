import { existsSync } from "node:fs";
import { join } from "node:path";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminCemeteryMapPage } from "@/components/admin/admin-page-content";

export default function AdminCemeteryMapRoute() { return <AdminShell active="Cemetery Map"><AdminCemeteryMapPage hasPlanningMap={existsSync(join(process.cwd(), "public", "phase2-viewer", "index.html"))} /></AdminShell>; }
