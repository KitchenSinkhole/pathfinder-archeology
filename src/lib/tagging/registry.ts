// Stage 17.10. The scheme → strategy lookup. Adding a third scheme is purely
// additive: write a new module implementing `TagStrategy`, add its enum value in
// `src/db/schema/ap/enums.ts` (`tag_scheme`), and add one line here. The existing
// strategies are never touched.

import { abcStrategy } from './abc';
import { scheme0121Strategy } from './scheme0121';
import type { ActiveScheme, TagStrategy } from './types';

export const TAG_STRATEGIES: Record<ActiveScheme, TagStrategy> = {
  abc: abcStrategy,
  '0121': scheme0121Strategy,
};
