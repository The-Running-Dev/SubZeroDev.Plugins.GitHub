export { ConfigurationError, type ConfigurationErrorCode } from './errors.js';
export {
  resolveToken,
  type ResolvedToken,
  type ResolveTokenOptions,
  type TokenResolution,
} from './environment.js';
export { loadConfiguration, type LoadedConfiguration } from './load.js';
export { resolveConfiguration, type ResolvedConfiguration } from './resolve.js';
export { configurationSchema, type Configuration } from './schema.js';

// The GitHub CLI credential reader is deliberately NOT re-exported here. It lives at
// src/providers/github/gh-cli-credentials.ts because parsing `hosts.yml` for an
// `oauth_token` is provider-specific acquisition; re-exporting it from the
// configuration barrel would put a provider format back on this layer's surface.
// Token resolution takes the `ExternalCredentialSource` port instead.
