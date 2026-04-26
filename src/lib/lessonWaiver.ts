import { supabase } from "@/integrations/supabase/client";
import {
  WAIVER_VERSION,
  TOS_VERSION,
  PRIVACY_POLICY_VERSION,
} from "@/components/swim-enrollment/legal-content";
import type { LegalAgreementData } from "@/components/swim-enrollment/LegalAgreements";

export interface LessonWaiverBooking {
  id: string;
  parent_name: string;
  parent_email: string;
  child_name: string | null;
  lesson_type: string;
  waiver_signed_at: string | null;
  instructor_name?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  series_start?: string | null;
  series_end?: string | null;
  recurring?: boolean | null;
  next_occurrence_date?: string | null;
  next_payment_status?: string | null;
  next_checkout_url?: string | null;
}

export async function fetchLessonBookingByToken(
  token: string,
): Promise<LessonWaiverBooking | null> {
  // Try the richer summary RPC first; fall back to the original on any error.
  const summary = await supabase.rpc(
    "get_lesson_booking_summary_by_token" as any,
    { _token: token },
  );
  if (!summary.error && summary.data) {
    const row = Array.isArray(summary.data) ? summary.data[0] : summary.data;
    if (row) return row as LessonWaiverBooking;
  }
  const { data, error } = await supabase.rpc(
    "get_lesson_booking_by_waiver_token" as any,
    { _token: token },
  );
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row as LessonWaiverBooking) || null;
}

export async function submitLessonWaiver(args: {
  token: string;
  bookingId: string;
  parentEmail: string;
  data: LegalAgreementData;
}) {
  const { error: agErr } = await supabase
    .from("enrollment_agreements")
    .insert({
      lesson_booking_id: args.bookingId,
      signer_name: args.data.signatureText,
      signer_email: args.parentEmail,
      signature_text: args.data.signatureText,
      waiver_accepted: args.data.waiverAccepted,
      privacy_policy_accepted: args.data.privacyPolicyAccepted,
      terms_accepted: args.data.termsAccepted,
      photo_release_accepted: args.data.photoReleaseAccepted === "yes",
      emergency_contact_name: args.data.emergencyContactName,
      emergency_contact_phone: args.data.emergencyContactPhone,
      emergency_contact_relationship: args.data.emergencyContactRelationship,
      waiver_version: WAIVER_VERSION,
      tos_version: TOS_VERSION,
      privacy_policy_version: PRIVACY_POLICY_VERSION,
    } as any);
  if (agErr) throw agErr;

  const { error: markErr } = await supabase.rpc(
    "mark_lesson_waiver_signed" as any,
    { _token: args.token },
  );
  if (markErr) throw markErr;
}
