import { SetMetadata } from '@nestjs/common';

export const RECENT_AUTH_SECONDS = 'recent-auth-seconds';

export const RequireRecentAuth = (seconds = 900) => SetMetadata(RECENT_AUTH_SECONDS, seconds);
