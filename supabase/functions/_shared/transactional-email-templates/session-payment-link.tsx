import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Preview, Text, Button, Link, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "Aquatic Dreams"
const LOGO_URL = 'https://jilrijklnehbfuulykty.supabase.co/storage/v1/object/public/email-assets/aqd-email-logo.jpg'

interface SessionPaymentLinkProps {
  parentName?: string
  childName?: string
  sessionInfo?: string
  amountDue?: string
  paymentLink?: string
  dueDate?: string
}

const SessionPaymentLinkEmail = ({
  parentName,
  childName,
  sessionInfo,
  amountDue,
  paymentLink,
  dueDate,
}: SessionPaymentLinkProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Session fee {amountDue ? `(${amountDue}) ` : ''}due on the first day of lessons — {SITE_NAME}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={LOGO_URL} width="80" height="80" alt="Aquatic Dreams" style={logo} />
        <Heading style={h1}>{SITE_NAME}</Heading>
        <Hr style={hr} />
        <Text style={text}>
          {parentName ? `Hi ${parentName},` : 'Hello,'}
        </Text>
        <Text style={text}>
          {childName ? `${childName}'s` : "Your swimmer's"} session fee
          {amountDue ? <> of <strong>{amountDue}</strong></> : null} is due on the{' '}
          <strong>first day of lessons{dueDate ? ` — ${dueDate}` : ''}</strong>.
        </Text>
        {sessionInfo && (
          <Section style={infoBox}>
            <Text style={infoText}>📋 {sessionInfo}</Text>
          </Section>
        )}
        <Text style={text}>
          <strong>Click the button below to complete your payment securely:</strong>
        </Text>
        {paymentLink && (
          <>
            <Section style={{ textAlign: 'center' as const, margin: '24px 0 12px' }}>
              <Button style={button} href={paymentLink}>
                Pay Session Fee{amountDue ? ` — ${amountDue}` : ''}
              </Button>
            </Section>
            <Text style={{ ...mutedText, textAlign: 'center' as const }}>
              Or copy this link into your browser:<br />
              <Link href={paymentLink} style={linkStyle}>{paymentLink}</Link>
            </Text>
          </>
        )}
        <Section style={policyBox}>
          <Text style={policyText}>
            <strong>Refund Policy:</strong> Session fees are non-refundable once paid, except in
            documented circumstances (illness, injury, relocation) — written request to
            info@aquaticdreamsswim.com required before the second lesson. Missed lessons and
            no-shows are not refunded.
          </Text>
        </Section>
        <Hr style={hr} />
        <Text style={text}>
          If you have any questions, feel free to contact us at{' '}
          info@aquaticdreamsswim.com or call (209) 577-3483.
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
  component: SessionPaymentLinkEmail,
  subject: (data: Record<string, any>) => {
    const who = data.childName ? ` for ${data.childName}` : ''
    const when = data.dueDate ? ` (Due ${data.dueDate})` : ''
    return `Session Fee Due${when}${who} — ${SITE_NAME}`
  },
  displayName: 'Session payment link',
  previewData: {
    parentName: 'Jane',
    childName: 'Tommy',
    sessionInfo: 'Session 1 — Mon 3:00 PM — Little Fins (White)',
    amountDue: '$240',
    paymentLink: 'https://example.com/pay',
    dueDate: 'June 8, 2025',
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
const infoText = { fontSize: '14px', color: '#0f2343', margin: '0' }
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
