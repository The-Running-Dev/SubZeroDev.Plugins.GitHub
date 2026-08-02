import type { ResultEnvelope } from './envelope.js';
import { writeEnvelope } from './envelope.js';

export function writeResult(
  envelope: ResultEnvelope,
  format: 'text' | 'json',
  stdout: NodeJS.WritableStream,
): void {
  if (format === 'json') {
    writeEnvelope(envelope, stdout);
    return;
  }

  const lines = [envelope.summary];
  if (Object.keys(envelope.data).length > 0) lines.push(JSON.stringify(envelope.data, null, 2));
  for (const warning of envelope.warnings)
    lines.push(`Warning [${warning.code}]: ${warning.message}`);
  for (const error of envelope.errors) lines.push(`Error [${error.code}]: ${error.message}`);
  for (const artifact of envelope.artifacts) lines.push(`${artifact.name}: ${artifact.path}`);
  stdout.write(`${lines.join('\n')}\n`);
}
