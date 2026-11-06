import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Request,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { UserRole } from '@agap/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { RecentAuthGuard } from '../common/guards/recent-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireRecentAuth } from '../common/decorators/recent-auth.decorator';
import { IdCardLookupDto, IdCardReleaseDto, IdRejectDto, IdReviewQueryDto } from './dto/id-review.dto';
import { IdentityVerificationReviewService, type ReviewActor } from './identity-verification-review.service';

/**
 * Staff review of PhilHealth IDs sent for review at registration (MOD-01 / MOD-48, plan §7).
 * Under /administration like the other admin routes (the plan's draft said /admin).
 * @Roles narrows to the two admin roles; the service then allows an Org Administrator only
 * if their organization is MDRRMO (Part B Q1).
 */
@ApiTags('administration')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SYSTEM_ADMINISTRATOR, UserRole.ORG_ADMINISTRATOR)
@Controller({ path: 'administration/id-verifications', version: '1' })
export class IdentityVerificationAdminController {
  constructor(private readonly review: IdentityVerificationReviewService) {}

  @Get()
  @ApiOperation({ summary: 'PhilHealth ID review queue (no image, no PIN)' })
  list(@Request() req: { user: ReviewActor }, @Query() query: IdReviewQueryDto) {
    return this.review.list(req.user, query);
  }

  @Post('find-by-pin')
  @HttpCode(200)
  // Staff type this from a card in front of them, so a few a minute is plenty; slows any guessing.
  @Throttle({ burst: { ttl: 60000, limit: 10 }, sustained: { ttl: 900000, limit: 30 } })
  @ApiOperation({ summary: 'Which account holds this PhilHealth ID? Audited, without the number.' })
  @ApiResponse({ status: 404, description: 'No account holds this card' })
  findByPin(@Request() req: { user: ReviewActor }, @Body() dto: IdCardLookupDto) {
    return this.review.findCardHolder(req.user, dto.pin);
  }

  @Post(':id/release')
  @HttpCode(200)
  // Takes verified status from a citizen and frees their card: same bar as unlocking an account.
  @UseGuards(RecentAuthGuard)
  @RequireRecentAuth()
  @ApiOperation({ summary: 'Release a PhilHealth ID from the account holding it; erases its card data and notifies the citizen' })
  @ApiResponse({ status: 409, description: 'This card is no longer linked to the account' })
  release(@Request() req: { user: ReviewActor }, @Param('id', ParseUUIDPipe) id: string, @Body() dto: IdCardReleaseDto) {
    return this.review.releaseCard(req.user, id, dto.reason);
  }

  @Get(':id/image')
  @ApiOperation({ summary: 'The stored ID image. Every call is audited (ID_IMAGE_VIEWED).' })
  @ApiResponse({ status: 410, description: 'The image has been deleted' })
  async image(
    @Request() req: { user: ReviewActor },
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { image, contentType } = await this.review.openImage(req.user, id);
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(image, { type: contentType, length: image.length, disposition: 'inline' });
  }

  @Post(':id/approve')
  @HttpCode(200)
  @ApiOperation({ summary: 'Approve a PhilHealth ID under review; deletes the image and notifies the citizen' })
  approve(@Request() req: { user: ReviewActor }, @Param('id', ParseUUIDPipe) id: string) {
    return this.review.approve(req.user, id);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reject a PhilHealth ID under review; deletes the image and notifies the citizen' })
  reject(@Request() req: { user: ReviewActor }, @Param('id', ParseUUIDPipe) id: string, @Body() dto: IdRejectDto) {
    return this.review.reject(req.user, id, dto.reason);
  }
}
