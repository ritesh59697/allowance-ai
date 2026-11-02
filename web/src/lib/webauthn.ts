// Passkey ceremonies and the byte conversions the leash contract expects:
// a 33-byte compressed P-256 key at registration, and raw r||s signatures
// (not DER) at assertion time.
import { p256 } from '@noble/curves/nist.js'

export type WebAuthnAssertion = {
  authenticator_data: string // base64
  client_data_json: string
  signature: string // base64, raw r||s
}

export type RegisteredPasskey = {
  credentialId: string // base64url
  publicKey: string // base64, compressed SEC1
  rpId: string
}

export const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))

export const b64urlToBytes = (s: string) => {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')
  return Uint8Array.from(atob(pad), (c) => c.charCodeAt(0))
}

export const bytesToB64url = (bytes: Uint8Array) =>
  b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const toBytes = (buf: ArrayBuffer | ArrayBufferView) =>
  buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)

/** SPKI DER from `getPublicKey()` -> compressed SEC1 point. */
export function spkiToCompressed(spki: Uint8Array): Uint8Array {
  // An uncompressed P-256 point is the last 65 bytes: 0x04 || x || y.
  const point = spki.slice(-65)
  if (point[0] !== 0x04) throw new Error('Passkey is not an uncompressed P-256 key')
  return p256.Point.fromBytes(point).toBytes(true)
}

/** ASN.1 DER ECDSA signature -> 64-byte r||s. */
export function derToRaw(der: Uint8Array): Uint8Array {
  return p256.Signature.fromBytes(der, 'der').toBytes('compact')
}

export async function registerPasskey(rpId: string, label: string): Promise<RegisteredPasskey> {
  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { id: rpId, name: 'Haptix Leash' },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: label, displayName: label },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }], // ES256 = P-256
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
      attestation: 'none',
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null
  if (!credential) throw new Error('Passkey registration was cancelled')

  const response = credential.response as AuthenticatorAttestationResponse
  const spki = response.getPublicKey()
  if (!spki || response.getPublicKeyAlgorithm() !== -7) {
    throw new Error('This authenticator did not create a P-256 passkey')
  }
  return {
    credentialId: bytesToB64url(toBytes(credential.rawId)),
    publicKey: b64(spkiToCompressed(toBytes(spki))),
    rpId,
  }
}

/** Ask the device to sign a contract challenge. Requires biometric/PIN. */
export async function signChallenge(passkey: RegisteredPasskey, challenge: string): Promise<WebAuthnAssertion> {
  const credential = (await navigator.credentials.get({
    publicKey: {
      challenge: b64urlToBytes(challenge),
      rpId: passkey.rpId,
      allowCredentials: [{ type: 'public-key', id: b64urlToBytes(passkey.credentialId) }],
      userVerification: 'required',
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null
  if (!credential) throw new Error('Approval was cancelled')

  const response = credential.response as AuthenticatorAssertionResponse
  return {
    authenticator_data: b64(toBytes(response.authenticatorData)),
    client_data_json: new TextDecoder().decode(toBytes(response.clientDataJSON)),
    signature: b64(derToRaw(toBytes(response.signature))),
  }
}
