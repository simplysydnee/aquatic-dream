// Centralized helpers for displaying payment-related statuses across admin views.
// Two independent fields exist on swim_enrollments:
//   - payment_status: registration fee ($45)
//   - session_fee_status: session tuition ($240)

export function formatPaymentStatus(status: string | null | undefined): string {
  if (!status) return "—";
  switch (status) {
    case "due_day_1":
      return "Due day 1";
    case "not_required":
      return "N/A";
    case "paid":
      return "Paid";
    case "unpaid":
      return "Unpaid";
    case "refunded":
      return "Refunded";
    case "waived":
      return "Waived";
    case "comp":
      return "Comp";
    case "flagged_no_pay":
      return "Unpaid (flagged)";
    default:
      return status.charAt(0).toUpperCase() + status.slice(1);
  }
}

// Human-readable explanation for each payment status, shown in tooltips.
export function paymentStatusTooltip(status: string | null | undefined): string | null {
  switch (status) {
    case "unpaid":
      return "Payment has not been received yet. A link may or may not have been emailed.";
    case "flagged_no_pay":
      return "Payment link was sent more than 22 hours ago and the lesson is today, but payment is still outstanding. The system flagged this for admin follow-up.";
    case "due_day_1":
      return "Session fee is due in person on the first day of class.";
    case "paid":
      return "Payment received and recorded.";
    case "comp":
      return "Comped / waived — no charge.";
    case "refunded":
      return "Payment was refunded.";
    default:
      return null;
  }
}

export function paymentStatusBadgeClass(status: string | null | undefined): string {
  switch (status) {
    case "paid":
      return "bg-green-100 text-green-700 border-green-300";
    case "due_day_1":
    case "unpaid":
      return "bg-amber-100 text-amber-700 border-amber-300";
    case "refunded":
      return "bg-red-100 text-red-700 border-red-300";
    case "comp":
      return "bg-blue-100 text-blue-700 border-blue-300";
    case "waived":
    case "not_required":
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}
