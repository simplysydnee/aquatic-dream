import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  parentFirstName?: string
  swimmerName?: string
  programName?: string
  requestedTime?: string
  instructorName?: string
  swimLevel?: string
}

const MembershipWaitlistConfirmation = ({
  parentFirstName,
  swimmerName,
  programName,
  requestedTime,
  instructorName,
  swimLevel,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>We got your waitlist request — you have not been enrolled or charged</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>We got your waitlist request</Heading>
        <Text style={text}>
          Hi {parentFirstName || 'there'}, thanks for reaching out about a spot
          {swimmerName ? ` for ${swimmerName}` : ''}
          {programName ? ` in ${programName}` : ''}.
        </Text>
        <Text style={notice}>
          <strong>You have not been enrolled or charged for anything yet.</strong> This
          email just confirms we received your request.
        </Text>

        <Section style={infoBox}>
          {programName && <Text style={row}><strong>Program:</strong> {programName}</Text>}
          {requestedTime && <Text style={row}><strong>Requested time:</strong> {requestedTime}</Text>}
          {instructorName && <Text style={row}><strong>Instructor:</strong> {instructorName}</Text>}
          {swimLevel && <Text style={row}><strong>Group:</strong> {swimLevel}</Text>}
        </Section>

        <Text style={text}>
          That time is full right now. We will reach out as soon as a spot opens up, and
          we will help you find another time that works if one comes free sooner.
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
  component: MembershipWaitlistConfirmation,
  subject: () => 'We got your waitlist request — Aquatic Dreams',
  displayName: 'Membership waitlist confirmation (to parent)',
  previewData: {
    parentFirstName: 'Sydnee',
    swimmerName: 'Avery Smith',
    programName: 'Small Group Swim',
    requestedTime: 'Monday 4:30pm',
    instructorName: 'Karolina',
    swimLevel: 'Yellow',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif' }
const container = { padding: '24px', maxWidth: '500px', margin: '0 auto' }
const h1 = { fontSize: '24px', fontWeight: 'bold', color: '#2a5e84', margin: '0 0 12px' }
const text = { fontSize: '15px', color: '#222', lineHeight: '1.6', margin: '0 0 14px' }
const notice = {
  fontSize: '15px', color: '#1a3a8a', lineHeight: '1.6', margin: '0 0 14px',
  padding: '12px 14px', backgroundColor: '#eef3fa', borderRadius: '6px',
}
const infoBox = {
  backgroundColor: '#f4f8fb',
  borderLeft: '4px solid #2a5e84',
  padding: '14px 18px',
  borderRadius: '4px',
  margin: '0 0 16px',
}
const row = { fontSize: '14px', color: '#222', lineHeight: '1.6', margin: '0 0 4px' }
const hr = { borderColor: '#e6e6e6', margin: '24px 0 12px' }
const footer = { fontSize: '12px', color: '#888', textAlign: 'center' as const, margin: 0 }
