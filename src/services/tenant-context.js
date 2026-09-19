import { TenantJsonStore } from '../storage/tenant-json-store.js';
import { OpportunityService } from './opportunities.js';
import { VendorWatchService } from './vendors.js';

export function createTenantContext({ store = null, tenantRoot, tenantId, provider, detailProvider = null, watchProvider = null, exclusionProvider = null, seedProfile, seedOpportunities, excludeDemoSeed = false }) {
  const tenantStore = store || new TenantJsonStore({ root: tenantRoot, tenantId, seedProfile, seedOpportunities });
  return {
    store:tenantStore,
    service:new OpportunityService({ store:tenantStore, provider, detailProvider, watchProvider, excludeDemoSeed }),
    vendorService:new VendorWatchService({ store:tenantStore, exclusionProvider })
  };
}
