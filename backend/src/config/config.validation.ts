import { plainToInstance } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, validateSync } from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment = Environment.Development;

  @IsString()
  DATABASE_URL: string;

  @IsString()
  REDIS_URL: string;

  @IsString()
  JWT_SECRET: string;

  @IsString()
  JWT_REFRESH_SECRET: string;

  @IsNumber()
  @IsOptional()
  BACKEND_PORT: number = 3000;

  @IsString()
  @IsOptional()
  CORS_ORIGIN: string = 'http://localhost:3001';

  @IsString()
  @IsOptional()
  STORAGE_ENDPOINT: string = 'http://localhost:9000';

  @IsString()
  @IsOptional()
  STORAGE_BUCKET: string = 'agap-media';

  @IsString()
  @IsOptional()
  STORAGE_ACCESS_KEY: string = '';

  @IsString()
  @IsOptional()
  STORAGE_SECRET_KEY: string = '';

  @IsString()
  @IsOptional()
  STORAGE_REGION: string = 'us-east-1';

  // Textbee SMS gateway (MOD-17). Optional: when unset the SMS processor logs
  // and no-ops, so OTP/alert flows still succeed without SMS delivery.
  @IsString()
  @IsOptional()
  TEXTBEE_API_KEY: string = '';

  @IsString()
  @IsOptional()
  TEXTBEE_DEVICE_ID: string = '';

  @IsString()
  @IsOptional()
  MDRRMO_OPS_PHONE: string = '';

  // Map provider abstraction (MOD-11/12/13/43). Tiles follow MAP_PROVIDER;
  // geocoding + routing default to the OSS/OSM stack regardless. Point the URLs
  // at self-hosted services for cost control, privacy, and surge availability.
  @IsString()
  @IsOptional()
  MAP_PROVIDER: string = 'mapbox';

  @IsString()
  @IsOptional()
  MAP_API_KEY: string = '';

  @IsString()
  @IsOptional()
  MAP_PROVIDER_ROUTING_URL: string = 'http://router.project-osrm.org';

  // Routing engine for ETA: 'osrm' (free, free-flow; default) or 'mapbox'
  // (traffic-aware; requires MAP_API_KEY). Falls back to OSRM when unset/invalid.
  @IsString()
  @IsOptional()
  MAP_ROUTER: string = 'osrm';

  @IsString()
  @IsOptional()
  MAP_GEOCODER_URL: string = 'https://nominatim.openstreetmap.org';

  @IsString()
  @IsOptional()
  MAP_STYLE_URL: string = '';
}

export function validateConfig(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.toString()}`);
  }

  return validatedConfig;
}
