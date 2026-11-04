import { p256 } from '@noble/curves/nist.js'
import { describe, expect, it } from 'vitest'
import { sha256 } from '@noble/hashes/sha2.js'
import { assertionSignedBy, b64urlToBytes, bytesToB64url, derToRaw, spkiToCompressed } from './webauthn'

// DER prefix of a P-256 SubjectPublicKeyInfo, as browsers return from getPublicKey().
const SPKI_P256_PREFIX = Uint8Array.from(
  '3059301306072a8648ce3d020106082a8648ce3d030107034200'.match(/../g)!.map((h) => parseInt(h, 16)),
)

describe('webauthn conversions', () => {
  const secret = p256.utils.randomSecretKey()

  it('compresses an SPKI public key', () => {
    const spki = new Uint8Array([...SPKI_P256_PREFIX, ...p256.getPublicKey(secret, false)])
    expect(spkiToCompressed(spki)).toEqual(p256.getPublicKey(secret, true))
  })

  it('converts a DER signature to raw r||s that still verifies', () => {
    const hash = crypto.getRandomValues(new Uint8Array(32))
    const der = p256.sign(hash, secret, { prehash: false, format: 'der' })
    const raw = derToRaw(der)
    expect(raw.length).toBe(64)
    expect(p256.verify(raw, hash, p256.getPublicKey(secret, true), { prehash: false })).toBe(true)
  })

  it('round-trips base64url without padding', () => {
    const bytes = crypto.getRandomValues(new Uint8Array(32))
    const encoded = bytesToB64url(bytes)
    expect(encoded).not.toMatch(/[+/=]/)
    expect(b64urlToBytes(encoded)).toEqual(bytes)
  })
})

describe('assertionSignedBy', () => {
  const secret = p256.utils.randomSecretKey()
  const owner = btoa(String.fromCharCode(...p256.getPublicKey(secret, true)))
  const other = btoa(String.fromCharCode(...p256.getPublicKey(p256.utils.randomSecretKey(), true)))
  const authData = crypto.getRandomValues(new Uint8Array(37))
  const clientData = new TextEncoder().encode('{"type":"webauthn.get","challenge":"abc"}')
  const message = new Uint8Array([...authData, ...sha256(clientData)])
  const der = p256.sign(message, secret, { prehash: true, format: 'der' })

  it('accepts the owner key', () => {
    expect(assertionSignedBy(authData, clientData, der, owner)).toBe(true)
  })

  it('rejects a different key', () => {
    expect(assertionSignedBy(authData, clientData, der, other)).toBe(false)
  })

  it('rejects a tampered clientDataJSON', () => {
    const tampered = new TextEncoder().encode('{"type":"webauthn.get","challenge":"abd"}')
    expect(assertionSignedBy(authData, tampered, der, owner)).toBe(false)
  })
})
