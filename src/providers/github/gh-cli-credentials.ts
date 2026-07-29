import { homedir } from 'node:os';
import { join } from 'node:path';

import { parse } from 'yaml';

import type {
  ExternalCredential,
  ExternalCredentialSource,
  FileSystemPort,
} from '../../services/ports.js';

/**
 * Where the GitHub CLI keeps `hosts.yml`. `GH_CONFIG_DIR` wins when set, matching
 * `gh` itself; otherwise the platform default.
 */
export function ghConfigPath(environment: Readonly<NodeJS.ProcessEnv>, home = homedir()): string {
  const explicit = environment['GH_CONFIG_DIR'];
  if (explicit) return join(explicit, 'hosts.yml');

  if (process.platform === 'win32') {
    const appData = environment['AppData'];
    return join(appData ?? join(home, 'AppData', 'Roaming'), 'GitHub CLI', 'hosts.yml');
  }

  const xdg = environment['XDG_CONFIG_HOME'];
  return join(xdg ?? join(home, '.config'), 'gh', 'hosts.yml');
}

function extractToken(parsed: unknown, host: string): string | null {
  if (typeof parsed !== 'object' || parsed === null) return null;
  const entry = (parsed as Record<string, unknown>)[host];
  if (typeof entry !== 'object' || entry === null) return null;
  const token = (entry as Record<string, unknown>)['oauth_token'];
  return typeof token === 'string' && token.length > 0 ? token : null;
}

/**
 * Lives under `src/providers/github/` because `hosts.yml`, the `github.com` key, and
 * the `oauth_token` field are all GitHub CLI specifics — provider-specific
 * acquisition belongs behind the provider boundary. Token resolution depends only on
 * the `ExternalCredentialSource` port, so nothing in `src/configuration/` knows this
 * format exists.
 *
 * Reads the credential **directly, as a file**. Deliberately not `gh auth token` in a
 * subprocess: spawning one would require declaring `capabilities.processExecution:
 * true` in the manifest, widening the security surface of the reference plugin every
 * other plugin is scaffolded from, for an opt-in convenience most runs never use.
 * `hosts.yml` is already YAML, which this package already parses.
 *
 * Scoped to native execution by nature. `gh`'s config lives in the invoking user's
 * home directory, outside the plugin's declared filesystem scopes, so under the
 * Docker runtime this finds nothing — by design, since mounting it would be exactly
 * the capability widening this avoids. There, reuse degrades to "not found" and the
 * run refuses for want of a token, as it would with reuse switched off.
 */
export function createGhCliCredentialSource(
  fileSystem: FileSystemPort,
  environment: Readonly<NodeJS.ProcessEnv>,
  host = 'github.com',
): ExternalCredentialSource {
  const configPath = ghConfigPath(environment);

  return {
    async read(): Promise<ExternalCredential | null> {
      let contents: string;
      try {
        contents = new TextDecoder().decode(await fileSystem.readFile(configPath));
      } catch {
        // Absent or unreadable is a normal outcome, not an error: the user simply
        // has no gh session on this machine.
        return null;
      }

      let parsed: unknown;
      try {
        parsed = parse(contents);
      } catch {
        return null;
      }

      const token = extractToken(parsed, host);
      return token === null ? null : { token, configPath };
    },
  };
}
