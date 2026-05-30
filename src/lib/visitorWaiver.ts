import { supabase } from "@/integrations/supabase/client";
import {
  WAIVER_VERSION,
  TOS_VERSION,
  PRIVACY_POLICY_VERSION,
} from "@/components/swim-enrollment/legal-content";
import type { LegalAgreementData } from "@/components/swim-enrollment/LegalAgreements";

export interface SwimmerCovered {
  first_name: string;
  last_name: string;
  dob?: string | null;
  relationship?: string | null;
}

export interface SubmitVisitorWaiverArgs {
  legal: LegalAgreementData;
  signerFirstName: string;
  signerLastName: string;
  signerEmail: string;
  signerPhone?: string | null;
  swimmers: SwimmerCovered[];
  source: "public" | "kiosk";
}

export async function submitVisitorWaiver(args: SubmitVisitorWaiverArgs): Promise<{ id: string }> {
  const { data, error } = await supabase.functions.invoke("submit-visitor-waiver", {
    body: {
      signerFirstName: args.signerFirstName.trim(),
      signerLastName: args.signerLastName.trim(),
      signerEmail: args.signerEmail.trim().toLowerCase(),
      signerPhone: args.signerPhone?.trim() || null,
      swimmers: args.swimmers,
      source: args.source,
      legal: {
        signatureText: args.legal.signatureText,
        waiverAccepted: args.legal.waiverAccepted,
        termsAccepted: args.legal.termsAccepted,
        privacyPolicyAccepted: args.legal.privacyPolicyAccepted,
        photoReleaseAccepted: args.legal.photoReleaseAccepted,
        emergencyContactFirstName: args.legal.emergencyContactFirstName,
        emergencyContactLastName: args.legal.emergencyContactLastName,
        emergencyContactName: args.legal.emergencyContactName,
        emergencyContactPhone: args.legal.emergencyContactPhone,
        emergencyContactRelationship: args.legal.emergencyContactRelationship,
      },
      waiverVersion: WAIVER_VERSION,
      tosVersion: TOS_VERSION,
      privacyPolicyVersion: PRIVACY_POLICY_VERSION,
    },
  });

  if (error) throw error;
  if (!data?.id) throw new Error((data as any)?.error || "Could not save waiver");

  return { id: data.id as string };
}


export async function resendVisitorWaiverCopy(waiverId: string): Promise<void> {
  const { data: waiver, error } = await supabase
    .from("visitor_waivers")
    .select("*")
    .eq("id", waiverId)
    .maybeSingle();
  if (error || !waiver) throw error || new Error("Waiver not found");

  await supabase.functions.invoke("send-transactional-email", {
    body: {
      templateName: "visitor-waiver-copy",
      recipientEmail: (waiver as any).signer_email,
      idempotencyKey: `visitor-waiver-${waiverId}-resend-${Date.now()}`,
      templateData: {
        signerName: `${(waiver as any).signer_first_name} ${(waiver as any).signer_last_name}`.trim(),
        signedAt: (waiver as any).signed_at,
        swimmers: (waiver as any).swimmers || [],
        photoRelease: (waiver as any).photo_release_accepted,
        emergencyContactName: `${(waiver as any).emergency_contact_first_name || ""} ${(waiver as any).emergency_contact_last_name || ""}`.trim(),
        emergencyContactPhone: (waiver as any).emergency_contact_phone,
        emergencyContactRelationship: (waiver as any).emergency_contact_relationship,
        waiverVersion: (waiver as any).waiver_version,
        tosVersion: (waiver as any).tos_version,
        privacyPolicyVersion: (waiver as any).privacy_policy_version,
      },
    },
  });
}
