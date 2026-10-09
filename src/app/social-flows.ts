// Owner: C
// The lazy `social-flows` chunk (phase2b §11 lazy-loading rules): the rankings hub and the event top
// list (rank-hub-flow), group challenges (group-flow) and the group result dialog. None is needed for
// the first screen: the web only reaches the event top list after a tap, and the hub and groups are
// FB-only. boot.ts imports this module with ONE dynamic import (loadChunk) on first use; nothing in
// the main bundle imports it statically.
import { t } from '../i18n';
import { createGroupFlow, type GroupFlow, type GroupFlowDeps } from './group-flow';
import { createRankHubFlow, type RankHubFlowDeps } from './rank-hub-flow';
import type { Router } from './router';

export { createGroupFlow, createRankHubFlow };
export type { GroupFlow, GroupFlowDeps, RankHubFlowDeps };

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
