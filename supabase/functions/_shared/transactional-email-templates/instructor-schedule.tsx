import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Preview, Text, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "Aquatic Dreams"
const LOGO_URL = 'https://jilrijklnehbfuulykty.supabase.co/storage/v1/object/public/email-assets/AQD_Favicon.png'
const CONTACT_EMAIL = 'info@aquaticdreamsswim.com'

interface ShiftRow {
  date: string      // formatted, e.g. "Mon, Jun 9"
  time: string      // e.g. "9:00 AM – 12:00 PM"
  position?: string
  notes?: string
}

interface InstructorScheduleProps {
  instructorName?: string
  weekLabel?: string
  shifts?: ShiftRow[]
}

const InstructorScheduleEmail = ({
  instructorName,
  weekLabel,
  shifts = [],
}: InstructorScheduleProps) => {
  const greeting = instructorName ? `Hi ${instructorName.split(' ')[0]},` : 'Hi there,'

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Your schedule for {weekLabel || 'this week'}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Img src={LOGO_URL} width="80" height="80" alt="Aquatic Dreams" style={logo} />
          <Heading style={h1}>{SITE_NAME}</Heading>

          <Text style={text}>{greeting}</Text>
          <Text style={text}>
            Your schedule for the week of <strong>{weekLabel}</strong> has been published.
          </Text>

          <Section style={infoBox}>
            {shifts.length === 0 ? (
              <Text style={infoLine}>You have no shifts scheduled this week.</Text>
            ) : (
              shifts.map((s, i) => (
                <Text key={i} style={infoLine}>
                  <strong>{s.date}</strong> · {s.time}
                  {s.position ? ` · ${s.position}` : ''}
                  {s.notes ? ` — ${s.notes}` : ''}
                </Text>
              ))
            )}
          </Section>

          <Text style={text}>
            Questions? Reply to this email or contact{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} style={link}>{CONTACT_EMAIL}</a>.
          </Text>

          <Hr style={hr} />
          <Text style={signoff}>Thanks,<br />The {SITE_NAME} Team</Text>
          <Text style={footer}>{SITE_NAME} · {CONTACT_EMAIL}</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: InstructorScheduleEmail,
  subject: (data: Record<string, any>) =>
    `Your schedule — week of ${data?.weekLabel || ''}`.trim(),
  displayName: 'Instructor schedule published',
  previewData: {
    instructorName: 'Sutton',
    weekLabel: 'Jun 9, 2026',
    shifts: [
      { date: 'Mon, Jun 9', time: '9:00 AM – 12:00 PM', position: 'Lesson' },
      { date: 'Wed, Jun 11', time: '4:00 PM – 6:00 PM', position: 'Private Lesson', notes: 'Bring kickboards' },
    ],
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif' }
const container = { padding: '24px', maxWidth: '560px', margin: '0 auto' }
const logo = { display: 'block', margin: '0 auto 8px' }
const h1 = { fontSize: '20px', fontWeight: 'bold', color: '#1a3a8a', textAlign: 'center' as const, margin: '0 0 24px' }
const text = { fontSize: '15px', color: '#333', lineHeight: '1.6', margin: '0 0 14px' }
const infoBox = {
  backgroundColor: '#f4f8fb',
  borderLeft: '4px solid #2a5e84',
  padding: '14px 18px',
  borderRadius: '4px',
  margin: '12px 0 20px',
}
const infoLine = { fontSize: '14px', color: '#222', lineHeight: '1.6', margin: '0 0 6px' }
const link = { color: '#2a5e84', textDecoration: 'underline' }
const hr = { borderColor: '#e6e6e6', margin: '28px 0 18px' }
const signoff = { fontSize: '15px', color: '#333', margin: '0 0 20px' }
const footer = { fontSize: '12px', color: '#888', textAlign: 'center' as const, margin: '12px 0 0' }
