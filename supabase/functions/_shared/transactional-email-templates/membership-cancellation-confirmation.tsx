import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Heading, Html, Preview, Section, Hr, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  familyName?: string
  swimmerName?: string
  programName?: string
  finalChargeDate?: string   // "September 1, 2026"
  effectiveEndDate?: string  // "September 30, 2026"
  monthlyPrice?: string
}

const SITE_NAME = 'Aquatic Dreams'

const Email = ({ familyName, swimmerName, programName, finalChargeDate, effectiveEndDate, monthlyPrice }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your {SITE_NAME} membership is scheduled to end</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Your cancellation is confirmed</Heading>
        <Text style={p}>
          {familyName ? `Hi ${familyName},` : 'Hi there,'} we've received your request to cancel
          {swimmerName ? ` ${swimmerName}'s` : ''}{programName ? ` ${programName}` : ''} membership.
        </Text>

        <Section style={card}>
          <Text style={cardLabel}>Final charge</Text>
          <Text style={cardValue}>{finalChargeDate || 'the next billing date'}{monthlyPrice ? ` · ${monthlyPrice}` : ''}</Text>
          <Hr style={hr} />
          <Text style={cardLabel}>Membership ends</Text>
          <Text style={cardValue}>{effectiveEndDate || 'end of the paid month'}</Text>
          <Hr style={hr} />
          <Text style={cardLabel}>What to expect</Text>
          <Text style={cardValueSmall}>
            You'll be billed one more time on {finalChargeDate || 'the next billing date'}. Your
            membership stays active through {effectiveEndDate || 'the end of that paid month'},
            then ends. No charges after that.
          </Text>
        </Section>

        <Text style={p}>
          Change your mind? Just reply to this email or call us at (209) 480-4262 before the
          end date and we'll keep your spot.
        </Text>

        <Text style={footer}>{SITE_NAME} · 1212 Kansas Ave, Modesto, CA 95351</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: 'Your Aquatic Dreams membership cancellation',
  displayName: 'Membership cancellation confirmation',
  previewData: {
    familyName: 'Sydnee',
    swimmerName: 'Luca',
    programName: 'Small Group Swim',
    finalChargeDate: 'September 1, 2026',
    effectiveEndDate: 'September 30, 2026',
    monthlyPrice: '$140',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '500px', margin: '0 auto' }
const h1 = { color: '#1a3a8a', fontSize: '22px', margin: '0 0 12px' }
const p = { color: '#222', fontSize: '15px', lineHeight: '22px' }
const card = { backgroundColor: '#f7f3ee', borderRadius: '8px', padding: '16px 20px', margin: '16px 0' }
const cardLabel = { color: '#666', fontSize: '12px', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0' }
const cardValue = { color: '#1a3a8a', fontSize: '16px', fontWeight: 600, margin: '4px 0 8px' }
const cardValueSmall = { color: '#222', fontSize: '14px', margin: '4px 0 8px', lineHeight: '20px' }
const hr = { borderColor: '#e5ded3', margin: '10px 0' }
const footer = { color: '#888', fontSize: '12px', marginTop: '24px', textAlign: 'center' as const }
