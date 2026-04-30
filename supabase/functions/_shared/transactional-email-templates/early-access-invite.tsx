import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Preview, Text, Hr, Section, Button,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "Aquatic Dreams"
const LOGO_URL = 'https://jilrijklnehbfuulykty.supabase.co/storage/v1/object/public/email-assets/aqd-email-logo.jpg'
const ENROLL_URL = 'https://aquatic-dream-quest.lovable.app/swim-enrollment'

interface EarlyAccessInviteProps {
  parentName?: string
}

const EarlyAccessInviteEmail = ({ parentName }: EarlyAccessInviteProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You're invited — early access to swim lesson enrollment is open!</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={LOGO_URL} width="80" height="80" alt="Aquatic Dreams" style={logo} />
        <Heading style={h1}>{SITE_NAME}</Heading>
        <Hr style={hr} />

        <Text style={text}>
          {parentName ? `Hi ${parentName},` : 'Hello,'}
        </Text>

        <Text style={text}>
          We have some exciting news — our brand-new online enrollment system is officially live, and because you
          expressed interest in swim lessons, we wanted to give <strong>you</strong> the chance to be one of the first
          to try it out. Your feedback means the world to us as we work to make the experience as smooth and simple
          as possible for our families.
        </Text>

        <Section style={ctaSection}>
          <Button style={button} href={ENROLL_URL}>
            Enroll Now
          </Button>
        </Section>

        <Text style={text}>
          Once you've had a chance to go through the process, please reply to this email or reach out directly with
          any thoughts — what worked, what didn't, or anything you'd like to see. Every bit of feedback helps!
        </Text>

        <Text style={text}>
          Spots fill fast, so don't wait. We can't wait to see you at the pool!
        </Text>

        <Hr style={hr} />

        <Text style={footer}>
          Warm regards,<br />
          <strong>Sutton Lucas</strong><br />
          {SITE_NAME}
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: EarlyAccessInviteEmail,
  subject: 'Early Access: Swim Lesson Enrollment is Open!',
  displayName: 'Early access invitation',
  previewData: { parentName: 'Sydnee' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Plus Jakarta Sans', Arial, sans-serif" }
const container = { padding: '30px 25px', maxWidth: '560px', margin: '0 auto' }
const logo = { margin: '0 0 10px' }
const h1 = { fontSize: '24px', fontWeight: '700' as const, color: '#0f2343', margin: '0 0 10px', fontFamily: "'Playfair Display', Georgia, serif" }
const hr = { borderColor: '#5badcb', borderWidth: '2px', margin: '15px 0 25px' }
const text = { fontSize: '15px', color: '#333', lineHeight: '1.6', margin: '0 0 16px' }
const ctaSection = { textAlign: 'center' as const, margin: '24px 0' }
const button = {
  backgroundColor: '#2a5e84',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: '600' as const,
  padding: '14px 32px',
  borderRadius: '6px',
  textDecoration: 'none',
  display: 'inline-block',
}
const footer = { fontSize: '13px', color: '#888', margin: '30px 0 0', lineHeight: '1.5' }
