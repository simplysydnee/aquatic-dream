import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Preview, Text, Button, Link, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "Aquatic Dreams"
const LOGO_URL = 'https://jilrijklnehbfuulykty.supabase.co/storage/v1/object/public/email-assets/aqd-email-logo.jpg'

interface Props {
  parentName?: string
  childName?: string
  sessionInfo?: string
  waiverLink?: string
}

const Email = ({ parentName, childName, sessionInfo, waiverLink }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Please sign the swim lesson waiver for {childName || 'your swimmer'} — {SITE_NAME}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={LOGO_URL} width="80" height="80" alt="Aquatic Dreams" style={logo} />
        <Heading style={h1}>{SITE_NAME}</Heading>
        <Hr style={hr} />
        <Text style={text}>{parentName ? `Hi ${parentName},` : 'Hello,'}</Text>
        <Text style={text}>
          Before {childName ? <strong>{childName}</strong> : 'your swimmer'}'s first lesson, please
          complete the liability waiver and emergency-contact form. It takes about 2 minutes.
        </Text>
        {sessionInfo && (
          <Section style={infoBox}>
            <Text style={infoText}>📋 {sessionInfo}</Text>
          </Section>
        )}
        {waiverLink && (
          <>
            <Section style={{ textAlign: 'center' as const, margin: '24px 0 12px' }}>
              <Button style={button} href={waiverLink}>Sign Waiver</Button>
            </Section>
            <Text style={{ ...mutedText, textAlign: 'center' as const }}>
              Or copy this link into your browser:<br />
              <Link href={waiverLink} style={linkStyle}>{waiverLink}</Link>
            </Text>
          </>
        )}
        <Hr style={hr} />
        <Text style={text}>Questions? Email info@aquaticdreamsswim.com or call (209) 577-3483.</Text>
        <Text style={footer}>Thanks,<br />The {SITE_NAME} Team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    `Please sign the swim waiver${data.childName ? ` for ${data.childName}` : ''} — ${SITE_NAME}`,
  displayName: 'Enrollment waiver link',
  previewData: {
    parentName: 'Jane',
    childName: 'Tommy',
    sessionInfo: 'Session 1 — Mon 3:00 PM — Little Fins (White)',
    waiverLink: 'https://example.com/enrollment-waiver/abc123',
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
const infoText = { fontSize: '14px', color: '#0f2343', margin: '0' }
const linkStyle = { color: '#5badcb', textDecoration: 'underline' }
const button = {
  backgroundColor: '#0f2343',
  color: '#ffffff',
  padding: '14px 28px',
  borderRadius: '8px',
  fontSize: '16px',
  fontWeight: '600' as const,
  textDecoration: 'none',
  display: 'inline-block' as const,
}
const footer = { fontSize: '13px', color: '#888', margin: '30px 0 0', lineHeight: '1.5' }
