import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus, Logger } from '@nestjs/common';
import { Response } from 'express';
import { Prisma } from '@prisma/client';

@Catch(
  Prisma.PrismaClientKnownRequestError,
  Prisma.PrismaClientUnknownRequestError,
  Prisma.PrismaClientInitializationError,
  Prisma.PrismaClientValidationError,
)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof Prisma.PrismaClientInitializationError) {
      this.logger.error(`Database initialization error: ${exception.message}`);
      return response.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        message: 'Database unavailable. Please try again shortly.',
      });
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      this.logger.warn(`Prisma known error [${exception.code}]: ${exception.message}`);
      if (exception.code === 'P2002') {
        return response.status(HttpStatus.CONFLICT).json({
          statusCode: HttpStatus.CONFLICT,
          message: 'A record with this value already exists.',
        });
      }
      if (exception.code === 'P2025') {
        return response.status(HttpStatus.NOT_FOUND).json({
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Record not found.',
        });
      }
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      this.logger.warn(`Prisma validation error: ${exception.message}`);
      return response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Invalid query parameters.',
      });
    }

    const msg = exception instanceof Error ? exception.message : String(exception);
    this.logger.error(`Unhandled Prisma error: ${msg}`);
    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'An unexpected database error occurred.',
    });
  }
}
