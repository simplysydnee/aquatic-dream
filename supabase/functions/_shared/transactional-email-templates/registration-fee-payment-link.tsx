import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Img, Preview, Text, Button, Link, Hr, Section,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = "Aquatic Dreams"
const LOGO_URL = 'https://jilrijklnehbfuulykty.supabase.co/storage/v1/object/public/email-assets/aqd-email-logo.jpg'

interface RegistrationFeePaymentLinkProps {
  parentName?: string
  childName?: string
  sessionInfo?: string
  amountDue?: string
  paymentLink?: string
  waiverLink?: string
  waiverSigned?: boolean
}

const RegistrationFeePaymentLinkEmail = ({
  parentName,
  childName,
  sessionInfo,
  amountDue,
  paymentLink,
  waiverLink,
  waiverSigned,
}: RegistrationFeePaymentLinkProps) => {
  const showWaiverStep = !!waiverLink && !waiverSigned
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Complete enrollment for {childName || 'your swimmer'}: {showWaiverStep ? 'sign waiver + ' : ''}pay {amountDue || 'registration fee'} — {SITE_NAME}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Img src={LOGO_URL} width="80" height="80" alt="Aquatic Dreams" style={logo} />
          <Heading style={h1}>{SITE_NAME}</Heading>
          <Hr style={hr} />
          <Text style={text}>{parentName ? `Hi ${parentName},` : 'Hello,'}</Text>
          <Text style={text}>
            Thanks for enrolling {childName ? <strong>{childName}</strong> : 'your swimmer'} with us!
            {showWaiverStep
              ? ' To finalize the spot, please complete the two quick steps below.'
              : ' To complete enrollment, please pay the one-time registration fee below.'}
          </Text>
          {sessionInfo && (
            <Section style={infoBox}>
              <Text style={infoText}>📋 {sessionInfo}</Text>
            </Section>
          )}

          {showWaiverStep && (
            <>
              <Section style={stepBox}>
                <Text style={stepLabel}>STEP 1 of 2</Text>
                <Text style={stepHeading}>Sign the liability waiver</Text>
                <Text style={stepBody}>
                  Required for every swimmer before their first class. Takes about 2 minutes.
                </Text>
                <Section style={{ textAlign: 'center' as const, margin: '12px 0 4px' }}>
                  <Button style={waiverButton} href={waiverLink}>
                    Sign Waiver
                  </Button>
                </Section>
              </Section>

              <Section style={stepBox}>
                <Text style={stepLabel}>STEP 2 of 2</Text>
                <Text style={stepHeading}>
                  Pay {amountDue || 'the'} registration fee
                </Text>
                <Text style={stepBody}>
                  One-time charge per family — you won't be charged it again for future sessions.
                </Text>
                {paymentLink && (
                  <Section style={{ textAlign: 'center' as const, margin: '12px 0 4px' }}>
                    <Button style={button} href={paymentLink}>
                      Pay Registration Fee{amountDue ? ` — ${amountDue}` : ''}
                    </Button>
                  </Section>
                )}
              </Section>

              <Text style={{ ...mutedText, textAlign: 'center' as const }}>
                Waiver link:{' '}
                <Link href={waiverLink} style={linkStyle}>{waiverLink}</Link>
                {paymentLink && (
                  <>
                    <br />
                    Payment link:{' '}
                    <Link href={paymentLink} style={linkStyle}>{paymentLink}</Link>
                  </>
                )}
              </Text>
            </>
          )}

          {!showWaiverStep && paymentLink && (
            <>
              {waiverSigned && (
                <Section style={signedBox}>
                  <Text style={signedText}>✅ Waiver signed — thank you!</Text>
                </Section>
              )}
              <Section style={{ textAlign: 'center' as const, margin: '24px 0 12px' }}>
                <Button style={button} href={paymentLink}>
                  Pay Registration Fee{amountDue ? ` — ${amountDue}` : ''}
                </Button>
              </Section>
              <Text style={{ ...mutedText, textAlign: 'center' as const }}>
                Or copy this link into your browser:<br />
                <Link href={paymentLink} style={linkStyle}>{paymentLink}</Link>
              </Text>
              <Text style={text}>
                The registration fee is a one-time charge per family — you won't be charged it again
                for future sessions.
              </Text>
            </>
          )}

          {!paymentLink && (
            <Section style={infoBox}>
              <Text style={infoText}>
                💳 Your secure payment link will arrive in a follow-up email shortly. Your seat is reserved.
              </Text>
            </Section>
          )}

          <Hr style={hr} />
          <Text style={text}>
            Questions? Email info@aquaticdreamsswim.com or call (209) 577-3483.
          </Text>
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
  component: RegistrationFeePaymentLinkEmail,
  subject: (data: Record<string, any>) => {
    const who = data.childName ? ` for ${data.childName}` : ''
    const needsWaiver = data.waiverLink && !data.waiverSigned
    return needsWaiver
      ? `Complete enrollment${who}: sign waiver + pay registration fee — ${SITE_NAME}`
      : `Registration Fee Due${who} — ${SITE_NAME}`
  },
  displayName: 'Registration fee payment link',
  previewData: {
    parentName: 'Jane',
    childName: 'Tommy',
    sessionInfo: 'Session 1 — Mon 3:00 PM — Little Fins (White)',
    amountDue: '$45',
    paymentLink: 'https://example.com/pay',
    waiverLink: 'https://example.com/enrollment-waiver/abc123',
    waiverSigned: false,
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Plus Jakarta Sans', Arial, sans-serif" }
const container = { padding: '30px 25px', maxWidth: '560px', margin: '0 auto' }
const logo = { display: 'block', margin: '0 0 10px' }
const h1 = { fontSize: '24px', fontWeight: '700' as const, color: '#0f2343', margin: '0 0 10px', fontFamily: "'Playfair Display', Georgia, serif" }
const hr = { borderColor: '#5badcb', borderWidth: '2px', margin: '15px 0 25px' }
const text = { fontSize: '15px', color: '#333', lineHeight: '1.6', margin: '0 0 16px' }
const mutedText = { fontSize: '12px', color: '#666', lineHeight: '1.5', margin: '0 0 16px', wordBreak: 'break-all' as const }
const infoBox = { backgroundColor: '#f0f7fa', borderLeft: '4px solid #5badcb', padding: '12px 16px', borderRadius: '4px', margin: '0 0 16px' }
const infoText = { fontSize: '14px', color: '#0f2343', margin: '0' }
const stepBox = { backgroundColor: '#fafbfc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px 20px', margin: '0 0 14px' }
const stepLabel = { fontSize: '11px', fontWeight: '700' as const, color: '#5badcb', letterSpacing: '0.08em', margin: '0 0 4px' }
const stepHeading = { fontSize: '17px', fontWeight: '700' as const, color: '#0f2343', margin: '0 0 6px' }
const stepBody = { fontSize: '13px', color: '#555', lineHeight: '1.5', margin: '0 0 8px' }
const signedBox = { backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '6px', padding: '10px 14px', margin: '0 0 16px' }
const signedText = { fontSize: '14px', color: '#065f46', margin: '0', fontWeight: '600' as const }
const linkStyle = { color: '#5badcb', textDecoration: 'underline' }
const button = {
  backgroundColor: '#5badcb',
  color: '#ffffff',
  padding: '14px 28px',
  borderRadius: '8px',
  fontSize: '16px',
  fontWeight: '600' as const,
  textDecoration: 'none',
  display: 'inline-block' as const,
}
const waiverButton = {
  ...button,
  backgroundColor: '#0f2343',
}
const footer = { fontSize: '13px', color: '#888', margin: '30px 0 0', lineHeight: '1.5' }
