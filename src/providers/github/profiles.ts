import type { CollectionProfile } from '../provider.js';

import { ENDPOINTS, type EndpointDescriptor } from './endpoints.js';

export function endpointsForProfile(profile: CollectionProfile): readonly EndpointDescriptor[] {
  return ENDPOINTS.filter((endpoint) => endpoint.profiles.includes(profile));
}
