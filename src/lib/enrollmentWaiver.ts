import { supabase } from "@/integrations/supabase/client";
import {
  WAIVER_VERSION,
  TOS_VERSION,
  PRIVACY_POLICY_VERSION,
} from "@/components/swim-enrollment/legal-content";
import type { LegalAgreementData } from "@/components/swim-enrollment/LegalAgreements";

export interface EnrollmentWaiverRow {
  id: string;
  parent_name: string;
  parent_email: string;
  child_name: string;
  swim_level: string;
  payment_status: string;
  is_first_time: boolean;
  waiver_signed_at: string | null;
  session_name: string | null;
  session_day: string | null;
  session_start_time: string | null;
  session_start_date: string | null;
}

export async function fetchEnrollmentByWaiverToken(
  token: string,
): Promise<EnrollmentWaiverRow | null> {
  const { data, error } = await supabase.rpc(
    "get_swim_enrollment_by_waiver_token" as any,
    { _token: token },
  );
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return (row as EnrollmentWaiverRow) || null;
}

export async function submitEnrollmentWaiver(args: {
  token: string;
  enrollmentId: string;
  parentEmail: string;
  data: LegalAgreementData;
}) {
  const { error: agErr } = await supabase
    .from("enrollment_agreements")
    .insert({
      enrollment_id: args.enrollmentId,
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
    "mark_swim_enrollment_waiver_signed" as any,
    { _token: args.token },
  );
  if (markErr) throw markErr;
}
