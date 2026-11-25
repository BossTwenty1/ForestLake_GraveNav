import { NextResponse } from "next/server";
import { getCurrentStaff } from "@/lib/auth";
import { validateStaffPassword } from "@/lib/staff-password";
import { getServerSupabase } from "@/lib/supabase/server";
import { getServerServiceSupabase } from "@/lib/supabase/server-admin";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const actorClient = await getServerSupabase();
  if (!actorClient) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 503, headers: NO_STORE_HEADERS });
  }

  const { data: { user } } = await actorClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const staff = await getCurrentStaff();
  if (!staff) {
    return NextResponse.json({ error: "An active GraveNav account is required" }, { status: 403, headers: NO_STORE_HEADERS });
  }
  if (staff.role !== "ADMIN" || staff.accountStatus !== "ACTIVE" || !staff.isActive) {
    return NextResponse.json(
      { error: "Only active ADMIN accounts may provision accounts" },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  }

  const adminClient = getServerServiceSupabase();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Protected Auth Admin provisioning is not configured for this environment" },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }

  let body: {
    email?: string;
    username?: string;
    role?: string;
    password?: string;
    activateImmediately?: boolean;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "A valid JSON request body is required" }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const email = body.email?.trim().toLowerCase() || "";
  const username = body.username?.trim() || "";
  const role = body.role?.trim().toUpperCase() || "";
  const password = typeof body.password === "string" ? body.password : "";
  const activateImmediately = body.activateImmediately !== false;

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400, headers: NO_STORE_HEADERS });
  }
  if (username.length < 2 || username.length > 80) {
    return NextResponse.json({ error: "Username must be between 2 and 80 characters." }, { status: 400, headers: NO_STORE_HEADERS });
  }
  if (role !== "ADMIN" && role !== "MANAGER") {
    return NextResponse.json({ error: "Role must be ADMIN or MANAGER." }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const passwordCheck = validateStaffPassword(password);
  if (!passwordCheck.valid) {
    return NextResponse.json(
      { error: passwordCheck.error || "Enter a stronger password." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username, role },
  });

  if (createError || !created.user) {
    const alreadyExists = /already|registered|exists/i.test(createError?.message || "");
    return NextResponse.json(
      {
        error: alreadyExists
          ? "An account with this email address already exists."
          : "The staff authentication account could not be created. Check settings and try again.",
      },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const accountId = created.user.id;
  const { error: accountError } = await actorClient.rpc("admin_create_account", {
    p_account_id: accountId,
    p_username: username,
    p_role_name: role,
  });

  if (accountError) {
    const { error: cleanupError } = await adminClient.auth.admin.deleteUser(accountId);
    if (cleanupError) {
      return NextResponse.json(
        { error: "The account record could not be created and the Auth user needs administrator cleanup." },
        { status: 500, headers: NO_STORE_HEADERS },
      );
    }
    const duplicateName = /duplicate|unique/i.test(accountError.message || "");
    return NextResponse.json(
      {
        error: duplicateName
          ? "That username is already in use. Choose another display name."
          : "The staff account could not be created because the account record failed to save.",
      },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  let accountStatus: "ACTIVE" | "PENDING" = "PENDING";
  let activationNotice: string | null = null;

  if (activateImmediately) {
    const { error: approveError } = await actorClient.rpc("admin_approve_account", {
      p_account_id: accountId,
    });
    if (!approveError) {
      const { error: activateError } = await actorClient.rpc("admin_activate_account", {
        p_account_id: accountId,
      });
      if (!activateError) {
        accountStatus = "ACTIVE";
      } else {
        activationNotice = "Account created and approved, but still needs activation below.";
      }
    } else {
      activationNotice = "Account created as PENDING. Click Approve and Activate below to enable sign-in.";
    }
  }

  return NextResponse.json(
    {
      ok: true,
      accountId,
      email,
      username,
      role,
      accountStatus,
      notice: activationNotice,
    },
    { status: 200, headers: NO_STORE_HEADERS },
  );
}
