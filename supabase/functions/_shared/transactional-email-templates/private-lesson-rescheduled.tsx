import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Preview, Text, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Aquatic Dreams'
const LOGO_URL = 'https://jilrijklnehbfuulykty.supabase.co/storage/v1/object/public/email-assets/aqd-email-logo.jpg'
const ADDRESS = '1212 Kansas Ave, Modesto, CA 95351'

interface MovedItem {
  oldDate?: string
  oldTime?: string
  oldInstructor?: string
  newDate?: string
  newTime?: string
  newInstructor?: string
}

interface Props {
  parentName?: string
  childName?: string
  items?: MovedItem[]
  cancellationPolicyHours?: number
  reason?: string
}

const RescheduleEmail = ({
  parentName,
  childName,
  items = [],
  cancellationPolicyHours,
  reason,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>
      {`${childName || 'Your swimmer'}'s lesson schedule has been updated`}
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={LOGO_URL} width="80" height="80" alt="Aquatic Dreams" style={logo} />
        <Heading style={h1}>{SITE_NAME}</Heading>
        <Hr style={hr} />

        <Text style={text}>{parentName ? `Hi ${parentName},` : 'Hello,'}</Text>
        <Text style={text}>
          We've updated <strong>{childName || 'your swimmer'}'s</strong> private lesson schedule
          {items.length > 1 ? ` for ${items.length} dates` : ''}. The new details are below.
          {reason ? ` (${reason})` : ''}
        </Text>

        {items.map((it, i) => (
          <Section key={i} style={card}>
            <Text style={cardLabel}>Previously</Text>
            <Text style={cardLine}>
              {it.oldDate || '—'}{it.oldTime ? ` · ${it.oldTime}` : ''}
              {it.oldInstructor ? ` · with ${it.oldInstructor}` : ''}
            </Text>
            <Text style={{ ...cardLabel, marginTop: '10px' }}>Now</Text>
            <Text style={{ ...cardLine, color: '#0f2343', fontWeight: 600 }}>
              {it.newDate || '—'}{it.newTime ? ` · ${it.newTime}` : ''}
              {it.newInstructor ? ` · with ${it.newInstructor}` : ''}
            </Text>
          </Section>
        ))}

        <Text style={text}>
          Same pool, same great instruction — just a new time slot. If this change doesn't work for you,
          please reach out as soon as possible
          {cancellationPolicyHours ? ` (our cancellation window is ${cancellationPolicyHours} hours)` : ''}.
        </Text>

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

export const template = {
  component: RescheduleEmail,
  subject: (data: Record<string, any>) => {
    const who = data.childName ? ` for ${data.childName}` : ''
    return `Lesson rescheduled${who} — ${SITE_NAME}`
  },
  displayName: 'Private lesson rescheduled',
  previewData: {
    parentName: 'Jane',
    childName: 'Tommy',
    cancellationPolicyHours: 24,
    items: [{
      oldDate: 'Mon, Jun 9', oldTime: '3:00 PM', oldInstructor: 'Jaclyn',
      newDate: 'Tue, Jun 10', newTime: '4:00 PM', newInstructor: 'Sutton',
    }],
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Plus Jakarta Sans', Arial, sans-serif" }
const container = { padding: '30px 25px', maxWidth: '560px', margin: '0 auto' }
const logo = { display: 'block', margin: '0 0 10px' }
const h1 = { fontSize: '24px', fontWeight: '700' as const, color: '#0f2343', margin: '0 0 10px', fontFamily: "'Playfair Display', Georgia, serif" }
const hr = { borderColor: '#5badcb', borderWidth: '2px', margin: '15px 0 25px' }
const text = { fontSize: '15px', color: '#333', lineHeight: '1.6', margin: '0 0 16px' }
const card = { backgroundColor: '#f0f7fa', borderLeft: '4px solid #5badcb', padding: '12px 16px', borderRadius: '4px', margin: '0 0 12px' }
const cardLabel = { fontSize: '11px', textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: '#557', margin: '0' }
const cardLine = { fontSize: '15px', color: '#333', margin: '2px 0 0' }
const infoBox = { backgroundColor: '#fafafa', borderLeft: '4px solid #ccc', padding: '12px 16px', borderRadius: '4px', margin: '0 0 16px' }
const infoText = { fontSize: '14px', color: '#0f2343', margin: '0' }
const footer = { fontSize: '13px', color: '#888', margin: '30px 0 0', lineHeight: '1.5' }
