import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

export interface AuditLine {
  swimmer: string
  parentName: string
  parentPhone: string
  lessonType: string
  time: string
  instructor: string
  amount: number
  detail: string
  stripeLabel?: string
  stripeRef?: string
  stripeUrl?: string
}

interface Props {
  dateLabel?: string
  unbilled?: AuditLine[]
  paid?: AuditLine[]
  noCharge?: AuditLine[]
  totalLessons?: number
  collected?: number
  outstanding?: number
}

const money = (n?: number) => `$${(n ?? 0).toFixed(2)}`

const Row = ({ l, tone }: { l: AuditLine; tone: 'bad' | 'good' | 'muted' }) => (
  <Section style={tone === 'bad' ? boxBad : tone === 'good' ? boxGood : boxMuted}>
    <Text style={rowTitle}>
      {l.swimmer} · {money(l.amount)}
    </Text>
    <Text style={rowLine}>
      {l.lessonType}{l.time ? ` · ${l.time}` : ''}{l.instructor ? ` · ${l.instructor}` : ''}
    </Text>
    <Text style={rowLine}>
      {l.parentName}{l.parentPhone ? ` · ${l.parentPhone}` : ''}
    </Text>
    <Text style={tone === 'bad' ? rowBad : rowLine}>{l.detail}</Text>
    {l.stripeRef && (
      <Text style={rowRef}>
        {l.stripeLabel ? `via ${l.stripeLabel} · ` : ''}{l.stripeRef}
        {l.stripeUrl && (
          <>
            {' '}
            <Link href={l.stripeUrl} style={link}>Stripe ↗</Link>
          </>
        )}
      </Text>
    )}
  </Section>
)

const LessonBillingAudit = (p: Props) => {
  const unbilled = p.unbilled ?? []
  const paid = p.paid ?? []
  const noCharge = p.noCharge ?? []
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>
        {`Lesson billing audit ${p.dateLabel || ''} — ${unbilled.length} unbilled (${money(p.outstanding)})`}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Lesson billing audit</Heading>
          <Text style={subtle}>
            Private and semi-private lessons on {p.dateLabel || '—'}. Payment status verified
            against Stripe.
          </Text>

          <Section style={summary}>
            <Text style={row}><strong>Lessons:</strong> {p.totalLessons ?? 0}</Text>
            <Text style={row}><strong>Collected:</strong> {money(p.collected)}</Text>
            <Text style={row}><strong>Outstanding:</strong> {money(p.outstanding)}</Text>
          </Section>

          {unbilled.length > 0 && (
            <>
              <Heading as="h2" style={h2}>Needs attention ({unbilled.length})</Heading>
              {unbilled.map((l, i) => <Row key={`u${i}`} l={l} tone="bad" />)}
            </>
          )}

          {paid.length > 0 && (
            <>
              <Heading as="h2" style={h2}>Paid ({paid.length})</Heading>
              {paid.map((l, i) => <Row key={`p${i}`} l={l} tone="good" />)}
            </>
          )}

          {noCharge.length > 0 && (
            <>
              <Heading as="h2" style={h2}>Cancelled / no charge ({noCharge.length})</Heading>
              {noCharge.map((l, i) => <Row key={`n${i}`} l={l} tone="muted" />)}
            </>
          )}

          <Hr style={hr} />
          <Text style={footer}>Aquatic Dreams · internal staff report</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: LessonBillingAudit,
  subject: (d: Record<string, any>) => {
    const unbilled = Array.isArray(d?.unbilled) ? d.unbilled.length : 0
    const out = typeof d?.outstanding === 'number' ? d.outstanding : 0
    return unbilled > 0
      ? `Lesson billing audit — ${d?.dateLabel || ''} — ${unbilled} unbilled ($${out.toFixed(0)})`
      : `Lesson billing audit — ${d?.dateLabel || ''} — all billed`
  },
  displayName: 'Internal: lesson billing audit',
  previewData: {
    dateLabel: 'Sat, Jul 25, 2026',
    totalLessons: 3,
    collected: 100,
    outstanding: 50,
    unbilled: [
      {
        swimmer: 'Zayne Sanchez',
        parentName: 'Katelyn Bettencourt',
        parentPhone: '(209) 815-5050',
        lessonType: 'Private',
        time: '4:00 PM',
        instructor: 'Sutton Lucas',
        amount: 50,
        detail: 'Never charged · no card on file',
      },
    ],
    paid: [
      {
        swimmer: 'Adrian Chacon',
        parentName: 'Maria Chacon',
        parentPhone: '(209) 555-0148',
        lessonType: 'Private',
        time: '5:00 PM',
        instructor: 'Sydnee',
        amount: 50,
        detail: 'Paid · Stripe confirms succeeded',
        stripeLabel: 'card on file',
        stripeRef: 'pi_3RxExampleExample',
        stripeUrl: 'https://dashboard.stripe.com/payments/pi_3RxExampleExample',
      },
    ],
    noCharge: [],
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif' }
const container = { padding: '24px', maxWidth: '560px', margin: '0 auto' }
const h1 = { fontSize: '22px', fontWeight: 'bold', color: '#2a5e84', margin: '0 0 8px' }
const h2 = { fontSize: '16px', fontWeight: 'bold', color: '#1a3a8a', margin: '22px 0 8px' }
const subtle = { fontSize: '14px', color: '#666', margin: '0 0 18px' }
const summary = {
  backgroundColor: '#f4f8fb',
  borderLeft: '4px solid #2a5e84',
  padding: '12px 16px',
  borderRadius: '4px',
  margin: '0 0 8px',
}
const boxBase = { padding: '12px 16px', borderRadius: '4px', margin: '0 0 8px' }
const boxBad = { ...boxBase, backgroundColor: '#fdf1ee', borderLeft: '4px solid #F58B76' }
const boxGood = { ...boxBase, backgroundColor: '#f2f9f4', borderLeft: '4px solid #3f9c62' }
const boxMuted = { ...boxBase, backgroundColor: '#f6f6f6', borderLeft: '4px solid #bbbbbb' }
const row = { fontSize: '14px', color: '#222', lineHeight: '1.6', margin: '0 0 4px' }
const rowTitle = { fontSize: '15px', fontWeight: 'bold', color: '#1a3a8a', margin: '0 0 2px' }
const rowLine = { fontSize: '13px', color: '#444', lineHeight: '1.5', margin: '0 0 2px' }
const rowBad = { fontSize: '13px', color: '#b1442a', lineHeight: '1.5', margin: '0 0 2px', fontWeight: 'bold' }
const rowRef = { fontSize: '12px', color: '#777', lineHeight: '1.5', margin: '4px 0 0', wordBreak: 'break-all' as const }
const link = { color: '#2a5e84', textDecoration: 'underline' }
const hr = { borderColor: '#e6e6e6', margin: '24px 0 12px' }
const footer = { fontSize: '12px', color: '#888', textAlign: 'center' as const, margin: 0 }
