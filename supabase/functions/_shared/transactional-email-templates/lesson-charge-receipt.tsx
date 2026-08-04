import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Preview, Text, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Aquatic Dreams'
const LOGO_URL = 'https://jilrijklnehbfuulykty.supabase.co/storage/v1/object/public/email-assets/aqd-email-logo.jpg'
const CONTACT_EMAIL = 'info@aquaticdreamsswim.com'
const CONTACT_PHONE = '(209) 577-3483'

interface LessonChargeReceiptProps {
  parentName?: string
  childName?: string
  lessonDateLabel?: string
  lessonTimeLabel?: string
  instructorName?: string | null
  amountUsd?: number
  cardBrand?: string | null
  cardLast4?: string | null
}

const fmtMoney = (n?: number) =>
  typeof n === 'number' ? `$${n.toFixed(2)}` : '—'

const cardLabel = (brand?: string | null, last4?: string | null) => {
  const b = brand ? brand.charAt(0).toUpperCase() + brand.slice(1) : 'Card'
  return last4 ? `${b} ending in ${last4}` : b
}

const LessonChargeReceiptEmail = ({
  parentName, childName, lessonDateLabel, lessonTimeLabel,
  instructorName, amountUsd, cardBrand, cardLast4,
}: LessonChargeReceiptProps) => {
  const greeting = parentName ? `Hi ${parentName.split(' ')[0]},` : 'Hi there,'
  const swimmer = childName || 'your swimmer'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Receipt — {fmtMoney(amountUsd)} for {swimmer}'s lesson</Preview>
      <Body style={main}>
        <Container style={container}>
          <Img src={LOGO_URL} width="80" height="80" alt={SITE_NAME} style={logo} />
          <Heading style={h1}>Lesson Receipt</Heading>

          <Text style={text}>{greeting}</Text>
          <Text style={text}>
            This lesson was booked without a card on file, and it has now been charged to the
            card we have on file for your family. Here are the details for your records:
          </Text>

          <Section style={box}>
            <Row label="Swimmer" value={childName || '—'} />
            <Row label="Lesson" value={lessonDateLabel || '—'} />
            {lessonTimeLabel && <Row label="Time" value={lessonTimeLabel} />}
            {instructorName && <Row label="Coach" value={instructorName} />}
            <Row label="Amount" value={fmtMoney(amountUsd)} bold />
            <Row label="Card" value={cardLabel(cardBrand, cardLast4)} />
          </Section>

          <Text style={text}>
            Questions? Reply to this email or call us at{' '}
            <a href={`tel:${CONTACT_PHONE.replace(/\D/g, '')}`} style={link}>{CONTACT_PHONE}</a>.
          </Text>

          <Hr style={hr} />
          <Text style={signoff}>See you at the pool,<br />The {SITE_NAME} Team</Text>
          <Text style={footer}>
            {SITE_NAME} · <a href={`mailto:${CONTACT_EMAIL}`} style={footerLink}>{CONTACT_EMAIL}</a> · {CONTACT_PHONE}
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

const Row = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
  <table style={{ width: '100%', borderCollapse: 'collapse', margin: '0 0 6px' }}>
    <tbody><tr>
      <td style={{ ...rowLabel }}>{label}</td>
      <td style={{ ...rowValue, ...(bold ? { fontWeight: 'bold' as const, color: '#1a3a8a' } : {}) }}>{value}</td>
    </tr></tbody>
  </table>
)

export const template = {
  component: LessonChargeReceiptEmail,
  subject: (data: Record<string, any>) => {
    const swimmer = data?.childName ? `${data.childName}'s` : 'Your swimmer\'s'
    const date = data?.lessonDateLabel || ''
    const time = data?.lessonTimeLabel ? `, ${data.lessonTimeLabel}` : ''
    return `${SITE_NAME} receipt — ${swimmer} lesson ${date}${time}`
  },
  displayName: 'Lesson Charge Receipt (card on file)',
  previewData: {
    parentName: 'Sydnee Smith',
    childName: 'Nanki',
    lessonDateLabel: 'Tue Aug 4',
    lessonTimeLabel: '5:30 PM',
    instructorName: 'Coach Maya',
    amountUsd: 50,
    cardBrand: 'visa',
    cardLast4: '4242',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif' }
const container = { padding: '24px', maxWidth: '560px', margin: '0 auto' }
const logo = { display: 'block', margin: '0 auto 8px' }
const h1 = { fontSize: '20px', fontWeight: 'bold', color: '#1a3a8a', textAlign: 'center' as const, margin: '0 0 20px' }
const text = { fontSize: '15px', color: '#333', lineHeight: '1.6', margin: '0 0 14px' }
const box = {
  backgroundColor: '#f4f8fb',
  borderLeft: '4px solid #2a5e84',
  padding: '14px 18px',
  borderRadius: '4px',
  margin: '12px 0 20px',
}
const rowLabel = { fontSize: '13px', color: '#666', padding: '4px 8px 4px 0', width: '110px' as const }
const rowValue = { fontSize: '14px', color: '#222', padding: '4px 0' }
const link = { color: '#2a5e84', textDecoration: 'underline' }
const hr = { borderColor: '#e6e6e6', margin: '28px 0 18px' }
const signoff = { fontSize: '15px', color: '#333', margin: '0 0 20px' }
const footer = { fontSize: '12px', color: '#888', textAlign: 'center' as const, margin: '12px 0 0' }
const footerLink = { color: '#888', textDecoration: 'underline' }
