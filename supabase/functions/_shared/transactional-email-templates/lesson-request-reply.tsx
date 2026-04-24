import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Preview, Text, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "Aquatic Dreams"
const LOGO_URL = 'https://jilrijklnehbfuulykty.supabase.co/storage/v1/object/public/email-assets/AQD_Favicon.png'
const CONTACT_EMAIL = 'info@aquaticdreamsswim.com'
const CONTACT_PHONE = '(209) 549-7946'

interface LessonRequestReplyProps {
  parentName?: string
  childName?: string
  body?: string
}

const LessonRequestReplyEmail = ({ parentName, childName, body }: LessonRequestReplyProps) => {
  const greeting = parentName ? `Hi ${parentName.split(' ')[0]},` : 'Hi there,'
  const intro = childName
    ? `Thank you for reaching out about lessons for ${childName}.`
    : `Thank you for reaching out about swim lessons.`
  const lines = (body || '').split(/\r?\n/)

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>A response to your lesson request — {SITE_NAME}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Img src={LOGO_URL} width="80" height="80" alt="Aquatic Dreams" style={logo} />
          <Heading style={h1}>{SITE_NAME}</Heading>

          <Text style={text}>{greeting}</Text>
          <Text style={text}>{intro}</Text>

          <Section style={messageBox}>
            {lines.map((line, i) => (
              <Text key={i} style={messageLine}>{line || '\u00A0'}</Text>
            ))}
          </Section>

          <Text style={text}>
            If you have any follow-up questions, just reply to this email or call us at{' '}
            <a href={`tel:${CONTACT_PHONE.replace(/\D/g, '')}`} style={link}>{CONTACT_PHONE}</a>.
          </Text>

          <Hr style={hr} />

          <Text style={signoff}>
            Warmly,<br />
            The {SITE_NAME} Team
          </Text>

          <Text style={footer}>
            {SITE_NAME} · <a href={`mailto:${CONTACT_EMAIL}`} style={footerLink}>{CONTACT_EMAIL}</a> · {CONTACT_PHONE}
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: LessonRequestReplyEmail,
  subject: (data: Record<string, any>) =>
    data?.subject || `Re: Your lesson request${data?.childName ? ` for ${data.childName}` : ''}`,
  displayName: 'Lesson request reply',
  previewData: {
    parentName: 'Sydnee Smith',
    childName: 'Avery',
    subject: 'Re: Your lesson request for Avery',
    body: "Thanks so much for reaching out!\n\nWe have a Tuesday/Thursday 5:00pm slot opening next week that would be a great fit. Let us know if that works and I'll send the enrollment link.",
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
