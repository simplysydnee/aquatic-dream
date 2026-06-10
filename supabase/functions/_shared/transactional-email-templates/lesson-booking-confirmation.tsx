import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Preview, Text, Button, Link, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Aquatic Dreams'
const LOGO_URL = 'https://jilrijklnehbfuulykty.supabase.co/storage/v1/object/public/email-assets/aqd-email-logo.jpg'

interface LessonBookingConfirmationProps {
  parentName?: string
  childName?: string
  lessonTypeLabel?: string // "Private Lesson" / "Semi-Private Lesson"
  lessonDate?: string // "Monday, June 8, 2025"
  lessonTime?: string // "3:00 PM – 3:45 PM"
  instructorName?: string
  amountDue?: string // "$65"
  paymentLink?: string
  isFirstOfSeries?: boolean
  totalOccurrences?: number
  waiverLink?: string
  waiverSigned?: boolean
  icsLink?: string
  googleCalendarLink?: string
  // Series mode (single payment for whole recurring series)
  seriesMode?: boolean
  totalAmountDue?: string // "$520.00"
  scheduleList?: { date: string; time: string }[]
  // Card-on-file flow (private lessons): no paymentLink, show charge notice instead.
  chargeNotice?: string
  // First-ever private lesson with us → show extended welcome / what-to-expect block.
  isFirstPrivateLesson?: boolean
}

const LessonBookingConfirmationEmail = ({
  parentName,
  childName,
  lessonTypeLabel,
  lessonDate,
  lessonTime,
  instructorName,
  amountDue,
  paymentLink,
  isFirstOfSeries,
  totalOccurrences,
  waiverLink,
  waiverSigned,
  icsLink,
  googleCalendarLink,
  seriesMode,
  totalAmountDue,
  scheduleList,
  chargeNotice,
  isFirstPrivateLesson,
}: LessonBookingConfirmationProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>
      {paymentLink
        ? (seriesMode
            ? `Your ${lessonTypeLabel || 'lesson'} series is booked — pay ${totalAmountDue || ''} to confirm`
            : `Your ${lessonTypeLabel || 'lesson'} is booked${lessonDate ? ` for ${lessonDate}` : ''} — pay ${amountDue || ''} to confirm`)
        : `Your ${lessonTypeLabel || 'lesson'} is booked — see you at the pool!`}
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={LOGO_URL} width="80" height="80" alt={SITE_NAME} style={logo} />
        <Heading style={h1}>{SITE_NAME}</Heading>
        <Hr style={hr} />
        <Text style={text}>{parentName ? `Hi ${parentName},` : 'Hello,'}</Text>
        <Text style={text}>
          {seriesMode ? (
            <>{childName ? `${childName}'s` : 'Your'} <strong>{lessonTypeLabel || 'swim lesson'} series</strong> ({scheduleList?.length || totalOccurrences} lessons) is booked.{paymentLink ? ' One payment covers the whole series — pay below to confirm.' : ''}</>
          ) : (
            <>{childName ? `${childName}'s` : 'Your'} <strong>{lessonTypeLabel || 'swim lesson'}</strong> is booked{paymentLink ? '. Please complete payment below to confirm your spot.' : ' — you\'re all set.'}</>
          )}
        </Text>

        {seriesMode && scheduleList && scheduleList.length > 0 ? (
          <Section style={infoBox}>
            <Text style={{ ...infoText, fontWeight: 700 as const }}>📅 Schedule ({scheduleList.length} lessons)</Text>
            {scheduleList.map((s, i) => (
              <Text key={i} style={infoText}>• {s.date} — {s.time}</Text>
            ))}
            {instructorName && <Text style={infoText}>👤 Instructor: {instructorName}</Text>}
          </Section>
        ) : (
          <Section style={infoBox}>
            {lessonDate && <Text style={infoText}>📅 {lessonDate}</Text>}
            {lessonTime && <Text style={infoText}>🕐 {lessonTime}</Text>}
            {instructorName && <Text style={infoText}>👤 Instructor: {instructorName}</Text>}
          </Section>
        )}

        {(icsLink || googleCalendarLink) && (
          <Section style={{ textAlign: 'center' as const, margin: '0 0 20px' }}>
            <Text style={{ ...mutedText, textAlign: 'center' as const, margin: '0 0 8px' }}>
              {seriesMode ? 'Add all lessons to your calendar:' : 'Add this lesson to your calendar:'}
            </Text>
            {icsLink && (
              <Button style={calBtnPrimary} href={icsLink}>
                📅 {seriesMode ? 'Add All to Calendar' : 'Add to Calendar'}
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
            <Text style={{ ...mutedText, textAlign: 'center' as const, margin: '8px 0 0', fontSize: '11px' }}>
              "Add to Calendar" works on iPhone, Android, and Outlook.
            </Text>
          </Section>
        )}

        {waiverLink && !waiverSigned && (
          <Section style={stepBox}>
            <Text style={stepLabel}>Step 1 — Sign your waiver</Text>
            <Text style={text}>
              All swimmers must complete a quick liability waiver and emergency-contact form before their first lesson.
            </Text>
            <Section style={{ textAlign: 'center' as const, margin: '12px 0 4px' }}>
              <Button style={waiverButton} href={waiverLink}>
                Sign Waiver
              </Button>
            </Section>
            <Text style={{ ...mutedText, textAlign: 'center' as const }}>
              <Link href={waiverLink} style={linkStyle}>{waiverLink}</Link>
            </Text>
          </Section>
        )}

        {paymentLink ? (
          <Section style={stepBox}>
            {waiverLink && !waiverSigned && <Text style={stepLabel}>{seriesMode ? 'Step 2 — Pay for the full series' : 'Step 2 — Pay for this lesson'}</Text>}
            <Section style={{ textAlign: 'center' as const, margin: '12px 0 4px' }}>
              <Button style={button} href={paymentLink}>
                {seriesMode
                  ? `Pay Full Series${totalAmountDue ? ` — ${totalAmountDue}` : ''}`
                  : `Pay Now${amountDue ? ` — ${amountDue}` : ''}`}
              </Button>
            </Section>
            <Text style={{ ...mutedText, textAlign: 'center' as const }}>
              Or copy this link into your browser:<br />
              <Link href={paymentLink} style={linkStyle}>{paymentLink}</Link>
            </Text>
          </Section>
        ) : chargeNotice ? (
          <Section style={chargeNoticeBox}>
            <Text style={chargeNoticeHeading}>💳 Payment — Card on File</Text>
            <Text style={chargeNoticeText}>{chargeNotice}</Text>
          </Section>
        ) : null}

        {seriesMode && totalOccurrences && totalOccurrences > 1 ? (
          <Section style={policyBox}>
            <Text style={policyText}>
              <strong>One payment covers all {totalOccurrences} lessons.</strong> No
              additional charges — your spot is secured for the entire series. To
              reschedule a specific date, just reply to this email or call us.
            </Text>
          </Section>
        ) : isFirstOfSeries && totalOccurrences && totalOccurrences > 1 && (
          <Section style={policyBox}>
            <Text style={policyText}>
              <strong>This is the first of {totalOccurrences} scheduled lessons.</strong> You'll
              receive a separate payment link by email <strong>24 hours before</strong> each
              upcoming lesson. Each lesson is paid one at a time so you can cancel or reschedule
              individual sessions if needed.
            </Text>
          </Section>
        )}

        <Section style={parentInfoBox}>
          <Text style={parentInfoHeading}>Parent Information</Text>
          <Text style={parentInfoItem}>• All swimmers who might have an accident in the pool <strong>MUST wear a swim diaper</strong>.</Text>
          <Text style={parentInfoItem}>• Please have all swimmers use the restroom prior to the start of swim lessons.</Text>
          <Text style={parentInfoItem}>• Please <strong>do not</strong> have your child eat 30 minutes prior to swim lessons.</Text>
          <Text style={parentInfoItem}>• Please only bring required family with you to the pool to ensure we have enough space on the pool deck.</Text>
          <Text style={parentInfoItem}>• All children not with an instructor in the pool may <strong>NOT</strong> touch the water at any time.</Text>
        </Section>

        <Hr style={hr} />
        <Text style={text}>
          Questions? Reach us at info@aquaticdreamsswim.com or (209) 577-3483.
        </Text>

        <Text style={footer}>
          See you at the pool!<br />
          The {SITE_NAME} Team
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: LessonBookingConfirmationEmail,
  subject: (data: Record<string, any>) => {
    const t = data.lessonTypeLabel || 'Lesson'
    const when = data.lessonDate ? ` — ${data.lessonDate}` : ''
    return `${t} Booked${when} — ${SITE_NAME}`
  },
  displayName: 'Lesson booking confirmation',
  previewData: {
    parentName: 'Jane',
    childName: 'Tommy',
    lessonTypeLabel: 'Private Lesson',
    lessonDate: 'Monday, June 8, 2025',
    lessonTime: '3:00 PM – 3:45 PM',
    instructorName: 'Coach Sutton',
    amountDue: '$65',
    paymentLink: 'https://example.com/pay',
    isFirstOfSeries: true,
    totalOccurrences: 8,
    waiverLink: 'https://example.com/lesson-waiver/abc123',
    waiverSigned: false,
    icsLink: 'https://example.com/cal.ics',
    googleCalendarLink: 'https://calendar.google.com/calendar/render?action=TEMPLATE',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Plus Jakarta Sans', Arial, sans-serif" }
const container = { padding: '30px 25px', maxWidth: '560px', margin: '0 auto' }
const logo = { display: 'block', margin: '0 0 10px' }
const h1 = { fontSize: '24px', fontWeight: '700' as const, color: '#0f2343', margin: '0 0 10px', fontFamily: "'Playfair Display', Georgia, serif" }
const hr = { borderColor: '#5badcb', borderWidth: '2px', margin: '15px 0 25px' }
const text = { fontSize: '15px', color: '#333', lineHeight: '1.6', margin: '0 0 16px' }
const mutedText = { fontSize: '12px', color: '#666', lineHeight: '1.5', margin: '0 0 16px', wordBreak: 'break-all' as const }
const infoBox = { backgroundColor: '#f0f7fa', borderLeft: '4px solid #5badcb', padding: '12px 16px', borderRadius: '4px', margin: '0 0 16px' }
const infoText = { fontSize: '14px', color: '#0f2343', margin: '4px 0' }
const linkStyle = { color: '#5badcb', textDecoration: 'underline' }
const button = {
  backgroundColor: '#5badcb',
  color: '#ffffff',
  padding: '14px 28px',
  borderRadius: '8px',
  fontSize: '16px',
  fontWeight: '600' as const,
  textDecoration: 'none',
  display: 'inline-block' as const,
}
const footer = { fontSize: '13px', color: '#888', margin: '30px 0 0', lineHeight: '1.5' }
const policyBox = { backgroundColor: '#fafafa', border: '1px solid #e5e7eb', padding: '12px 16px', borderRadius: '4px', margin: '16px 0 0' }
const policyText = { fontSize: '12px', color: '#64748b', lineHeight: '1.5', margin: '0' }
const stepBox = { margin: '8px 0 16px' }
const stepLabel = { fontSize: '12px', fontWeight: '700' as const, color: '#0f2343', textTransform: 'uppercase' as const, letterSpacing: '0.5px', margin: '0 0 6px' }
const waiverButton = {
  backgroundColor: '#0f2343',
  color: '#ffffff',
  padding: '14px 28px',
  borderRadius: '8px',
  fontSize: '16px',
  fontWeight: '600' as const,
  textDecoration: 'none',
  display: 'inline-block' as const,
}
const calBtnPrimary = {
  backgroundColor: '#5badcb',
  color: '#ffffff',
  padding: '10px 18px',
  borderRadius: '6px',
  fontSize: '14px',
  fontWeight: '600' as const,
  textDecoration: 'none',
  display: 'inline-block' as const,
}
const calBtnSecondary = {
  backgroundColor: '#ffffff',
  color: '#0f2343',
  padding: '10px 18px',
  borderRadius: '6px',
  fontSize: '14px',
  fontWeight: '600' as const,
  textDecoration: 'none',
  display: 'inline-block' as const,
  border: '1.5px solid #0f2343',
}
const parentInfoBox = { backgroundColor: '#fff7ed', border: '1px solid #fdba74', padding: '14px 18px', borderRadius: '6px', margin: '20px 0 0' }
const parentInfoHeading = { fontSize: '14px', fontWeight: '700' as const, color: '#9a3412', margin: '0 0 8px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }
const parentInfoItem = { fontSize: '13px', color: '#7c2d12', lineHeight: '1.5', margin: '4px 0' }
