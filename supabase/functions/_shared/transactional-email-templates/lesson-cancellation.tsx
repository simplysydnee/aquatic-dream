import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Preview, Text, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Aquatic Dreams'
const LOGO_URL = 'https://jilrijklnehbfuulykty.supabase.co/storage/v1/object/public/email-assets/aqd-email-logo.jpg'
const ADDRESS = '1212 Kansas Ave, Modesto, CA 95351'

interface LessonCancellationProps {
  parentName?: string
  childName?: string
  lessonDate?: string
  lessonTime?: string
  reason?: string
  // 'cancelled' | 'reassigned'
  action?: string
  newInstructorName?: string
  creditAmount?: string // formatted, e.g. "$30.00"
}

const LessonCancellationEmail = ({
  parentName,
  childName,
  lessonDate,
  lessonTime,
  reason,
  action = 'cancelled',
  newInstructorName,
  creditAmount,
}: LessonCancellationProps) => {
  const isReassign = action === 'reassigned'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>
        {isReassign
          ? `Instructor change for ${childName || 'your swimmer'}'s lesson`
          : `${childName || 'Your swimmer'}'s lesson on ${lessonDate || 'the scheduled date'} has been cancelled`}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Img src={LOGO_URL} width="80" height="80" alt="Aquatic Dreams" style={logo} />
          <Heading style={h1}>{SITE_NAME}</Heading>
          <Hr style={hr} />

          <Text style={text}>{parentName ? `Hi ${parentName},` : 'Hello,'}</Text>

          {isReassign ? (
            <>
              <Text style={text}>
                We wanted to let you know that <strong>{childName || 'your swimmer'}'s</strong> lesson
                on <strong>{lessonDate || 'the scheduled date'}{lessonTime ? ` at ${lessonTime}` : ''}</strong>
                {' '}will now be taught by <strong>{newInstructorName || 'a different instructor'}</strong>.
              </Text>
              <Text style={text}>
                Same time, same place — just a different instructor. We'll see you at the pool!
              </Text>
            </>
          ) : (
            <>
              <Text style={text}>
                We're writing to let you know that <strong>{childName || 'your swimmer'}'s</strong> lesson
                on <strong>{lessonDate || 'the scheduled date'}{lessonTime ? ` at ${lessonTime}` : ''}</strong>
                {' '}has been <strong>cancelled</strong>{reason ? ` (${reason})` : ''}.
              </Text>

              {creditAmount && (
                <Section style={creditBox}>
                  <Text style={creditAmountStyle}>{creditAmount} added to your account credit</Text>
                  <Text style={creditNote}>
                    This credit will be applied automatically toward your next class. No action needed.
                  </Text>
                </Section>
              )}

              <Text style={text}>
                We're sorry for the inconvenience. Reach out anytime to reschedule or with questions.
              </Text>
            </>
          )}

          <Section style={infoBox}>
            <Text style={infoText}>📍 {ADDRESS}</Text>
            <Text style={{ ...infoText, marginTop: '4px' }}>
              📧 info@aquaticdreamsswim.com · 📞 (209) 577-3483
            </Text>
          </Section>

          <Hr style={hr} />

          <Text style={footer}>
            Best regards,<br />
            The {SITE_NAME} Team
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: LessonCancellationEmail,
  subject: (data: Record<string, any>) => {
    const isReassign = data.action === 'reassigned'
    const who = data.childName ? ` for ${data.childName}` : ''
    if (isReassign) return `Instructor change${who} — ${SITE_NAME}`
    const when = data.lessonDate ? ` — ${data.lessonDate}` : ''
    return `Lesson cancelled${who}${when} — ${SITE_NAME}`
  },
  displayName: 'Lesson cancellation / reassignment',
  previewData: {
    parentName: 'Jane',
    childName: 'Tommy',
    lessonDate: 'Monday, June 9',
    lessonTime: '3:00 PM',
    reason: 'Pool closure',
    action: 'cancelled',
    creditAmount: '$30.00',
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
const creditBox = { backgroundColor: '#FFF4EE', borderLeft: '4px solid #F58B76', padding: '14px 16px', borderRadius: '4px', margin: '0 0 16px' }
const creditAmountStyle = { fontSize: '18px', fontWeight: '700' as const, color: '#4B1528', margin: '0 0 4px' }
const creditNote = { fontSize: '13px', color: '#4B1528', margin: '0' }
const footer = { fontSize: '13px', color: '#888', margin: '30px 0 0', lineHeight: '1.5' }
