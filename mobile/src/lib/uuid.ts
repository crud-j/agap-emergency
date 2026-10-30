/**
 * Random v4 UUID for client-generated ids: the SOS idempotency key and the transport
 * outbox's clientRequestId. Math.random is enough here: the id only has to be unique,
 * not secret (the server still checks who sends it).
 */
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
