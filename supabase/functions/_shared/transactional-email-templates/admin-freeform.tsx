import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Preview, Text, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Aquatic Dreams'
const LOGO_URL = 'https://jilrijklnehbfuulykty.supabase.co/storage/v1/object/public/email-assets/aqd-email-logo.jpg'
const CONTACT_EMAIL = 'info@aquaticdreamsswim.com'
const CONTACT_PHONE = '(209) 577-3483'

interface AdminFreeformProps {
  parentName?: string
  body?: string
  subject?: string
}

const AdminFreeformEmail = ({ parentName, body }: AdminFreeformProps) => {
  const greeting = parentName ? `Hi ${parentName.split(' ')[0]},` : 'Hi there,'
  const lines = (body || '').split(/\r?\n/)

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>A message from {SITE_NAME}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Img src={LOGO_URL} width="80" height="80" alt={SITE_NAME} style={logo} />
          <Heading style={h1}>{SITE_NAME}</Heading>

          <Text style={text}>{greeting}</Text>

          <Section style={messageBox}>
            {lines.map((line, i) => (
              <Text key={i} style={messageLine}>{line || '\u00A0'}</Text>
            ))}
          </Section>

          <Text style={text}>
            Reply to this email or call us at{' '}
            <a href={`tel:${CONTACT_PHONE.replace(/\D/g, '')}`} style={link}>{CONTACT_PHONE}</a>.
          </Text>

          <Hr style={hr} />
          <Text style={signoff}>Warmly,<br />The {SITE_NAME} Team</Text>
          <Text style={footer}>
            {SITE_NAME} · <a href={`mailto:${CONTACT_EMAIL}`} style={footerLink}>{CONTACT_EMAIL}</a> · {CONTACT_PHONE}
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: AdminFreeformEmail,
  subject: (data: Record<string, any>) => data?.subject || `A message from ${SITE_NAME}`,
  displayName: 'Admin freeform message',
  previewData: {
    parentName: 'Sydnee',
    subject: 'Quick update about your lessons',
    body: 'Just wanted to follow up on your scheduling question.\n\nLet me know what works best for you!',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif' }
const container = { padding: '24px', maxWidth: '560px', margin: '0 auto' }
const logo = { display: 'block', margin: '0 auto 8px' }
const h1 = { fontSize: '20px', fontWeight: 'bold', color: '#1a3a8a', textAlign: 'center' as const, margin: '0 0 24px' }
const text = { fontSize: '15px', color: '#333', lineHeight: '1.6', margin: '0 0 14px' }
const messageBox = {
  backgroundColor: '#f4f8fb',
  borderLeft: '4px solid #2a5e84',
  padding: '14px 18px',
  borderRadius: '4px',
  margin: '12px 0 20px',
}
const messageLine = { fontSize: '15px', color: '#222', lineHeight: '1.6', margin: '0 0 6px' }
const link = { color: '#2a5e84', textDecoration: 'underline' }
const hr = { borderColor: '#e6e6e6', margin: '28px 0 18px' }
const signoff = { fontSize: '15px', color: '#333', margin: '0 0 20px' }
const footer = { fontSize: '12px', color: '#888', textAlign: 'center' as const, margin: '12px 0 0' }
const footerLink = { color: '#888', textDecoration: 'underline' }
