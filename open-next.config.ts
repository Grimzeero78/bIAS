import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * OpenNext → Cloudflare adapter configuration.
 * TrueMerit uses no ISR/SSG caching components (fully dynamic SPA + API),
 * so the default config is sufficient.
 */
export default defineCloudflareConfig({});
