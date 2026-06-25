import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Preview, Text, Button, Link, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Aquatic Dreams'
const LOGO_URL = 'https://jilrijklnehbfuulykty.supabase.co/storage/v1/object/public/email-assets/aqd-email-logo.jpg'

interface Props {
  parentName?: string
  childName?: string
  lessonTypeLabel?: string // "Private Lesson" | "Semi-Private Lesson"
  lessonDate?: string // "Saturday, June 13, 2026"
  lessonTime?: string // "11:00 AM – 11:30 AM"
  instructorName?: string
  amountDue?: string // "$50"
  paymentLink?: string // Stripe setup-mode hosted checkout URL
  notes?: string
}

const ManualBookingEmail = ({
  parentName,
  childName,
  lessonTypeLabel,
  lessonDate,
  lessonTime,
  instructorName,
  amountDue,
  paymentLink,
  notes,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your lesson is booked — save a card on file</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={LOGO_URL} width="80" height="80" alt={SITE_NAME} style={logo} />
        <Heading style={h1}>{SITE_NAME}</Heading>
        <Hr style={hr} />

        <Text style={text}>{parentName ? `Hi ${parentName},` : 'Hello,'}</Text>
        <Text style={text}>
          We've booked {childName || 'your swimmer'} for a{' '}
          <strong>{lessonTypeLabel || 'Private Lesson'}</strong>
          {instructorName ? <> with <strong>{instructorName}</strong></> : null}.
        </Text>

        <Section style={infoBox}>
          {lessonDate && <Text style={infoText}>📅 {lessonDate}</Text>}
          {lessonTime && <Text style={infoText}>🕐 {lessonTime}</Text>}
          {instructorName && <Text style={infoText}>👤 Instructor: {instructorName}</Text>}
        </Section>

        <Section style={chargeNoticeBox}>
          <Text style={chargeNoticeHeading}>💳 No charge today</Text>
          <Text style={chargeNoticeText}>
            We'll automatically charge <strong>{amountDue || '$65'}</strong> on the day of the lesson using the card you save below.
          </Text>
        </Section>

        {paymentLink && (
          <Section style={stepBox}>
            <Section style={{ textAlign: 'center' as const, margin: '12px 0 4px' }}>
              <Button style={button} href={paymentLink}>
                Save Card on File
              </Button>
            </Section>
            <Text style={{ ...mutedText, textAlign: 'center' as const }}>
              Or copy this link into your browser:<br />
              <Link href={paymentLink} style={linkStyle}>{paymentLink}</Link>
            </Text>
          </Section>
        )}

        {notes && (
          <Section style={policyBox}>
            <Text style={policyText}>{notes}</Text>
          </Section>
        )}

        <Section style={policyBox}>
          <Text style={policyText}>
            <strong>Cancellation policy:</strong> Cancel up to 24 hours before the lesson at no charge.
            No-shows and late cancellations are charged in full.
          </Text>
        </Section>

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
  component: ManualBookingEmail,
  subject: (data: Record<string, any>) => {
    const t = data.lessonTypeLabel || 'Private Lesson'
    const when = data.lessonDate ? ` — ${data.lessonDate}` : ''
    return `${t} Booked${when} — ${SITE_NAME}`
  },
  displayName: 'Lesson booking confirmation (manual / card on file)',
  previewData: {
    parentName: 'Sandeep',
    childName: 'Kiaan',
    lessonTypeLabel: 'Private Lesson',
    lessonDate: 'Saturday, June 13, 2026',
    lessonTime: '11:00 AM – 11:30 AM',
    instructorName: 'Grace Cavanaugh',
    amountDue: '$65',
    paymentLink: 'https://checkout.stripe.com/c/pay/cs_test_example',
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
const stepBox = { margin: '8px 0 16px' }
const policyBox = { backgroundColor: '#fafafa', border: '1px solid #e5e7eb', padding: '12px 16px', borderRadius: '4px', margin: '16px 0 0' }
const policyText = { fontSize: '12px', color: '#64748b', lineHeight: '1.5', margin: '0' }
const parentInfoBox = { backgroundColor: '#fff7ed', border: '1px solid #fdba74', padding: '14px 18px', borderRadius: '6px', margin: '20px 0 0' }
const parentInfoHeading = { fontSize: '14px', fontWeight: '700' as const, color: '#9a3412', margin: '0 0 8px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }
const parentInfoItem = { fontSize: '13px', color: '#7c2d12', lineHeight: '1.5', margin: '4px 0' }
const chargeNoticeBox = { backgroundColor: '#ecfdf5', border: '1px solid #6ee7b7', padding: '14px 18px', borderRadius: '6px', margin: '8px 0 16px' }
const chargeNoticeHeading = { fontSize: '14px', fontWeight: '700' as const, color: '#065f46', margin: '0 0 6px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' }
const chargeNoticeText = { fontSize: '14px', color: '#064e3b', lineHeight: '1.5', margin: '0' }
