import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const PRIVATE_BOOKING_URL = 'https://aquaticdreamsswim.com/book-private-lesson'
const ENROLLMENT_URL = 'https://aquaticdreamsswim.com/swim-enrollment'

interface Props {
  parentFirstName?: string
  childFirstName?: string
  swimLevel?: string
  sessionName?: string
  privateLessonPriceUsd?: number
}

const WaitlistConfirmation = ({
  parentFirstName,
  childFirstName,
  swimLevel,
  sessionName,
  privateLessonPriceUsd = 50,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>We got your waitlist request — you have not been enrolled or charged</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>We got your waitlist request</Heading>
        <Text style={text}>
          Hi {parentFirstName || 'there'}, thanks for reaching out about
          {childFirstName ? ` ${childFirstName}` : ''}{' '}for
          {swimLevel ? ` our ${swimLevel} class` : ' a swim class'}
          {sessionName ? ` (${sessionName})` : ''}.
        </Text>
        <Text style={notice}>
          <strong>You have not been enrolled or charged for anything yet.</strong> This email
          is just to confirm we received your waitlist request.
        </Text>
        <Text style={text}>
          That class is currently full. We've added you to the waitlist and notified the
          owner — if a seat opens, we'll email you right away. Most full classes get at
          least one cancellation, so it's worth holding the spot.
        </Text>

        <Text style={text}>From here, you have two options:</Text>

        <Section style={promoBox}>
          <Text style={promoTitle}>Option 1 — Want a private lesson instead?</Text>
          <Text style={promoText}>
            If you'd rather not wait, you can choose to book a private lesson on your own
            at <strong>${privateLessonPriceUsd}/lesson</strong> (June promo). Nothing is
            booked unless you complete checkout yourself.
          </Text>
          <Section style={{ textAlign: 'center', margin: '16px 0 4px' }}>
            <Button href={PRIVATE_BOOKING_URL} style={button}>
              Book a private lesson
            </Button>
          </Section>
        </Section>

        <Text style={text}>
          <strong>Option 2 —</strong> Pick a different group session.{' '}
          <a href={ENROLLMENT_URL} style={link}>
            Check other group sessions
          </a>{' '}
          — different days, times, or levels may still have openings.
        </Text>


        <Hr style={hr} />
        <Text style={footer}>
          Questions? Reply to this email or call (209) 577-3483.<br />
          Aquatic Dreams Swim · Modesto, CA
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: WaitlistConfirmation,
  subject: () => `We got your waitlist request — Aquatic Dreams`,
  displayName: 'Waitlist confirmation (to parent)',
  previewData: {
    parentFirstName: 'Sydnee',
    childFirstName: 'Avery',
    swimLevel: 'Yellow',
    sessionName: 'Session 1 · Mon/Wed 4:30pm',
    privateLessonPriceUsd: 50,
  },
} satisfies TemplateEntry


const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif' }
const container = { padding: '24px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '24px', fontWeight: 'bold', color: '#2a5e84', margin: '0 0 12px' }
const text = { fontSize: '15px', color: '#222', lineHeight: '1.6', margin: '0 0 14px' }
const notice = { fontSize: '15px', color: '#1a3a8a', lineHeight: '1.6', margin: '0 0 14px', padding: '12px 14px', backgroundColor: '#eef3fa', borderRadius: '6px' }
const link = { color: '#2a5e84', textDecoration: 'underline' }
const promoBox = {
  backgroundColor: '#fff5f2',
  borderLeft: '4px solid #F58B76',
  padding: '18px 20px',
  borderRadius: '6px',
  margin: '8px 0 18px',
}
const promoTitle = { fontSize: '16px', fontWeight: 'bold', color: '#1a3a8a', margin: '0 0 6px' }
const promoText = { fontSize: '14px', color: '#222', lineHeight: '1.6', margin: '0 0 8px' }
const button = {
  backgroundColor: '#F58B76',
  color: '#ffffff',
  padding: '12px 28px',
  borderRadius: '6px',
  fontSize: '15px',
  fontWeight: 'bold',
  textDecoration: 'none',
  display: 'inline-block',
}
const hr = { borderColor: '#e6e6e6', margin: '24px 0 12px' }
const footer = { fontSize: '12px', color: '#888', textAlign: 'center' as const, margin: 0, lineHeight: '1.6' }
