import type { JSX } from 'react';
import { MessageSquareText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

/**
 * MOD-17/19: the report arrived as a citizen SMS (no mobile data). Only the type, GPS and
 * send time came through, so the dispatcher calls the reporter back for the details.
 */
export const SMS_CHANNEL_HINT =
  'Sent by text message with no mobile data. Only the type, GPS and time came through: call the reporter back for details.';

export function SmsChannelBadge(): JSX.Element {
  return (
    <Badge variant="amber" title={SMS_CHANNEL_HINT}>
      <MessageSquareText size={11} aria-hidden="true" /> By SMS
    </Badge>
  );
}
