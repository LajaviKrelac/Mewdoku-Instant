// Owner: C
// The lazy `social-flows` chunk (phase2b §11 lazy-loading rules): the event top list (event-top-flow; the
// rankings hub went at Phase 2e I-3, spec §2.10), group challenges (group-flow) and the group result dialog. None
// is needed for the first screen: the web only reaches the event top list after a tap, and groups are FB-only. boot.ts imports this module with ONE dynamic import (loadChunk) on first use; nothing in
// the main bundle imports it statically.
import { t } from '../i18n';
import '../i18n/en-lazy'; // the lazy English strings (I-4)
import { createGroupFlow, type GroupFlow, type GroupFlowDeps } from './group-flow';
import { createEventTopFlow, type EventTopFlowDeps } from './event-top-flow';
import type { Router } from './router';

export { createEventTopFlow, createGroupFlow };
export type { EventTopFlowDeps, GroupFlow, GroupFlowDeps };

/** Shows the first finished, unclaimed group challenge's result (phase2b §5.6), if any. Never rejects. */
export async function showGroupResult(groups: GroupFlow, router: Pick<Router, 'open' | 'update' | 'close' | 'toast'>): Promise<void> {
  const pending = await groups.pendingResult().catch(() => null);
  if (!pending) return;
  let busy = false;
  const props = () => ({
    outcome: pending.outcome,
    busy,
    onTake: () => void claim(false),
    onDouble: () => void claim(true),
  });
  const claim = async (doubled: boolean): Promise<void> => {
    if (busy) return;
    busy = true;
    router.update('group_result', props());
    const ok = await groups.claim(pending, doubled);
    busy = false;
    if (ok) router.close('group_result');
    else {
      if (doubled) router.toast(t('rewarded.noVideo'));
      router.update('group_result', props());
    }
  };
  router.open('group_result', props());
}
