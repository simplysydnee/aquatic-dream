import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Img, Preview, Text, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "Aquatic Dreams"
const LOGO_URL = 'https://jilrijklnehbfuulykty.supabase.co/storage/v1/object/public/email-assets/aqd-email-logo.jpg'
const ADDRESS = '1212 Kansas Ave, Modesto, CA 95351'

interface EnrollmentConfirmationProps {
  parentName?: string
  childName?: string
  levelLabel?: string
  groupName?: string
  // Structured summary fields
  dayOfWeek?: string
  startTime?: string
  endTime?: string
  sessionStartDate?: string
  sessionEndDate?: string
  sessionPeriodName?: string
  // Lessons + payment
  lessonDates?: string[]
  isFirstTime?: boolean
  registrationFeePaid?: string
  sessionFeeDue?: string
  dueDate?: string
  totalPaid?: string
  paymentReference?: string
  // Add to calendar
  icsLink?: string
  googleCalendarLink?: string
  // Legacy compat
  sessionInfo?: string
}

const SummaryRow = ({ label, value }: { label: string; value: string }) => (
  <Text style={summaryRow}>
    <span style={summaryLabel}>{label}:</span>{' '}
    <strong style={summaryValue}>{value}</strong>
  </Text>
)

const EnrollmentConfirmationEmail = ({
  parentName,
  childName,
  levelLabel,
  groupName,
  dayOfWeek,
  startTime,
  endTime,
  sessionStartDate,
  sessionEndDate,
  sessionPeriodName,
  lessonDates,
  isFirstTime,
  registrationFeePaid,
  sessionFeeDue,
  dueDate,
  totalPaid,
  paymentReference,
  icsLink,
  googleCalendarLink,
  sessionInfo,
}: EnrollmentConfirmationProps) => {
  const timeRange = startTime
    ? endTime
      ? `${startTime} – ${endTime}`
      : startTime
    : undefined
  const dateRange = sessionStartDate
    ? sessionEndDate
      ? `${sessionStartDate} – ${sessionEndDate}`
      : sessionStartDate
    : undefined

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Enrollment confirmed for {childName || 'your swimmer'} — {SITE_NAME}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Img src={LOGO_URL} width="80" height="80" alt="Aquatic Dreams" style={logo} />
          <Heading style={h1}>{SITE_NAME}</Heading>
          <Hr style={hr} />

          <Text style={text}>
            {parentName ? `Hi ${parentName},` : 'Hello,'}
          </Text>

          <Text style={text}>
            Great news! <strong>{childName || 'Your swimmer'}</strong> has been successfully enrolled
            {groupName ? ` in ${groupName}` : ''}
            {levelLabel ? ` — ${levelLabel}` : ''}.
          </Text>

          {/* Enrollment Summary */}
          <Section style={summaryBox}>
            <Text style={summaryHeading}>Enrollment Summary</Text>
            {childName && <SummaryRow label="Swimmer" value={childName} />}
            {(groupName || levelLabel) && (
              <SummaryRow
                label="Level"
                value={[groupName, levelLabel].filter(Boolean).join(' — ')}
              />
            )}
            {sessionPeriodName && <SummaryRow label="Session" value={sessionPeriodName} />}
            {dayOfWeek && (
              <SummaryRow
                label="Day & Time"
                value={`${dayOfWeek}${timeRange ? `, ${timeRange}` : ''}`}
              />
            )}
            {dateRange && <SummaryRow label="Session Dates" value={dateRange} />}
            {!dayOfWeek && !dateRange && sessionInfo && (
              <SummaryRow label="Session" value={sessionInfo} />
            )}
          </Section>

          {/* Lesson Dates */}
          {lessonDates && lessonDates.length > 0 && (
            <Section style={infoBox}>
              <Text style={{ ...infoText, fontWeight: '600' as const, marginBottom: '8px' }}>
                📅 Lesson Dates ({lessonDates.length} classes)
              </Text>
              <Text style={infoText}>
                {lessonDates.join('  •  ')}
              </Text>
            </Section>
          )}

          {/* Add to Calendar */}
          {(icsLink || googleCalendarLink) && (
            <Section style={{ textAlign: 'center' as const, margin: '0 0 20px' }}>
              <Text style={{ fontSize: '13px', color: '#64748b', textAlign: 'center' as const, margin: '0 0 8px' }}>
                Add all lessons to your calendar:
              </Text>
              {icsLink && (
                <Button style={calBtnPrimary} href={icsLink}>
                  📅 Add All Lessons to Calendar
                </Button>
              )}
              {googleCalendarLink && (
                <>
                  {icsLink && <span style={{ display: 'inline-block', width: '8px' }}>&nbsp;</span>}
                  <Button style={calBtnSecondary} href={googleCalendarLink}>
                    Google Calendar
                  </Button>
                </>
              )}
              {icsLink && googleCalendarLink && (
                <Text style={{ fontSize: '11px', color: '#94a3b8', textAlign: 'center' as const, margin: '8px 0 0' }}>
                  Tip: "Add All Lessons" adds every class at once. Google Calendar adds the first lesson only.
                </Text>
              )}
            </Section>
          )}

          {/* Location */}
          <Section style={infoBox}>
            <Text style={infoText}>📍 {ADDRESS}</Text>
          </Section>

          {/* Payment Summary */}
          {isFirstTime ? (
            <>
              <Section style={successBox}>
                <Text style={successText}>
                  ✅ Registration Fee Paid: <strong>{registrationFeePaid || '$45'}</strong>
                </Text>
                <Text style={{ ...successText, fontSize: '12px' }}>
                  Includes swim bag, cap & goggles
                </Text>
                {paymentReference && (
                  <Text style={{ ...successText, fontSize: '11px', marginTop: '6px', color: '#15803d' }}>
                    Payment confirmation: {paymentReference}
                  </Text>
                )}
              </Section>
              <Section style={warningBox}>
                <Text style={warningText}>
                  ⏳ Session Fee Due: <strong>{sessionFeeDue || '$240'}</strong>
                </Text>
                <Text style={{ ...warningText, fontSize: '12px' }}>
                  Due on the first day of lessons{dueDate ? ` — ${dueDate}` : ''}
                </Text>
              </Section>
            </>
          ) : (
            <Section style={successBox}>
              <Text style={successText}>
                ✅ Payment Complete: <strong>{totalPaid || '$240'}</strong>
              </Text>
              {paymentReference && (
                <Text style={{ ...successText, fontSize: '11px', marginTop: '6px', color: '#15803d' }}>
                  Payment confirmation: {paymentReference}
                </Text>
              )}
            </Section>
          )}

          <Text style={text}>
            Our instructors will confirm level placement on the first day.
            If adjustments are needed, we'll work with you to find the perfect fit.
          </Text>

          <Hr style={hr} />

          <Section style={policyBox}>
            <Text style={policyHeading}>Refund Policy</Text>
            <Text style={policyText}>
              The $45 registration fee is one-time and non-refundable. Session fees are non-refundable
              once paid, except in documented circumstances (illness, injury, relocation) — written
              request to info@aquaticdreamsswim.com required before the second lesson. Missed lessons
              and no-shows are not refunded. Full policy available during enrollment and at
              aquaticdreamsswim.com/swim-enrollment.
            </Text>
          </Section>

          <Text style={text}>
            Questions? Contact us at info@aquaticdreamsswim.com or call (209) 577-3483.
          </Text>

          <Text style={footer}>
            Best regards,<br />
            The {SITE_NAME} Team
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: EnrollmentConfirmationEmail,
  subject: (data: Record<string, any>) =>
    `Enrollment Confirmed${data.childName ? ` for ${data.childName}` : ''} — ${SITE_NAME}`,
  displayName: 'Enrollment confirmation',
  previewData: {
    parentName: 'Jane',
    childName: 'Tommy',
    levelLabel: 'Preschool 1',
    groupName: 'Little Fins (White)',
    dayOfWeek: 'Monday',
    startTime: '3:00 PM',
    endTime: '3:30 PM',
    sessionStartDate: 'June 9, 2025',
    sessionEndDate: 'July 2, 2025',
    sessionPeriodName: 'Session 1',
    lessonDates: ['Mon Jun 9', 'Wed Jun 11', 'Mon Jun 16', 'Wed Jun 18', 'Mon Jun 23', 'Wed Jun 25', 'Mon Jun 30', 'Wed Jul 2'],
    isFirstTime: true,
    registrationFeePaid: '$45',
    sessionFeeDue: '$240',
    dueDate: 'June 9, 2025',
    paymentReference: 'cs_test_a1B2c3D4e5F6',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Plus Jakarta Sans', Arial, sans-serif" }
const container = { padding: '30px 25px', maxWidth: '560px', margin: '0 auto' }
const logo = { display: 'block', margin: '0 0 10px' }
const h1 = { fontSize: '24px', fontWeight: '700' as const, color: '#0f2343', margin: '0 0 10px', fontFamily: "'Playfair Display', Georgia, serif" }
const hr = { borderColor: '#5badcb', borderWidth: '2px', margin: '15px 0 25px' }
const text = { fontSize: '15px', color: '#333', lineHeight: '1.6', margin: '0 0 16px' }
const summaryBox = { backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', padding: '16px 18px', borderRadius: '6px', margin: '0 0 16px' }
const summaryHeading = { fontSize: '13px', fontWeight: '700' as const, color: '#0f2343', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 10px' }
const summaryRow = { fontSize: '14px', color: '#0f2343', margin: '0 0 6px', lineHeight: '1.5' }
const summaryLabel = { color: '#64748b' }
const summaryValue = { color: '#0f2343' }
const infoBox = { backgroundColor: '#f0f7fa', borderLeft: '4px solid #5badcb', padding: '12px 16px', borderRadius: '4px', margin: '0 0 16px' }
const infoText = { fontSize: '14px', color: '#0f2343', margin: '0' }
const successBox = { backgroundColor: '#f0fdf4', borderLeft: '4px solid #22c55e', padding: '12px 16px', borderRadius: '4px', margin: '0 0 12px' }
const successText = { fontSize: '14px', color: '#166534', margin: '0' }
const warningBox = { backgroundColor: '#fffbeb', borderLeft: '4px solid #f59e0b', padding: '12px 16px', borderRadius: '4px', margin: '0 0 16px' }
const warningText = { fontSize: '14px', color: '#92400e', margin: '0' }
const footer = { fontSize: '13px', color: '#888', margin: '30px 0 0', lineHeight: '1.5' }
const policyBox = { backgroundColor: '#fafafa', border: '1px solid #e5e7eb', padding: '12px 16px', borderRadius: '4px', margin: '0 0 16px' }
const policyHeading = { fontSize: '12px', fontWeight: '700' as const, color: '#475569', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 6px' }
const policyText = { fontSize: '12px', color: '#64748b', lineHeight: '1.5', margin: '0' }
