import { Controller, Get, Header, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Public } from '../common/decorators/public.decorator';

/**
 * Digital Asset Links (Android) and Apple App Site Association (iOS) documents.
 *
 * Native passkeys only work when the domain in WEBAUTHN_RP_ID vouches for the
 * mobile app. Both OSes fetch these over HTTPS from
 * https://<WEBAUTHN_RP_ID>/.well-known/…, so the RP domain must route
 * /.well-known/* to this backend (see infrastructure/nginx).
 */
@ApiExcludeController()
@Controller({ path: '.well-known', version: VERSION_NEUTRAL })
export class WellKnownController {
  constructor(private readonly config: ConfigService) {}

  @Get('assetlinks.json')
  @Public()
  @Header('Content-Type', 'application/json')
  assetLinks() {
    const fingerprints = this.csv('WEBAUTHN_ANDROID_CERT_FINGERPRINTS');
    if (fingerprints.length === 0) return [];

    return [
      {
        relation: [
          'delegate_permission/common.handle_all_urls',
          'delegate_permission/common.get_login_creds',
        ],
        target: {
          namespace: 'android_app',
          package_name: this.config.get<string>('WEBAUTHN_ANDROID_PACKAGE', 'com.agap.emergency'),
          sha256_cert_fingerprints: fingerprints.map((f) => f.toUpperCase()),
        },
      },
    ];
  }

  @Get('apple-app-site-association')
  @Public()
  @Header('Content-Type', 'application/json')
  appleAppSiteAssociation() {
    // Entries are "<TEAM_ID>.<bundle identifier>", e.g. "ABCDE12345.com.agap.emergency".
    return { webcredentials: { apps: this.csv('WEBAUTHN_IOS_APP_IDS') } };
  }

  private csv(key: string): string[] {
    return (this.config.get<string>(key) ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  }
}
