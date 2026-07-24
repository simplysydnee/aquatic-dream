import * as React from 'npm:react@18.3.1'
import { Body, Button, Container, Head, Heading, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  familyName?: string
  manageUrl?: string
}

const SITE_NAME = 'Aquatic Dreams'

const Email = ({ familyName, manageUrl }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Manage your {SITE_NAME} membership</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Manage your membership</Heading>
        <Text style={p}>
          {familyName ? `Hi ${familyName},` : 'Hi there,'} use the button below to view your
          membership details or cancel your subscription. No login required.
        </Text>
        {manageUrl && (
          <Section style={{ margin: '20px 0' }}>
            <Button href={manageUrl} style={btn}>Manage my membership</Button>
          </Section>
        )}
        <Text style={small}>
          If you did not request this email, you can safely ignore it. This link is private —
          only share it with your household.
        </Text>
        <Text style={footer}>{SITE_NAME} · 1212 Kansas Ave, Modesto, CA 95351</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: 'Manage your Aquatic Dreams membership',
  displayName: 'Membership manage link',
  previewData: { familyName: 'Sydnee', manageUrl: 'https://aquaticdreamsswim.com/manage/example-token' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px', maxWidth: '500px', margin: '0 auto' }
const h1 = { color: '#1a3a8a', fontSize: '22px', margin: '0 0 12px' }
const p = { color: '#222', fontSize: '15px', lineHeight: '22px' }
const small = { color: '#666', fontSize: '13px', lineHeight: '20px', marginTop: '16px' }
const btn = {
  backgroundColor: '#2a5e84',
  color: '#ffffff',
  padding: '12px 20px',
  borderRadius: '6px',
  textDecoration: 'none',
  fontWeight: 600,
  fontSize: '15px',
}
const footer = { color: '#888', fontSize: '12px', marginTop: '24px', textAlign: 'center' as const }
