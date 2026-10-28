import { api } from "@/lib/api-helpers";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  return api(async () => {
    const user = await requireUser();
    return { user };
  });
}
