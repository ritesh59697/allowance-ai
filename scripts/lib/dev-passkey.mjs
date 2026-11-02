// A software stand-in for a phone passkey, for scripts and tests only.
// It produces byte-for-byte what navigator.credentials.get returns
// (authenticatorData, clientDataJSON, P-256 signature), so the contract
// cannot tell it apart. The real approval page uses the device's passkey.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { p256 } from "@noble/curves/nist.js";
import { sha256 } from "@noble/hashes/sha2.js";

const FLAG_USER_PRESENT = 0x01;
const FLAG_USER_VERIFIED = 0x04;
const KEY_FILE = new URL("../.dev-passkey.json", import.meta.url);

const b64 = (bytes) => Buffer.from(bytes).toString("base64");

export function loadOrCreateDevPasskey() {
  if (!existsSync(KEY_FILE)) {
    const secret = p256.utils.randomSecretKey();
    writeFileSync(KEY_FILE, JSON.stringify({ secret: b64(secret) }), { mode: 0o600 });
  }
  const secret = Buffer.from(JSON.parse(readFileSync(KEY_FILE, "utf8")).secret, "base64");
  return {
    publicKeyB64: b64(p256.getPublicKey(secret, true)),
    /** Sign a contract challenge (base64url) as if the user passed Face ID. */
    assert(challenge, { rpId, origin }) {
      const authData = new Uint8Array([
        ...sha256(new TextEncoder().encode(rpId)),
        FLAG_USER_PRESENT | FLAG_USER_VERIFIED,
        0, 0, 0, 1, // sign counter
      ]);
      const clientDataJSON = JSON.stringify({ type: "webauthn.get", challenge, origin, crossOrigin: false });
      const signed = new Uint8Array([...authData, ...sha256(new TextEncoder().encode(clientDataJSON))]);
      const signature = p256.sign(sha256(signed), secret, { prehash: false });
      return {
        authenticator_data: b64(authData),
        client_data_json: clientDataJSON,
        signature: b64(signature),
      };
    },
  };
}
