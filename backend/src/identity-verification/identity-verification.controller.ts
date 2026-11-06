import {
  ArgumentsHost,
  Body,
  Catch,
  Controller,
  ExceptionFilter,
  Get,
  HttpCode,
  HttpStatus,
  PayloadTooLargeException,
  Post,
  Request,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { ID_IMAGE_MAX_BYTES, IdVerificationErrorCode, type IdName } from '@agap/shared';
import { Public } from '../common/decorators/public.decorator';
import { MULTER_MEMORY_STORAGE } from '../media/media.service';
import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IdClaimDto } from './dto/id-claim.dto';
import { IdScanDto } from './dto/id-scan.dto';
import { IdentityVerificationService, idVerificationError, typedNameFrom } from './identity-verification.service';

/** Multer stops reading at the size limit; give that refusal the same stable `code` as the service's. */
@Catch(PayloadTooLargeException)
class IdImageTooLargeFilter implements ExceptionFilter {
  catch(_exception: PayloadTooLargeException, host: ArgumentsHost) {
    const body = idVerificationError(
      HttpStatus.PAYLOAD_TOO_LARGE,
      IdVerificationErrorCode.IMAGE_TOO_LARGE,
      'The ID image is too large (2 MB maximum).',
    ).getResponse();
    host.switchToHttp().getResponse<Response>().status(HttpStatus.PAYLOAD_TOO_LARGE).json(body);
  }
}

/**
 * MOD-01: the PhilHealth ID scan before account creation (plan §5.3). Registered in
 * AuthModule because it shares the auth route prefix and AuthService's geo-fence.
 */
@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class IdentityVerificationController {
  constructor(
    private readonly authService: AuthService,
    private readonly identityVerification: IdentityVerificationService,
  ) {}

  @Post('id-verification')
  @Public()
  @HttpCode(HttpStatus.OK)
  // Same limits as POST /auth/register.
  @Throttle({ burst: { ttl: 60000, limit: 5 }, sustained: { ttl: 900000, limit: 10 } })
  @UseFilters(IdImageTooLargeFilter)
  @UseInterceptors(
    FileInterceptor('image', { storage: MULTER_MEMORY_STORAGE, limits: { fileSize: ID_IMAGE_MAX_BYTES, files: 1 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['image', 'consentGiven', 'latitude', 'longitude'],
      properties: {
        image: { type: 'string', format: 'binary', description: 'Front of the PhilHealth ID, JPEG or PNG, max 2 MB' },
        consentGiven: { type: 'boolean' },
        latitude: { type: 'number' },
        longitude: { type: 'number' },
        clientText: { type: 'string' },
        attemptNumber: { type: 'integer' },
        requestReview: { type: 'boolean' },
      },
    },
  })
  @ApiOperation({ summary: 'Scan a PhilHealth ID before creating a citizen account (MOD-01)' })
  @ApiResponse({ status: 200, description: '{ token, nameOnId, pinLast4, reviewRequired }' })
  @ApiResponse({ status: 409, description: 'ID_ALREADY_REGISTERED' })
  @ApiResponse({ status: 422, description: 'NOT_PHILHEALTH_ID or UNREADABLE' })
  async scan(@UploadedFile() image: Express.Multer.File | undefined, @Body() dto: IdScanDto) {
    if (dto.consentGiven !== true) {
      throw idVerificationError(
        HttpStatus.BAD_REQUEST,
        IdVerificationErrorCode.CONSENT_REQUIRED,
        'Please agree to the PhilHealth ID check first.',
      );
    }
    const geo = await this.authService.checkGeoFence(dto.latitude, dto.longitude);
    if (!geo.inside) {
      throw idVerificationError(
        HttpStatus.BAD_REQUEST,
        IdVerificationErrorCode.OUTSIDE_SERVICE_AREA,
        'Registration is only available for residents and workers within Bocaue, Bulacan.',
      );
    }
    return this.identityVerification.scan(image, {
      clientText: dto.clientText,
      attemptNumber: dto.attemptNumber,
      requestReview: dto.requestReview,
    });
  }

  @Get('id-verification/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "The signed-in citizen's PhilHealth ID status, for their profile" })
  status(@Request() req: { user: { id: string } }) {
    return this.identityVerification.profileStatus(req.user.id);
  }

  /** Scanning again from the profile: the scan goes through POST id-verification as at registration. */
  @Post('id-verification/claim')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ burst: { ttl: 60000, limit: 5 }, sustained: { ttl: 900000, limit: 10 } })
  @ApiOperation({ summary: "Claim a new PhilHealth ID scan for the signed-in citizen's account" })
  @ApiResponse({ status: 400, description: 'ID_SCAN_EXPIRED or NAME_DOES_NOT_MATCH_ID' })
  @ApiResponse({ status: 409, description: 'ID_ALREADY_REGISTERED' })
  claim(@Request() req: { user: { id: string } }, @Body() dto: IdClaimDto) {
    return this.identityVerification.claimForUser(
      req.user.id,
      dto.idVerificationToken,
      typedNameFrom(dto) as IdName,
      dto.requestReview === true,
    );
  }
}
