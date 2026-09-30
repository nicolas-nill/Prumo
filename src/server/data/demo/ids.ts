/**
 * Deterministic UUIDs for demo entities (stable across reloads and between the in-memory
 * demo and the generated SQL seed). Not cryptographic — demo data only.
 */
function fnv1a(input: string, seed: number): number {
  let hash = 0x811c9dc5 ^ seed
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export function demoId(name: string): string {
  const hex = [0, 1, 2, 3].map((seed) => fnv1a(name, seed * 0x9e3779b1).toString(16).padStart(8, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}
