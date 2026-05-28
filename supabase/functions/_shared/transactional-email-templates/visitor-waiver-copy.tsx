import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Preview, Text, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "Aquatic Dreams"
const LOGO_URL = 'https://jilrijklnehbfuulykty.supabase.co/storage/v1/object/public/email-assets/aqd-email-logo.jpg'

interface Swimmer {
  first_name?: string
  last_name?: string
  dob?: string | null
  relationship?: string | null
}

interface Props {
  signerName?: string
  signedAt?: string
  swimmers?: Swimmer[]
  photoRelease?: boolean
  emergencyContactName?: string
  emergencyContactPhone?: string
  emergencyContactRelationship?: string
  waiverVersion?: string
  tosVersion?: string
  privacyPolicyVersion?: string
}

const formatDate = (iso?: string) => {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('en-US', {
      dateStyle: 'long',
      timeStyle: 'short',
    })
  } catch {
    return iso
  }
}

const Email = ({
  signerName,
  signedAt,
  swimmers = [],
  photoRelease,
  emergencyContactName,
  emergencyContactPhone,
  emergencyContactRelationship,
  waiverVersion,
  tosVersion,
  privacyPolicyVersion,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your signed pool waiver — {SITE_NAME}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={LOGO_URL} width="80" height="80" alt="Aquatic Dreams" style={logo} />
        <Heading style={h1}>{SITE_NAME}</Heading>
        <Hr style={hr} />
        <Text style={text}>{signerName ? `Hi ${signerName},` : 'Hello,'}</Text>
        <Text style={text}>
          Thanks for signing the Aquatic Dreams pool liability waiver. This email is
          your copy — please keep it for your records.
        </Text>

        <Section style={infoBox}>
          <Text style={infoLabel}>Signed</Text>
          <Text style={infoValue}>{formatDate(signedAt)}</Text>
        </Section>

        {swimmers.length > 0 && (
          <Section style={infoBox}>
            <Text style={infoLabel}>Swimmers covered</Text>
            {swimmers.map((s, i) => (
              <Text key={i} style={infoValue}>
                • {[s.first_name, s.last_name].filter(Boolean).join(' ')}
                {s.relationship ? ` (${s.relationship})` : ''}
                {s.dob ? ` — DOB ${s.dob}` : ''}
              </Text>
            ))}
          </Section>
        )}

        <Section style={infoBox}>
          <Text style={infoLabel}>Photo &amp; video release</Text>
          <Text style={infoValue}>{photoRelease ? 'Consented' : 'Declined'}</Text>
        </Section>

        {(emergencyContactName || emergencyContactPhone) && (
          <Section style={infoBox}>
            <Text style={infoLabel}>Emergency contact</Text>
            <Text style={infoValue}>
              {emergencyContactName}
              {emergencyContactRelationship ? ` (${emergencyContactRelationship})` : ''}
              {emergencyContactPhone ? ` — ${emergencyContactPhone}` : ''}
            </Text>
          </Section>
        )}

        <Hr style={hr} />
        <Text style={mutedText}>
          Document versions on file: Waiver {waiverVersion} • Terms {tosVersion} •
          Privacy {privacyPolicyVersion}.
        </Text>
        <Text style={mutedText}>
          The full text of the waiver, terms, and privacy policy is available any time
          at aquaticdreamsswim.com. Need a re-signed copy or have a question? Reply to
          this email or call (209) 577-3483.
        </Text>
        <Text style={footer}>See you at the pool,<br />The {SITE_NAME} Team</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: `Your signed pool waiver — ${SITE_NAME}`,
  displayName: 'Visitor waiver copy',
  previewData: {
    signerName: 'Jane Smith',
    signedAt: new Date().toISOString(),
    swimmers: [
      { first_name: 'Tommy', last_name: 'Smith', dob: '2017-04-12', relationship: 'Child' },
    ],
    photoRelease: true,
    emergencyContactName: 'John Smith',
    emergencyContactPhone: '(209) 555-0000',
    emergencyContactRelationship: 'Spouse',
    waiverVersion: '2025-05-01',
    tosVersion: '2026-04-24',
    privacyPolicyVersion: '2025-05-01',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Plus Jakarta Sans', Arial, sans-serif" }
const container = { padding: '30px 25px', maxWidth: '560px', margin: '0 auto' }
const logo = { display: 'block', margin: '0 0 10px' }
const h1 = { fontSize: '24px', fontWeight: '700' as const, color: '#0f2343', margin: '0 0 10px', fontFamily: "'Playfair Display', Georgia, serif" }
const hr = { borderColor: '#5badcb', borderWidth: '2px', margin: '15px 0 25px' }
const text = { fontSize: '15px', color: '#333', lineHeight: '1.6', margin: '0 0 16px' }
const mutedText = { fontSize: '12px', color: '#666', lineHeight: '1.5', margin: '0 0 12px' }
const infoBox = { backgroundColor: '#f0f7fa', borderLeft: '4px solid #5badcb', padding: '12px 16px', borderRadius: '4px', margin: '0 0 12px' }
const infoLabel = { fontSize: '11px', color: '#0f2343', textTransform: 'uppercase' as const, letterSpacing: '0.5px', fontWeight: '700' as const, margin: '0 0 4px' }
const infoValue = { fontSize: '14px', color: '#0f2343', margin: '0 0 2px' }
const footer = { fontSize: '13px', color: '#888', margin: '30px 0 0', lineHeight: '1.5' }
