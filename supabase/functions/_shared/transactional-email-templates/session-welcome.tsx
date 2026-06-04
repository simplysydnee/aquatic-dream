import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Button, Link, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Aquatic Dreams'

interface SwimmerEntry {
  swimmerName?: string
  className?: string
  classDays?: string
  classTime?: string
  alreadyPaid?: boolean
}

interface Props {
  familyName?: string
  // Single-swimmer fallback fields (used when swimmers[] is not provided)
  swimmerName?: string
  className?: string
  classDays?: string
  classTime?: string
  // Multi-swimmer mode
  swimmers?: SwimmerEntry[]
  sessionDates?: string
  sessionLabel?: string
  totalClasses?: string
  paymentLink?: string
  amountDue?: string
  alreadyPaid?: boolean
  // Calendar links
  icsLink?: string
  googleCalendarLink?: string
  facilityAddress?: string
}

const DEFAULT_ADDRESS = '1212 Kansas Ave, Modesto, CA 95351'

const SessionWelcomeEmail = ({
  familyName,
  swimmerName,
  className,
  classDays,
  classTime,
  swimmers,
  sessionDates,
  sessionLabel,
  totalClasses,
  paymentLink,
  amountDue,
  alreadyPaid,
  icsLink,
  googleCalendarLink,
  facilityAddress,
}: Props) => {
  const address = facilityAddress || DEFAULT_ADDRESS
  const mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
  const swimmerList: SwimmerEntry[] =
    swimmers && swimmers.length > 0
      ? swimmers
      : (swimmerName || className || classDays || classTime
          ? [{ swimmerName, className, classDays, classTime, alreadyPaid }]
          : [])
  const allPaid =
    swimmerList.length > 0
      ? swimmerList.every((s) => s.alreadyPaid)
      : !!alreadyPaid
  return (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Welcome to Summer Swim — {sessionLabel || 'Session 1'} starts soon</Preview>
    <Body style={main}>
      <Container style={container}>
        {/* Header */}
        <Section style={header}>
          <Text style={brand}>{SITE_NAME}</Text>
          <Text style={brandSub}>Swim School</Text>
          <Heading style={headerTitle}>Welcome to Summer Swim! 🌊</Heading>
          {sessionDates && <Text style={headerSubtitle}>{sessionLabel || 'Session 1'} · {sessionDates}</Text>}
        </Section>

        {/* Greeting */}
        <Section style={body}>
          <Text style={text}>
            Dear <strong>{familyName || 'Swim'} Family</strong>,
          </Text>
          <Text style={text}>
            We are thrilled to welcome you to our Summer Swim Program! Our team
            can't wait to help your {swimmerList.length > 1 ? 'swimmers' : 'swimmer'} build confidence, learn water safety,
            and have a blast this season.
          </Text>
          <Text style={text}>
            Please review the important details below to help ensure a smooth and
            successful first week.
          </Text>

          {/* Enrollment card — one block per swimmer */}
          {swimmerList.map((s, idx) => (
            <Section key={idx} style={card}>
              <Text style={cardTitle}>
                📋 {s.swimmerName ? `${s.swimmerName}'s Enrollment` : 'Your Enrollment'}
              </Text>
              {s.className && <Row label="Class" value={s.className} />}
              {s.classDays && <Row label="Day(s)" value={s.classDays} />}
              {s.classTime && <Row label="Time Slot" value={s.classTime} highlight />}
              {idx === 0 && sessionDates && <Row label="Session Dates" value={sessionDates} />}
              {idx === 0 && totalClasses && <Row label="Total Classes" value={totalClasses} />}
            </Section>
          ))}

          {/* Add to Calendar */}
          {(icsLink || googleCalendarLink) && (
            <>
              <Heading as="h2" style={sectionH}>📅 Add to Your Calendar</Heading>
              <Text style={text}>
                Save every lesson date{swimmerList.length > 1 ? ' for all your swimmers' : ''} to your calendar in one click.
              </Text>
              <Section style={{ textAlign: 'center' as const, margin: '16px 0 8px' }}>
                {icsLink && (
                  <Button style={calBtn} href={icsLink}>
                    Apple / Outlook (.ics)
                  </Button>
                )}
                {googleCalendarLink && (
                  <Button style={calBtnAlt} href={googleCalendarLink}>
                    Google Calendar
                  </Button>
                )}
              </Section>
              <Text style={addrText}>
                📍 <Link href={mapsLink} style={linkStyle}>{address}</Link>
              </Text>
            </>
          )}

          {/* Tuition CTA */}
          <Heading as="h2" style={sectionH}>💳 Tuition & Registration Bag</Heading>
          <Text style={text}>
            <strong>Payment Due:</strong> To minimize first-day lines, please
            complete your tuition payment{amountDue ? <> of <strong>{amountDue}</strong></> : null} prior to the first day of class.
          </Text>
          <Text style={text}>
            <strong>Gear Bags:</strong> All registered swimmers will receive their
            official registration bag on the very first day of class!
          </Text>

          {allPaid ? (
            <Section style={paidBox}>
              <Text style={paidText}>✓ Tuition is paid in full — thank you!</Text>
            </Section>
          ) : paymentLink ? (
            <Section style={{ textAlign: 'center' as const, margin: '24px 0 8px' }}>
              <Button style={cta} href={paymentLink}>
                Complete Tuition Payment{amountDue ? ` — ${amountDue}` : ''} →
              </Button>
              <Text style={smallMuted}>
                Or open this link:{' '}
                <Link href={paymentLink} style={linkStyle}>{paymentLink}</Link>
              </Text>
            </Section>
          ) : null}

          <Hr style={hr} />

          <Heading as="h2" style={sectionH}>🚪 Arrival & Facility Flow</Heading>
          <ul style={ul}>
            <li style={li}><strong>Arrival:</strong> Enter through the double doors at the front of the building.</li>
            <li style={li}><strong>Pre-Class Prep:</strong> Restrooms and changing rooms are in the main lobby. Please ensure your child uses the restroom before class.</li>
            <li style={li}><strong>Swim Diapers:</strong> Required for all swimmers who are not fully potty-trained — no exceptions.</li>
            <li style={li}><strong>Meeting Your Instructor:</strong> Families wait in the lobby; instructors will gather the swimmers and walk them to the pool together.</li>
          </ul>

          <Heading as="h2" style={sectionH}>🏊 Pool Deck & Viewing Rules</Heading>
          <ul style={ul}>
            <li style={li}><strong>Where to Watch:</strong> Hang out in the lobby or sit poolside on the deck.</li>
            <li style={li}><strong>Water Safety:</strong> No children may touch or enter the water unless actively participating in their scheduled class.</li>
            <li style={li}><strong>Departure:</strong> Pool-deck restrooms are available for changing. To keep our retail store dry, all families must exit through the back door from the pool area.</li>
          </ul>

          <Section style={alertBox}>
            <Text style={alertText}>
              <strong>⚠️ Reminder:</strong> Please do not feed your child within
              30 minutes prior to their swim lesson.
            </Text>
          </Section>

          <Hr style={hr} />

          <Text style={text}>
            Thank you so much for choosing {SITE_NAME}. We can't wait to see you{sessionDates ? ` for ${sessionLabel || 'Session 1'}` : ''}!
          </Text>
          <Text style={text}>
            With excitement,<br />
            The {SITE_NAME} Swim School Team
          </Text>
        </Section>

        <Section style={footer}>
          <Text style={footerName}>{SITE_NAME} Swim School</Text>
          <Text style={footerAddr}>1212 Kansas Ave, Modesto, CA</Text>
          <Text style={footerAddr}>Questions? Reply to this email or call (209) 577-3483.</Text>
        </Section>
      </Container>
    </Body>
  </Html>
  )
}

const Row = ({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) => (
  <Section style={row}>
    <Text style={rowLabel}>{label}</Text>
    <Text style={highlight ? rowValueHighlight : rowValue}>{value}</Text>
  </Section>
)

export const template = {
  component: SessionWelcomeEmail,
  subject: (data: Record<string, any>) =>
    `Welcome to ${data.sessionLabel || 'Session 1'} — ${SITE_NAME} Swim School`,
  displayName: 'Session welcome (with payment link)',
  previewData: {
    familyName: 'Smith',
    swimmers: [
      { swimmerName: 'Tommy Smith', className: 'Little Fins (White)', classDays: 'Mondays', classTime: '3:15 PM', alreadyPaid: false },
      { swimmerName: 'Ava Smith', className: 'Reef Explorers (Red)', classDays: 'Mondays', classTime: '4:00 PM', alreadyPaid: true },
    ],
    sessionDates: 'June 8 – July 2, 2026',
    sessionLabel: 'Session 1',
    totalClasses: '8 classes',
    paymentLink: 'https://buy.stripe.com/example',
    amountDue: '$240',
    icsLink: 'https://example.supabase.co/functions/v1/lesson-calendar-ics?events=abc',
    googleCalendarLink: 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=Swim',
    facilityAddress: '1212 Kansas Ave, Modesto, CA 95351',
  },
} satisfies TemplateEntry

// ── styles ──
const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif', color: '#1a2e3b' }
const container = { maxWidth: '620px', margin: '0 auto', backgroundColor: '#ffffff' }
const header = { background: 'linear-gradient(145deg, #0d4f7c 0%, #1a7fad 60%, #29b5c6 100%)', padding: '40px 36px 32px', textAlign: 'center' as const }
const brand = { fontFamily: 'Georgia, serif', fontSize: '24px', fontWeight: '700' as const, color: '#ffffff', margin: '0' }
const brandSub = { fontSize: '12px', color: 'rgba(255,255,255,0.75)', letterSpacing: '2px', textTransform: 'uppercase' as const, margin: '4px 0 20px' }
const headerTitle = { fontFamily: 'Georgia, serif', fontSize: '28px', color: '#ffffff', lineHeight: '1.25', margin: '0 0 6px' }
const headerSubtitle = { fontSize: '14px', color: 'rgba(255,255,255,0.9)', margin: '0' }

const body = { padding: '24px 36px 32px' }
const text = { fontSize: '15px', lineHeight: '1.65', color: '#2c4a5a', margin: '0 0 14px' }
const sectionH = { fontFamily: 'Georgia, serif', fontSize: '18px', color: '#0d4f7c', margin: '28px 0 12px' }

const card = { background: '#e8f4fb', borderLeft: '4px solid #1a7fad', borderRadius: '0 8px 8px 0', padding: '18px 22px', margin: '20px 0 8px' }
const cardTitle = { fontFamily: 'Georgia, serif', fontSize: '16px', color: '#0d4f7c', margin: '0 0 10px' }
const row = { borderBottom: '1px solid rgba(26,127,173,0.15)', padding: '6px 0', margin: '0' }
const rowLabel = { fontSize: '11px', color: '#5a7f94', fontWeight: '600' as const, textTransform: 'uppercase' as const, letterSpacing: '0.6px', margin: '0' }
const rowValue = { fontSize: '14px', color: '#1a2e3b', fontWeight: '500' as const, margin: '2px 0 0' }
const rowValueHighlight = { fontSize: '15px', color: '#0d4f7c', fontWeight: '700' as const, margin: '2px 0 0' }

const cta = { background: '#0d4f7c', color: '#ffffff', textDecoration: 'none', fontSize: '15px', fontWeight: '600' as const, padding: '14px 32px', borderRadius: '50px', display: 'inline-block' as const }
const calBtn = { background: '#0d4f7c', color: '#ffffff', textDecoration: 'none', fontSize: '14px', fontWeight: '600' as const, padding: '12px 22px', borderRadius: '50px', display: 'inline-block' as const, margin: '0 6px 8px 0' }
const calBtnAlt = { background: '#1a7fad', color: '#ffffff', textDecoration: 'none', fontSize: '14px', fontWeight: '600' as const, padding: '12px 22px', borderRadius: '50px', display: 'inline-block' as const, margin: '0 0 8px 6px' }
const addrText = { fontSize: '13px', color: '#5a7f94', textAlign: 'center' as const, margin: '4px 0 0' }
const smallMuted = { fontSize: '11px', color: '#88a0b0', margin: '14px 0 0', wordBreak: 'break-all' as const }
const linkStyle = { color: '#1a7fad', textDecoration: 'underline' }

const paidBox = { background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: '8px', padding: '14px', margin: '20px 0', textAlign: 'center' as const }
const paidText = { color: '#065f46', fontWeight: '600' as const, margin: '0' }

const alertBox = { background: '#fff8e6', border: '1px solid #f5c842', borderRadius: '8px', padding: '12px 16px', margin: '16px 0 0' }
const alertText = { fontSize: '13px', color: '#6b4f00', margin: '0', lineHeight: '1.5' }

const ul = { paddingLeft: '18px', margin: '0 0 14px' }
const li = { fontSize: '14px', lineHeight: '1.65', color: '#2c4a5a', margin: '0 0 6px' }

const hr = { borderColor: '#c8e4f0', margin: '24px 0' }

const footer = { background: '#0d4f7c', padding: '24px 36px', textAlign: 'center' as const }
const footerName = { fontFamily: 'Georgia, serif', fontSize: '16px', color: '#ffffff', margin: '0 0 4px' }
const footerAddr = { fontSize: '12px', color: 'rgba(255,255,255,0.7)', margin: '4px 0' }
