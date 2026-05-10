import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const ADMIN_URL = 'https://aquaticdreamsswim.com/admin/lesson-requests'

interface Props {
  parentName?: string
  parentEmail?: string
  parentPhone?: string
  childName?: string
  childAge?: number | string
  lessonType?: string
  preferredTimes?: string
  notes?: string
  submittedAt?: string
}

const formatType = (t?: string) =>
  t === 'private' ? 'Private' : t === 'semi-private' ? 'Semi-Private' : (t || '—')

const truncate = (s?: string, n = 300) =>
  !s ? '—' : s.length > n ? s.slice(0, n) + '…' : s

const InternalLessonRequestAlert = (p: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>New lesson request — {p.childName || 'new child'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>New Lesson Request</Heading>
        <Text style={subtle}>
          A parent just submitted a lesson request through the website.
        </Text>

        <Section style={infoBox}>
          <Text style={row}><strong>Child:</strong> {p.childName || '—'}{p.childAge ? ` (age ${p.childAge})` : ''}</Text>
          <Text style={row}><strong>Lesson type:</strong> {formatType(p.lessonType)}</Text>
          <Text style={row}><strong>Parent:</strong> {p.parentName || '—'}</Text>
          <Text style={row}><strong>Email:</strong> {p.parentEmail || '—'}</Text>
          <Text style={row}><strong>Phone:</strong> {p.parentPhone || '—'}</Text>
          <Text style={row}><strong>Preferred times:</strong> {p.preferredTimes || '—'}</Text>
          <Text style={row}><strong>Notes:</strong> {truncate(p.notes)}</Text>
          {p.submittedAt && <Text style={row}><strong>Submitted:</strong> {p.submittedAt}</Text>}
        </Section>

        <Section style={{ textAlign: 'center', margin: '24px 0' }}>
          <Button href={ADMIN_URL} style={button}>Open in Admin</Button>
        </Section>

        <Hr style={hr} />
        <Text style={footer}>
          Aquatic Dreams · internal staff alert
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: InternalLessonRequestAlert,
  subject: (d: Record<string, any>) =>
    `New lesson request — ${d?.childName || 'new child'}${d?.childAge ? ` (age ${d.childAge})` : ''}`,
  displayName: 'Internal: lesson request alert',
  previewData: {
    parentName: 'Sydnee Smith',
    parentEmail: 'parent@example.com',
    parentPhone: '(209) 555-0123',
    childName: 'Avery Smith',
    childAge: 6,
    lessonType: 'private',
    preferredTimes: 'Weekday afternoons after 4pm',
    notes: 'Avery is comfortable in the water but has never had formal lessons.',
    submittedAt: new Date().toLocaleString(),
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif' }
const container = { padding: '24px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '22px', fontWeight: 'bold', color: '#2a5e84', margin: '0 0 8px' }
const subtle = { fontSize: '14px', color: '#666', margin: '0 0 18px' }
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
