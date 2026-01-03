import { supabase } from '@/lib/supabase';

type InsertNotificationOnceInput = {
  sender_id: string;
  recipient_id: string;
  title: string;
  description: string;
  is_read?: boolean;
  /**
   * Stable key that identifies the “event” so we don’t insert duplicates.
   * Example: "match:<matchId>:approved"
   */
  event_key: string;
};

function withEventKey(description: string, eventKey: string): string {
  const base = String(description || '').trimEnd();
  const key = String(eventKey || '').trim();
  if (!key) return base;
  if (base.includes(`EVENT_KEY:${key}`)) return base;
  // Keep the existing convention used elsewhere: "text --- metadata"
  return `${base}\n---\nEVENT_KEY:${key}`;
}

/**
 * Best-effort deduped notification insert.
 *
 * Notes:
 * - We do NOT rely on a DB unique constraint (none exists today).
 * - We embed EVENT_KEY into the description and query by it before insert.
 */
export async function insertNotificationOnce(input: InsertNotificationOnceInput): Promise<void> {
  const eventKey = String(input.event_key || '').trim();
  const recipientId = String(input.recipient_id || '').trim();
  const senderId = String(input.sender_id || '').trim();
  if (!eventKey || !recipientId || !senderId) {
    // Fallback to plain insert (but still avoid throwing in UI flows)
    await supabase.from('notifications').insert({
      sender_id: input.sender_id,
      recipient_id: input.recipient_id,
      title: input.title,
      description: input.description,
      is_read: input.is_read ?? false,
    } as any);
    return;
  }

  const desc = withEventKey(input.description, eventKey);

  try {
    const { data: existing } = await supabase
      .from('notifications')
      .select('id')
      .eq('recipient_id', recipientId)
      .eq('sender_id', senderId)
      .ilike('description', `%EVENT_KEY:${eventKey}%`)
      .limit(1);

    if (existing && existing.length > 0) return;
  } catch {
    // If the lookup fails, we still try to insert (best-effort).
  }

  await supabase.from('notifications').insert({
    sender_id: senderId,
    recipient_id: recipientId,
    title: input.title,
    description: desc,
    is_read: input.is_read ?? false,
  } as any);
}

