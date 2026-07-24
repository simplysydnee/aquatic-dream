// Shared helper: build the public /manage/:token link for a membership.
export function buildManageLink(token: string): string {
  const base = Deno.env.get("PUBLIC_SITE_URL") || "https://aquaticdreamsswim.com";
  return `${base.replace(/\/$/, "")}/manage/${token}`;
}
