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
}: LessonBookingConfirmationProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>
      Your {lessonTypeLabel || 'lesson'} is booked{lessonDate ? ` for ${lessonDate}` : ''} — pay {amountDue || ''} to confirm
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={LOGO_URL} width="80" height="80" alt={SITE_NAME} style={logo} />
        <Heading style={h1}>{SITE_NAME}</Heading>
        <Hr style={hr} />
        <Text style={text}>{parentName ? `Hi ${parentName},` : 'Hello,'}</Text>
        <Text style={text}>
          {childName ? `${childName}'s` : 'Your'} <strong>{lessonTypeLabel || 'swim lesson'}</strong> is booked.
          Please complete payment below to confirm your spot.
        </Text>

        <Section style={infoBox}>
          {lessonDate && <Text style={infoText}>📅 {lessonDate}</Text>}
          {lessonTime && <Text style={infoText}>🕐 {lessonTime}</Text>}
          {instructorName && <Text style={infoText}>👤 Instructor: {instructorName}</Text>}
        </Section>

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

        {paymentLink && (
          <Section style={stepBox}>
            {waiverLink && !waiverSigned && <Text style={stepLabel}>Step 2 — Pay for this lesson</Text>}
            <Section style={{ textAlign: 'center' as const, margin: '12px 0 4px' }}>
              <Button style={button} href={paymentLink}>
                Pay Now{amountDue ? ` — ${amountDue}` : ''}
              </Button>
            </Section>
            <Text style={{ ...mutedText, textAlign: 'center' as const }}>
              Or copy this link into your browser:<br />
              <Link href={paymentLink} style={linkStyle}>{paymentLink}</Link>
            </Text>
          </Section>
        )}

        {isFirstOfSeries && totalOccurrences && totalOccurrences > 1 && (
          <Section style={policyBox}>
            <Text style={policyText}>
              <strong>This is the first of {totalOccurrences} scheduled lessons.</strong> You'll
              receive a separate payment link by email <strong>24 hours before</strong> each
              upcoming lesson. Each lesson is paid one at a time so you can cancel or reschedule
              individual sessions if needed.
            </Text>
          </Section>
        )}

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
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Plus Jakarta Sans', Arial, sans-serif" }
const container = { padding: '30px 25px', maxWidth: '560px', margin: '0 auto' }
const logo = { margin: '0 0 10px' }
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
