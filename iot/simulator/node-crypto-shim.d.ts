declare module "node:crypto" {
  export interface KeyObject { export(options: { type: "spki"; format: "pem" }): { toString(): string } }
  interface Bytes { toString(encoding: "hex" | "base64url"): string }
  export function generateKeyPairSync(kind: "ed25519"): { privateKey: KeyObject; publicKey: KeyObject };
  export function randomBytes(size: number): Bytes;
  export function sign(algorithm: null, data: Uint8Array, key: KeyObject): Bytes;
  export function verify(algorithm: null, data: Uint8Array, key: string, signature: Uint8Array): boolean;
}
