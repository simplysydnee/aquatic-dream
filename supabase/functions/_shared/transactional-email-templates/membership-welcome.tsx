import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Section, Hr, Link,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  familyName?: string
  swimmerName?: string
  programName?: string
  firstLessonDate?: string // "Monday, August 17, 2026"
  classTime?: string       // "4:00 PM"
  monthlyPrice?: string    // "$140"
  facilityAddress?: string
  manageUrl?: string
}

const DEFAULT_ADDRESS = '1212 Kansas Ave, Modesto, CA 95351'
const SITE_NAME = 'Aquatic Dreams'

const MembershipWelcomeEmail = ({
  familyName,
  swimmerName,
  programName,
  firstLessonDate,
  classTime,
  monthlyPrice,
  facilityAddress,
  manageUrl,
}: Props) => {
  const address = facilityAddress || DEFAULT_ADDRESS
  const mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Welcome to {SITE_NAME} — first lesson {firstLessonDate || 'soon'}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Welcome to {SITE_NAME}!</Heading>
          <Text style={p}>
            {familyName ? `Hi ${familyName},` : 'Hi there,'} thanks for enrolling
            {swimmerName ? ` ${swimmerName}` : ''} in our{programName ? ` ${programName}` : ''} membership.
          </Text>

          <Section style={card}>
            <Text style={cardLabel}>First lesson</Text>
            <Text style={cardValue}>{firstLessonDate || 'To be scheduled'}</Text>
            {classTime && <Text style={cardValue}>{classTime}</Text>}
            <Hr style={hr} />
            <Text style={cardLabel}>Location</Text>
            <Text style={cardValue}>
              <Link href={mapsLink} style={link}>{address}</Link>
            </Text>
            {monthlyPrice && (
              <>
                <Hr style={hr} />
                <Text style={cardLabel}>Monthly membership</Text>
                <Text style={cardValue}>{monthlyPrice} per month</Text>
              </>
            )}
          </Section>

          <Text style={p}>
            Please arrive a few minutes early for your first class. Suits, goggles, and towels
            are welcome. See you at the pool!
          </Text>

          {manageUrl && (
            <Text style={small}>
              Need to update or cancel later? <Link href={manageUrl} style={link}>Manage or cancel your membership</Link>.
            </Text>
          )}

          <Text style={footer}>{SITE_NAME} · {address}</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: MembershipWelcomeEmail,
  subject: 'Welcome to Aquatic Dreams',
  displayName: 'Membership welcome',
  previewData: {
    familyName: 'Sydnee',
    swimmerName: 'Luca',
    programName: 'Small Group Swim',
    firstLessonDate: 'Monday, August 17, 2026',
    classTime: '4:00 PM',
    monthlyPrice: '$140',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '500px', margin: '0 auto' }
const h1 = { color: '#1a3a8a', fontSize: '24px', margin: '0 0 16px' }
const p = { color: '#222', fontSize: '15px', lineHeight: '22px' }
const card = { backgroundColor: '#f7f3ee', borderRadius: '8px', padding: '16px 20px', margin: '16px 0' }
const cardLabel = { color: '#666', fontSize: '12px', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0' }
const cardValue = { color: '#1a3a8a', fontSize: '16px', fontWeight: 600, margin: '4px 0 8px' }
const hr = { borderColor: '#e5ded3', margin: '10px 0' }
const link = { color: '#2a5e84', textDecoration: 'underline' }
const footer = { color: '#888', fontSize: '12px', marginTop: '24px', textAlign: 'center' as const }
