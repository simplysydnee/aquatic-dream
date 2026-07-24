import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Heading, Html, Preview, Section, Hr, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  familyName?: string
  swimmerName?: string
  programName?: string
  parentEmail?: string
  parentPhone?: string
  reason?: string
  reasonDetail?: string
  finalChargeDate?: string
  effectiveEndDate?: string
}

const Email = ({
  familyName, swimmerName, programName, parentEmail, parentPhone,
  reason, reasonDetail, finalChargeDate, effectiveEndDate,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Cancellation requested — {swimmerName || 'a swimmer'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Membership cancellation requested</Heading>
        <Section style={card}>
          <Text style={row}><b>Family:</b> {familyName || '—'}</Text>
          <Text style={row}><b>Swimmer:</b> {swimmerName || '—'}</Text>
          <Text style={row}><b>Program:</b> {programName || '—'}</Text>
          <Hr style={hr} />
          <Text style={row}><b>Email:</b> {parentEmail || '—'}</Text>
          <Text style={row}><b>Phone:</b> {parentPhone || '—'}</Text>
          <Hr style={hr} />
          <Text style={row}><b>Reason:</b> {reason || '—'}</Text>
          {reasonDetail && <Text style={row}><b>Detail:</b> {reasonDetail}</Text>}
          <Hr style={hr} />
          <Text style={row}><b>Final charge:</b> {finalChargeDate || '—'}</Text>
          <Text style={row}><b>Ends:</b> {effectiveEndDate || '—'}</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: 'Membership cancellation requested',
  displayName: 'Internal: membership cancellation alert',
  to: 'info@aquaticdreamsswim.com',
  previewData: {
    familyName: 'Sydnee',
    swimmerName: 'Luca',
    programName: 'Small Group Swim',
    parentEmail: 'parent@example.com',
    parentPhone: '+12095551234',
    reason: 'too_busy',
    reasonDetail: 'Schedule got hectic this fall.',
    finalChargeDate: 'September 1, 2026',
    effectiveEndDate: 'September 30, 2026',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '500px', margin: '0 auto' }
const h1 = { color: '#1a3a8a', fontSize: '20px', margin: '0 0 12px' }
const card = { backgroundColor: '#f7f3ee', borderRadius: '8px', padding: '16px 20px', margin: '16px 0' }
const row = { color: '#222', fontSize: '14px', margin: '4px 0', lineHeight: '20px' }
const hr = { borderColor: '#e5ded3', margin: '10px 0' }
