import { auth, defineMcp } from "@lovable.dev/mcp-js";
import searchSwimmers from "./tools/search-swimmers";
import listUpcomingPrivateLessons from "./tools/list-upcoming-private-lessons";
import listActiveSessions from "./tools/list-active-sessions";
import getClassRoster from "./tools/get-class-roster";

// Build the issuer from the project ref so the OAuth issuer matches the direct
// supabase.co host that Supabase publishes in its discovery document.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "aquatic-dreams-mcp",
  title: "Aquatic Dreams Admin",
  version: "0.1.0",
  instructions:
    "Read-only tools for Aquatic Dreams Swim School staff. Use these to look up swimmers, active group sessions, class rosters, and upcoming private lessons. Data returned is scoped to the signed-in admin's permissions via row-level security.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [searchSwimmers, listUpcomingPrivateLessons, listActiveSessions, getClassRoster],
});
