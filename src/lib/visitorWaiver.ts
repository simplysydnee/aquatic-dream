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
  const { data: userData } = await supabase.auth.getUser();
  const staffId =
    args.source === "kiosk" ? userData?.user?.id ?? null : null;

  const { data, error } = await supabase
    .from("visitor_waivers")
    .insert({
      signer_first_name: args.signerFirstName.trim(),
      signer_last_name: args.signerLastName.trim(),
      signer_email: args.signerEmail.trim().toLowerCase(),
      signer_phone: args.signerPhone?.trim() || null,
      signature_text: args.legal.signatureText,
      waiver_accepted: args.legal.waiverAccepted,
      terms_accepted: args.legal.termsAccepted,
      privacy_policy_accepted: args.legal.privacyPolicyAccepted,
      photo_release_accepted: args.legal.photoReleaseAccepted === "yes",
      emergency_contact_first_name: args.legal.emergencyContactFirstName,
      emergency_contact_last_name: args.legal.emergencyContactLastName,
      emergency_contact_phone: args.legal.emergencyContactPhone,
      emergency_contact_relationship: args.legal.emergencyContactRelationship,
      swimmers: args.swimmers as any,
      waiver_version: WAIVER_VERSION,
      tos_version: TOS_VERSION,
      privacy_policy_version: PRIVACY_POLICY_VERSION,
      source: args.source,
      completed_by_staff_id: staffId,
    } as any)
    .select("id")
    .single();

  if (error) throw error;

  // Fire-and-await email confirmation; failures are non-fatal for the user.
  try {
    await supabase.functions.invoke("send-transactional-email", {
      body: {
        templateName: "visitor-waiver-copy",
        recipientEmail: args.signerEmail.trim().toLowerCase(),
        idempotencyKey: `visitor-waiver-${data.id}`,
        templateData: {
          signerName: `${args.signerFirstName} ${args.signerLastName}`.trim(),
          signedAt: new Date().toISOString(),
          swimmers: args.swimmers,
          photoRelease: args.legal.photoReleaseAccepted === "yes",
          emergencyContactName: args.legal.emergencyContactName,
          emergencyContactPhone: args.legal.emergencyContactPhone,
          emergencyContactRelationship: args.legal.emergencyContactRelationship,
          waiverVersion: WAIVER_VERSION,
          tosVersion: TOS_VERSION,
          privacyPolicyVersion: PRIVACY_POLICY_VERSION,
        },
      },
    });
    await supabase
      .from("visitor_waivers")
      .update({ email_sent_at: new Date().toISOString() } as any)
      .eq("id", data.id);
  } catch (e) {
    console.warn("Visitor waiver email send failed", e);
  }

  return { id: data.id };
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
