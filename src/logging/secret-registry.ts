const secrets = new Set<string>();

export function registerSecret(secret: string): void {
  if (secret) secrets.add(secret);
}
export function registeredSecrets(): readonly string[] {
  return [...secrets];
}
export function clearRegisteredSecrets(): void {
  secrets.clear();
}
