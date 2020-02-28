import { createModule } from '@vue-storefront/core/lib/module'
import { beforeRegistration } from './hooks/beforeRegistration'
import module from './store'

export const KEY = 'stripe'
export const Stripe = createModule({
  key: KEY,
  beforeRegistration,
  store: { modules: [{ key: KEY, module }] },
})
