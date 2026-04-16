/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

const LOGO_URL = 'https://jilrijklnehbfuulykty.supabase.co/storage/v1/object/public/email-assets/AQD_Favicon.png'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your verification code</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src={LOGO_URL} width="80" height="80" alt="Aquatic Dreams" style={logo} />
        <Heading style={h1}>Aquatic Dreams</Heading>
        <Hr style={hr} />
        <Heading style={h2}>Confirm reauthentication</Heading>
        <Text style={text}>Use the code below to confirm your identity:</Text>
        <Text style={codeStyle}>{token}</Text>
        <Text style={footer}>
          This code will expire shortly. If you didn't request this, you can
          safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

const main = { backgroundColor: '#ffffff', fontFamily: "'Plus Jakarta Sans', Arial, sans-serif" }
const container = { padding: '30px 25px', maxWidth: '560px', margin: '0 auto' }
const logo = { margin: '0 0 10px' }
const h1 = { fontSize: '24px', fontWeight: '700' as const, color: '#0f2343', margin: '0 0 10px', fontFamily: "'Playfair Display', Georgia, serif" }
const h2 = { fontSize: '20px', fontWeight: '600' as const, color: '#0f2343', margin: '0 0 16px', fontFamily: "'Playfair Display', Georgia, serif" }
const hr = { borderColor: '#5badcb', borderWidth: '2px', margin: '15px 0 25px' }
const text = { fontSize: '15px', color: '#333333', lineHeight: '1.6', margin: '0 0 16px' }
const codeStyle = {
  fontFamily: 'Courier, monospace',
  fontSize: '28px',
  fontWeight: 'bold' as const,
  color: '#0f2343',
  margin: '0 0 30px',
  letterSpacing: '4px',
}
const footer = { fontSize: '13px', color: '#888888', margin: '30px 0 0', lineHeight: '1.5' }
