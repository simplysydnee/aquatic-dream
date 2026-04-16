import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Preview, Text, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "Aquatic Dreams"
const LOGO_URL = 'https://jilrijklnehbfuulykty.supabase.co/storage/v1/object/public/email-assets/AQD_Favicon.png'
const ADDRESS = '1212 Kansas Ave, Modesto, CA 95351'

interface EnrollmentConfirmationProps {
  parentName?: string
  childName?: string
  levelLabel?: string
  groupName?: string
  sessionInfo?: string
  lessonDates?: string[]
  isFirstTime?: boolean
  registrationFeePaid?: string
  sessionFeeDue?: string
  dueDate?: string
  totalPaid?: string
}

const EnrollmentConfirmationEmail = ({
  parentName,
  childName,
  levelLabel,
  groupName,
  sessionInfo,
  lessonDates,
  isFirstTime,
  registrationFeePaid,
  sessionFeeDue,
  dueDate,
  totalPaid,
}: EnrollmentConfirmationProps) => (
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

        {sessionInfo && (
          <Section style={infoBox}>
            <Text style={infoText}>📋 {sessionInfo}</Text>
          </Section>
        )}

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

        {/* Location */}
        <Section style={infoBox}>
          <Text style={infoText}>📍 {ADDRESS}</Text>
        </Section>

        {/* Payment Summary */}
        {isFirstTime ? (
          <>
            <Section style={successBox}>
              <Text style={successText}>
                ✅ Registration Fee Paid: {registrationFeePaid || '$45'}
              </Text>
              <Text style={{ ...successText, fontSize: '12px' }}>
                Includes swim bag, cap & goggles
              </Text>
            </Section>
            <Section style={warningBox}>
              <Text style={warningText}>
                ⏳ Session Fee Due: {sessionFeeDue || '$280'}
              </Text>
              <Text style={{ ...warningText, fontSize: '12px' }}>
                Due on or before {dueDate || 'your first class'}
              </Text>
            </Section>
          </>
        ) : (
          <Section style={successBox}>
            <Text style={successText}>
              ✅ Payment Complete: {totalPaid || '$280'}
            </Text>
          </Section>
        )}

        <Text style={text}>
          Our instructors will confirm level placement on the first day.
          If adjustments are needed, we'll work with you to find the perfect fit.
        </Text>

        <Hr style={hr} />

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
    sessionInfo: 'Session 1 — Mon 3:00 PM',
    lessonDates: ['Mon Jun 9', 'Wed Jun 11', 'Mon Jun 16', 'Wed Jun 18', 'Mon Jun 23', 'Wed Jun 25', 'Mon Jun 30', 'Wed Jul 2'],
    isFirstTime: true,
    registrationFeePaid: '$45',
    sessionFeeDue: '$280',
    dueDate: 'June 9, 2025',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Plus Jakarta Sans', Arial, sans-serif" }
const container = { padding: '30px 25px', maxWidth: '560px', margin: '0 auto' }
const logo = { margin: '0 0 10px' }
const h1 = { fontSize: '24px', fontWeight: '700' as const, color: '#0f2343', margin: '0 0 10px', fontFamily: "'Playfair Display', Georgia, serif" }
const hr = { borderColor: '#5badcb', borderWidth: '2px', margin: '15px 0 25px' }
const text = { fontSize: '15px', color: '#333', lineHeight: '1.6', margin: '0 0 16px' }
const infoBox = { backgroundColor: '#f0f7fa', borderLeft: '4px solid #5badcb', padding: '12px 16px', borderRadius: '4px', margin: '0 0 16px' }
const infoText = { fontSize: '14px', color: '#0f2343', margin: '0' }
const successBox = { backgroundColor: '#f0fdf4', borderLeft: '4px solid #22c55e', padding: '12px 16px', borderRadius: '4px', margin: '0 0 12px' }
const successText = { fontSize: '14px', color: '#166534', margin: '0' }
const warningBox = { backgroundColor: '#fffbeb', borderLeft: '4px solid #f59e0b', padding: '12px 16px', borderRadius: '4px', margin: '0 0 16px' }
const warningText = { fontSize: '14px', color: '#92400e', margin: '0' }
const footer = { fontSize: '13px', color: '#888', margin: '30px 0 0', lineHeight: '1.5' }
