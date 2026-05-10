import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const ADMIN_URL = 'https://aquaticdreamsswim.com/admin/applications'

interface Props {
  applicantName?: string
  applicantEmail?: string
  applicantPhone?: string
  jobTitle?: string
  availability?: string
  certifications?: string
  swimmingAbility?: string
  experience?: string
  availableStartDate?: string
  submittedAt?: string
}

const truncate = (s?: string, n = 300) =>
  !s ? '—' : s.length > n ? s.slice(0, n) + '…' : s

const InternalJobApplicationAlert = (p: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>New job application — {p.applicantName || 'new applicant'}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>New Job Application</Heading>
        <Text style={subtle}>
          A new application was just submitted through the careers page.
        </Text>

        <Section style={infoBox}>
          <Text style={row}><strong>Applicant:</strong> {p.applicantName || '—'}</Text>
          <Text style={row}><strong>Position:</strong> {p.jobTitle || '—'}</Text>
          <Text style={row}><strong>Email:</strong> {p.applicantEmail || '—'}</Text>
          <Text style={row}><strong>Phone:</strong> {p.applicantPhone || '—'}</Text>
          <Text style={row}><strong>Availability:</strong> {p.availability || '—'}</Text>
          <Text style={row}><strong>Certifications:</strong> {p.certifications || '—'}</Text>
          <Text style={row}><strong>Swimming ability:</strong> {p.swimmingAbility || '—'}</Text>
          <Text style={row}><strong>Experience with children:</strong> {truncate(p.experience)}</Text>
          <Text style={row}><strong>Available start date:</strong> {p.availableStartDate || '—'}</Text>
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
  component: InternalJobApplicationAlert,
  subject: (d: Record<string, any>) =>
    `New job application — ${d?.applicantName || 'new applicant'}${d?.jobTitle ? ` for ${d.jobTitle}` : ''}`,
  displayName: 'Internal: job application alert',
  previewData: {
    applicantName: 'Jordan Lee',
    applicantEmail: 'jordan@example.com',
    applicantPhone: '(209) 555-0199',
    jobTitle: 'Swim Instructor',
    availability: 'Weekday afternoons, Weekends',
    certifications: 'Lifeguard Certification, CPR / First Aid',
    swimmingAbility: 'Advanced',
    experience: 'Yes — coached youth summer league for two seasons.',
    availableStartDate: '2026-06-01',
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
