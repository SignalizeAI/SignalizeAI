import { broadcastToWebsiteTabs } from './website-sync.js';

export async function syncProspectContentToWebsite(
  savedIds: string[] = []
): Promise<void> {
  const ids = savedIds.filter(Boolean);

  await broadcastToWebsiteTabs({
    type: 'SYNC_PROSPECT_CONTENT_TO_PAGE',
    ...(ids.length === 1 ? { savedId: ids[0] } : {}),
    ...(ids.length > 0 ? { savedIds: ids } : {}),
  });
}
