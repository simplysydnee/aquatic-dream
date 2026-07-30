// Helpers to detect and reuse an existing visitor waiver for a swimmer,
// matched by first name + last name + date of birth (within the last 12 months).
import { supabase } from "@/integrations/supabase/client";
import {
  WAIVER_VERSION,
  TOS_VERSION,
  PRIVACY_POLICY_VERSION,
} from "@/components/swim-enrollment/legal-content";
import type { LegalAgreementData } from "@/components/swim-enrollment/LegalAgreements";

export interface ActiveWaiver {
  waiver_id: string;
  signed_at: string;
  signer_first_name: string;
  signer_last_name: string;
  signer_email: string;
  signature_text: string;
  photo_release_accepted: boolean;
  emergency_contact_first_name: string;
  emergency_contact_last_name: string;
  emergency_contact_phone: string;
  emergency_contact_relationship: string;
}

function isoDob(d: Date | string): string {
  if (typeof d === "string") return d.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Returns the most recent active waiver row for the swimmer, or null. */
export async function lookupActiveWaiver(
  firstName: string,
  lastName: string,
  dob: Date | string,
): Promise<ActiveWaiver | null> {
  const f = firstName.trim();
  const l = lastName.trim();
  if (!f || !l || !dob) return null;
  const { data, error } = await supabase.rpc("get_active_waiver_for_swimmer", {
    _first: f,
    _last: l,
    _dob: isoDob(dob),
  });
  if (error) {
    console.warn("lookupActiveWaiver error", error);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return (row as ActiveWaiver) ?? null;
}

export interface SwimmerWaiverStatus {
  /** True only when a waiver is confirmed on file. Never true for "unknown". */
  onFile: boolean;
  /** Waiver id when a visitor waiver row backs the match, else null. */
  waiverId: string | null;
  /** Full waiver row when available, so emergency contact can be reused. */
  waiver: ActiveWaiver | null;
}

/**
 * The single waiver resolver for every program. A waiver belongs to a swimmer,
 * so this takes first name, last name and DOB only, with parent email/phone as
 * optional tie-breakers for legacy records. There is deliberately no plan or
 * program parameter: private, adult and group all resolve identically.
 */
export async function resolveSwimmerWaiver(args: {
  firstName: string;
  lastName: string;
  dob: Date | string | null | undefined;
  parentEmail?: string | null;
  parentPhone?: string | null;
}): Promise<SwimmerWaiverStatus> {
  const first = (args.firstName || "").trim();
  const last = (args.lastName || "").trim();
  if (!first) return { onFile: false, waiverId: null, waiver: null };

  // Primary: the visitor waiver row, which also carries emergency contact.
  if (last && args.dob) {
    const waiver = await lookupActiveWaiver(first, last, args.dob);
    if (waiver) return { onFile: true, waiverId: waiver.waiver_id, waiver };
  }

  // Fallback: the family-wide rule, which also counts waivers signed inside an
  // enrollment or a private lesson booking. No waiver id exists in that case.
  const { data, error } = await supabase.rpc("swimmer_has_waiver_on_file", {
    _first: first,
    _last: last || null,
    _dob: args.dob ? isoDob(args.dob) : null,
    _parent_email: args.parentEmail || null,
    _parent_phone: args.parentPhone || null,
  });
  if (error) {
    console.warn("resolveSwimmerWaiver error", error);
    return { onFile: false, waiverId: null, waiver: null };
  }
  return { onFile: !!data, waiverId: null, waiver: null };
}

/** Build a synthetic LegalAgreementData from a stored waiver so flows can skip the form. */
export function legalDataFromWaiver(w: ActiveWaiver): LegalAgreementData {
  const ecName = `${w.emergency_contact_first_name || ""} ${w.emergency_contact_last_name || ""}`.trim();
  return {
    signatureText: w.signature_text || `${w.signer_first_name} ${w.signer_last_name}`.trim(),
    waiverAccepted: true,
    termsAccepted: true,
    privacyPolicyAccepted: true,
    photoReleaseAccepted: w.photo_release_accepted ? "yes" : "no",
    emergencyContactFirstName: w.emergency_contact_first_name || "",
    emergencyContactLastName: w.emergency_contact_last_name || "",
    emergencyContactName: ecName,
    emergencyContactPhone: w.emergency_contact_phone || "",
    emergencyContactRelationship: w.emergency_contact_relationship || "",
  } as LegalAgreementData;
}

/**
 * Backfill: write a visitor_waivers row for this swimmer so future enrollments
 * (in either flow) auto-detect the waiver. Safe to call on every signed legal step;
 * if it fails (network/permission), the flow continues — this is best-effort.
 */
export async function backfillVisitorWaiver(args: {
  legal: LegalAgreementData;
  signerEmail: string;
  child: { firstName: string; lastName: string; dob: Date | string };
}): Promise<void> {
  try {
    const ecFirst = args.legal.emergencyContactFirstName || "";
    const ecLast = args.legal.emergencyContactLastName || "";
    await supabase.from("visitor_waivers").insert({
      signer_first_name: args.legal.signatureText.split(" ")[0] || "",
      signer_last_name: args.legal.signatureText.split(" ").slice(1).join(" ") || "",
      signer_email: args.signerEmail.trim().toLowerCase(),
      signer_phone: null,
      signature_text: args.legal.signatureText,
      waiver_accepted: args.legal.waiverAccepted,
      terms_accepted: args.legal.termsAccepted,
      privacy_policy_accepted: args.legal.privacyPolicyAccepted,
      photo_release_accepted: args.legal.photoReleaseAccepted === "yes",
      emergency_contact_first_name: ecFirst,
      emergency_contact_last_name: ecLast,
      emergency_contact_phone: args.legal.emergencyContactPhone || "",
      emergency_contact_relationship: args.legal.emergencyContactRelationship || "",
      swimmers: [
        {
          first_name: args.child.firstName.trim(),
          last_name: args.child.lastName.trim(),
          dob: isoDob(args.child.dob),
        },
      ],
      waiver_version: WAIVER_VERSION,
      tos_version: TOS_VERSION,
      privacy_policy_version: PRIVACY_POLICY_VERSION,
      source: "enrollment_flow",
    } as any);
  } catch (e) {
    console.warn("backfillVisitorWaiver failed (non-fatal)", e);
  }
}
