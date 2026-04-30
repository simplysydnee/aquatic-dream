import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Preview, Text, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "Aquatic Dreams"
const LOGO_URL = 'https://jilrijklnehbfuulykty.supabase.co/storage/v1/object/public/email-assets/aqd-email-logo.jpg'
const ADDRESS = '1212 Kansas Ave, Modesto, CA 95351'

interface LessonReminderProps {
  parentName?: string
  childName?: string
  lessonDate?: string
  lessonTime?: string
  sessionInfo?: string
  levelLabel?: string
  sessionStartDate?: string
  sessionEndDate?: string
}

const LessonReminderEmail = ({
  parentName,
  childName,
  lessonDate,
  lessonTime,
  sessionInfo,
  levelLabel,
  sessionStartDate,
  sessionEndDate,
}: LessonReminderProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>
      Reminder: {childName || 'your swimmer'}'s lesson on {lessonDate || 'tomorrow'}
      {lessonTime ? ` at ${lessonTime}` : ''} — {SITE_NAME}
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={LOGO_URL} width="80" height="80" alt="Aquatic Dreams" style={logo} />
        <Heading style={h1}>{SITE_NAME}</Heading>
        <Hr style={hr} />

        <Text style={text}>
          {parentName ? `Hi ${parentName},` : 'Hello,'}
        </Text>

        <Text style={text}>
          This is a friendly reminder that <strong>{childName || 'your swimmer'}</strong> has
          a swim lesson on{' '}
          <strong>
            {lessonDate || 'the scheduled date'}
            {lessonTime ? ` at ${lessonTime}` : ''}
          </strong>.
        </Text>

        <Section style={infoBox}>
          <Text style={infoText}>
            📅 <strong>{lessonDate || 'Scheduled date'}</strong>
            {lessonTime ? ` at ${lessonTime}` : ''}
          </Text>
          {levelLabel && (
            <Text style={{ ...infoText, marginTop: '4px' }}>
              🏊 Level: {levelLabel}
            </Text>
          )}
          {sessionInfo && (
            <Text style={{ ...infoText, marginTop: '4px' }}>
              📋 {sessionInfo}
            </Text>
          )}
          {(sessionStartDate || sessionEndDate) && (
            <Text style={{ ...infoText, marginTop: '4px' }}>
              📆 Session dates: {sessionStartDate}
              {sessionEndDate ? ` – ${sessionEndDate}` : ''}
            </Text>
          )}
          <Text style={{ ...infoText, marginTop: '8px' }}>
            📍 {ADDRESS}
          </Text>
        </Section>

        <Text style={text}>
          Please arrive a few minutes early and bring a towel and swimsuit. See you at the pool!
        </Text>

        <Hr style={hr} />

        <Text style={text}>
          Questions? Contact us at info@aquaticdreamsswim.com or call (209) 577-3483.
        </Text>

        <Text style={footer}>
          Best regards,<br />
          The {SITE_NAME} Team
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: LessonReminderEmail,
  subject: (data: Record<string, any>) => {
    const who = data.childName ? ` for ${data.childName}` : ''
    const when = data.lessonDate
      ? ` — ${data.lessonDate}${data.lessonTime ? ` at ${data.lessonTime}` : ''}`
      : ''
    return `Lesson Reminder${who}${when} — ${SITE_NAME}`
  },
  displayName: 'Lesson reminder',
  previewData: {
    parentName: 'Jane',
    childName: 'Tommy',
    lessonDate: 'Monday, June 9',
    lessonTime: '3:00 PM',
    sessionInfo: 'Session 1',
    levelLabel: 'Little Fins — Preschool 1 (White)',
    sessionStartDate: 'June 8, 2025',
    sessionEndDate: 'July 2, 2025',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Plus Jakarta Sans', Arial, sans-serif" }
const container = { padding: '30px 25px', maxWidth: '560px', margin: '0 auto' }
const logo = { display: 'block', margin: '0 0 10px' }
const h1 = { fontSize: '24px', fontWeight: '700' as const, color: '#0f2343', margin: '0 0 10px', fontFamily: "'Playfair Display', Georgia, serif" }
const hr = { borderColor: '#5badcb', borderWidth: '2px', margin: '15px 0 25px' }
const text = { fontSize: '15px', color: '#333', lineHeight: '1.6', margin: '0 0 16px' }
const infoBox = { backgroundColor: '#f0f7fa', borderLeft: '4px solid #5badcb', padding: '12px 16px', borderRadius: '4px', margin: '0 0 16px' }
const infoText = { fontSize: '14px', color: '#0f2343', margin: '0' }
const footer = { fontSize: '13px', color: '#888', margin: '30px 0 0', lineHeight: '1.5' }
