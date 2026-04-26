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
import { template as enrollmentConfirmation } from './enrollment-confirmation.tsx'
import { template as lessonReminder } from './lesson-reminder.tsx'
import { template as earlyAccessInvite } from './early-access-invite.tsx'
import { template as lessonRequestReply } from './lesson-request-reply.tsx'
import { template as lessonRequestAcknowledgment } from './lesson-request-acknowledgment.tsx'
import { template as instructorSchedule } from './instructor-schedule.tsx'
import { template as lessonBookingConfirmation } from './lesson-booking-confirmation.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'session-payment-link': sessionPaymentLink,
  'enrollment-confirmation': enrollmentConfirmation,
  'lesson-reminder': lessonReminder,
  'early-access-invite': earlyAccessInvite,
  'lesson-request-reply': lessonRequestReply,
  'lesson-request-acknowledgment': lessonRequestAcknowledgment,
  'instructor-schedule': instructorSchedule,
  'lesson-booking-confirmation': lessonBookingConfirmation,
}
