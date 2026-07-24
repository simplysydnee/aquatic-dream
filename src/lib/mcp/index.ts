import { auth, defineMcp } from "@lovable.dev/mcp-js";
import searchSwimmers from "./tools/search-swimmers";
import listUpcomingPrivateLessons from "./tools/list-upcoming-private-lessons";
import listActiveSessions from "./tools/list-active-sessions";
import getClassRoster from "./tools/get-class-roster";
import listOpenPrivateSlots from "./tools/list-open-private-slots";
import listPastPrivateFamilies from "./tools/list-past-private-families";
import sendPrivateOpeningsSms from "./tools/send-private-openings-sms";
import listStandingSlots from "./tools/list-standing-slots";
import listMemberships from "./tools/list-memberships";
import getMembership from "./tools/get-membership";
import getMembershipBillingStatus from "./tools/get-membership-billing-status";
import readRepoFile from "./tools/read-repo-file";
import listRepoDir from "./tools/list-repo-dir";
import cancelMembership from "./tools/cancel-membership";
import setMembershipStatus from "./tools/set-membership-status";
import moveMembershipSlot from "./tools/move-membership-slot";
import updateStandingSlot from "./tools/update-standing-slot";
import cancelPrivateLessonOccurrence from "./tools/cancel-private-lesson-occurrence";
import reassignPrivateLessonInstructor from "./tools/reassign-private-lesson-instructor";
import reschedulePrivateLessonOccurrence from "./tools/reschedule-private-lesson-occurrence";
import updateSwimEnrollment from "./tools/update-swim-enrollment";


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
  tools: [
    searchSwimmers,
    listUpcomingPrivateLessons,
    listActiveSessions,
    getClassRoster,
    listOpenPrivateSlots,
    listPastPrivateFamilies,
    sendPrivateOpeningsSms,
    listStandingSlots,
    listMemberships,
    getMembership,
    getMembershipBillingStatus,
    readRepoFile,
    listRepoDir,
    cancelMembership,
    setMembershipStatus,
    moveMembershipSlot,
    updateStandingSlot,
    cancelPrivateLessonOccurrence,
    reassignPrivateLessonInstructor,
    reschedulePrivateLessonOccurrence,
    updateSwimEnrollment,
  ],

});
