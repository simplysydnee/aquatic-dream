import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const ADMIN_URL = 'https://aquaticdreamsswim.com/admin/enrollments?tab=waitlist'

interface Props {
  parentName?: string
  parentEmail?: string
  parentPhone?: string
  childName?: string
  childAge?: number | string
  swimLevel?: string
  sessionName?: string
  notes?: string
  submittedAt?: string
}

const WaitlistOwnerAlert = (p: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Waitlist request — {p.swimLevel || 'full class'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Waitlist Request</Heading>
        <Text style={subtle}>
          A parent tried to enroll in a class that is currently full. They've been added
          to the waitlist and sent a friendly note with a private-lesson option.
        </Text>

        <Section style={infoBox}>
          <Text style={row}><strong>Level requested:</strong> {p.swimLevel || '—'}</Text>
          <Text style={row}><strong>Session:</strong> {p.sessionName || '—'}</Text>
          <Text style={row}><strong>Child:</strong> {p.childName || '—'}{p.childAge ? ` (age ${p.childAge})` : ''}</Text>
          <Text style={row}><strong>Parent:</strong> {p.parentName || '—'}</Text>
          <Text style={row}><strong>Email:</strong> {p.parentEmail || '—'}</Text>
          <Text style={row}><strong>Phone:</strong> {p.parentPhone || '—'}</Text>
          {p.notes && <Text style={row}><strong>Notes:</strong> {p.notes}</Text>}
          {p.submittedAt && <Text style={row}><strong>Submitted:</strong> {p.submittedAt}</Text>}
        </Section>

        <Text style={subtle}>
          Consider opening a new session for this level if you're seeing multiple requests.
        </Text>

        <Section style={{ textAlign: 'center', margin: '24px 0' }}>
          <Button href={ADMIN_URL} style={button}>Open waitlist in Admin</Button>
        </Section>

        <Hr style={hr} />
        <Text style={footer}>Aquatic Dreams · internal staff alert</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: WaitlistOwnerAlert,
  subject: (d: Record<string, any>) =>
    `Waitlist request — ${d?.swimLevel || 'full class'}${d?.childName ? ` (${d.childName})` : ''}`,
  displayName: 'Internal: waitlist alert',
  previewData: {
    parentName: 'Sydnee Smith',
    parentEmail: 'parent@example.com',
    parentPhone: '(209) 555-0123',
    childName: 'Avery Smith',
    childAge: 6,
    swimLevel: 'Yellow',
    sessionName: 'Session 1 · Mon/Wed 4:30pm',
    submittedAt: new Date().toLocaleString(),
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif' }
const container = { padding: '24px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '22px', fontWeight: 'bold', color: '#2a5e84', margin: '0 0 8px' }
const subtle = { fontSize: '14px', color: '#666', margin: '0 0 14px', lineHeight: '1.6' }
const infoBox = {
  backgroundColor: '#f4f8fb',
  borderLeft: '4px solid #2a5e84',
  padding: '14px 18px',
  borderRadius: '4px',
  margin: '0 0 8px',
}
const row = { fontSize: '14px', color: '#222', lineHeight: '1.6', margin: '0 0 4px' }
const button = {
  backgroundColor: '#F58B76',
  color: '#ffffff',
  padding: '12px 24px',
  borderRadius: '6px',
  fontSize: '15px',
  fontWeight: 'bold',
  textDecoration: 'none',
  display: 'inline-block',
}
const hr = { borderColor: '#e6e6e6', margin: '24px 0 12px' }
const footer = { fontSize: '12px', color: '#888', textAlign: 'center' as const, margin: 0 }
