import { api } from "@/lib/api-helpers";
import { clearSessionCookie, getSessionUser } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

export async function POST() {
  return api(async () => {
    const user = await getSessionUser();
    if (user) await audit(user, "LOGOUT", "AUTH", user.id);
    await clearSessionCookie();
    return { loggedOut: true };
  });
}
