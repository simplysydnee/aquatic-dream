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

export const TEMPLATES: Record<string, TemplateEntry> = {
  'session-payment-link': sessionPaymentLink,
  'enrollment-confirmation': enrollmentConfirmation,
  'lesson-reminder': lessonReminder,
}
