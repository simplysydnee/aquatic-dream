/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
}

import { template as sessionPaymentLink } from './session-payment-link.tsx'
import { template as sessionWelcome } from './session-welcome.tsx'
import { template as registrationFeePaymentLink } from './registration-fee-payment-link.tsx'
import { template as enrollmentConfirmation } from './enrollment-confirmation.tsx'
import { template as lessonReminder } from './lesson-reminder.tsx'
import { template as earlyAccessInvite } from './early-access-invite.tsx'
import { template as lessonRequestReply } from './lesson-request-reply.tsx'
import { template as lessonRequestAcknowledgment } from './lesson-request-acknowledgment.tsx'
import { template as instructorSchedule } from './instructor-schedule.tsx'
import { template as lessonBookingConfirmation } from './lesson-booking-confirmation.tsx'
import { template as adminFreeform } from './admin-freeform.tsx'
import { template as lessonCancellation } from './lesson-cancellation.tsx'
import { template as internalLessonRequestAlert } from './internal-lesson-request-alert.tsx'
import { template as internalJobApplicationAlert } from './internal-job-application-alert.tsx'
import { template as enrollmentWaiverLink } from './enrollment-waiver-link.tsx'
import { template as visitorWaiverCopy } from './visitor-waiver-copy.tsx'
import { template as waitlistConfirmation } from './waitlist-confirmation.tsx'
import { template as waitlistOwnerAlert } from './waitlist-owner-alert.tsx'
import { template as cashReceipt } from './cash-receipt.tsx'
import { template as privateLessonRescheduled } from './private-lesson-rescheduled.tsx'





export const TEMPLATES: Record<string, TemplateEntry> = {
  'session-payment-link': sessionPaymentLink,
  'session-welcome': sessionWelcome,
  'registration-fee-payment-link': registrationFeePaymentLink,
  'enrollment-confirmation': enrollmentConfirmation,
  'lesson-reminder': lessonReminder,
  'early-access-invite': earlyAccessInvite,
  'lesson-request-reply': lessonRequestReply,
  'lesson-request-acknowledgment': lessonRequestAcknowledgment,
  'instructor-schedule': instructorSchedule,
  'lesson-booking-confirmation': lessonBookingConfirmation,
  'admin-freeform': adminFreeform,
  'lesson-cancellation': lessonCancellation,
  'internal-lesson-request-alert': internalLessonRequestAlert,
  'internal-job-application-alert': internalJobApplicationAlert,
  'enrollment-waiver-link': enrollmentWaiverLink,
  'visitor-waiver-copy': visitorWaiverCopy,
  'waitlist-confirmation': waitlistConfirmation,
  'waitlist-owner-alert': waitlistOwnerAlert,
  'cash-receipt': cashReceipt,
  'private-lesson-rescheduled': privateLessonRescheduled,
}

