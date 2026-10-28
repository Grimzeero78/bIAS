import { staffPasswordHint } from "@/lib/auth";
import { api } from "@/lib/api-helpers";
import { ensureSeed } from "@/lib/seed";

export const runtime = "nodejs";

/** Public password hints rendered on the login card (stems only — never full secrets). */
export async function GET() {
  return api(async () => {
    await ensureSeed();
    return {
      hints: {
        admin: staffPasswordHint("ADMIN"),
        interviewer: staffPasswordHint("INTERVIEWER"),
      },
    };
  });
}
