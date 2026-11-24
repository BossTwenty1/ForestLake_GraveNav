import { BrandLockup } from "@/components/brand-lockup";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { UnauthorizedActions } from "@/components/admin/unauthorized-actions";
import { getCurrentStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Access Restricted | GraveNav", robots: { index: false, follow: false } };

export default async function UnauthorizedPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string | string[] }>;
}) {
  const params = await searchParams;
  const staff = await getCurrentStaff();
  const isActiveStaff = Boolean(staff?.isActive && staff.accountStatus === "ACTIVE");
  const isRoleBlocked = isActiveStaff || params.reason === "role";

  return (
    <main className="admin-login-page" id="main-content" tabIndex={-1}>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <div className="admin-login-card">
        <div className="admin-login-topline">
          <BrandLockup />
          <ThemeToggle compact />
        </div>
        <Card>
          <CardContent>
            <div className="unauthorized-card">
              <h1>{isRoleBlocked ? "Administrator permission required" : "Administrator access unavailable"}</h1>
              <p>
                {isRoleBlocked
                  ? "This section requires an active ADMIN account. Your current MANAGER account can continue using records, plots, owners, map, and reports."
                  : staff?.accountStatus === "PENDING"
                    ? "Your staff account is pending administrator approval and activation."
                    : "Your account is not an active ADMIN or MANAGER account. Contact an active ADMIN if your access should be restored."}
              </p>
              <Alert icon="shield" title="Permission check enforced" variant="warning">
                {isRoleBlocked
                  ? "Role-based access control restricts account management, recovery, and system actions to ADMIN accounts."
                  : "This page is shown for pending, suspended, revoked, inactive, or unassigned accounts."}
              </Alert>
              <UnauthorizedActions isActiveStaff={isActiveStaff} />
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
