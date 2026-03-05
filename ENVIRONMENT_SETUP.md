# Environment Configuration Guide

## Overview

This guide explains how to set up environment variables for the Workflow Engine application. The application uses environment-specific configuration files and includes comprehensive validation.

## Environment Files

### File Structure
```
├── .env                           # Default environment file
├── .env.stage.dev                # Development environment
├── .env.stage.staging            # Staging environment  
├── .env.stage.uat                # UAT environment
├── .env.stage.prod               # Production environment
└── .env.stage.test               # Test environment
```

### Loading Priority
The application loads environment variables in this order:
1. `.env.stage.${STAGE}` (e.g., `.env.stage.dev`)
2. `.env` (fallback)
3. System environment variables

## Required Environment Variables

### Core Application
```bash
NODE_ENV=development              # Environment mode
STAGE=dev                        # Application stage
PORT=3000                        # Server port
```

### Database (PostgreSQL)
```bash
DB_HOST=localhost                # Database host
DB_PORT=5432                     # Database port
DB_USER=postgres                 # Database username
DB_PASSWORD=your_password        # Database password
DATABASE=workflow-engine         # Database name
```

### Redis (Caching & Rate Limiting)
```bash
REDIS_URL=redis://localhost:6379 # Redis connection URL
```

### JWT Authentication
```bash
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
JWT_EXPIRES_IN=24h               # Token expiration
JWT_REFRESH_EXPIRY_DAYS=7        # Refresh token expiry
SESSION_SECRET=your-session-secret-min-16-chars
```

### Rate Limiting
```bash
THROTTLE_TTL=60000               # Throttle window (ms)
THROTTLE_LIMIT=2000              # Global rate limit (high for backup)
```

### Email Configuration
```bash
EMAIL_USERNAME=your_smtp_user    # SMTP username
EMAIL_PASSWORD=your_smtp_pass    # SMTP password
EMAIL_HOST=smtp.mailtrap.io      # SMTP host
EMAIL_PORT=2525                  # SMTP port
SMTP_FROM=noreply@yourapp.com    # From email address
```

### Message Broker
```bash
NATS_URL=nats://localhost:4222   # NATS server URL
```

### OAuth (Google)
```bash
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

### Frontend
```bash
FR_BASE_URL=http://localhost:3000 # Frontend URL for emails
```

### AWS (Optional)
```bash
AWS_REGION=us-east-1             # AWS region
AWS_ACCESS_KEY=your_access_key   # AWS access key
AWS_SECRET_ACCESS_KEY=your_secret # AWS secret key
AWS_SECRET_NAME=your_secret_arn  # Secrets Manager ARN
AWS_PUBLIC_BUCKET_NAME=your_bucket # S3 bucket name
```

## Environment Validation

The application includes comprehensive environment validation using Joi schema:

### Validation Features
- **Type checking**: Ensures correct data types
- **Required fields**: Validates mandatory variables
- **Default values**: Provides sensible defaults
- **Format validation**: Validates URLs, emails, etc.
- **Enum validation**: Restricts values to allowed options

### Validation Schema Location
- Schema: [`libs/shared/src/utils/env.validation.ts`](libs/shared/src/utils/env.validation.ts)
- Helper: [`libs/shared/src/utils/env.helper.ts`](libs/shared/src/utils/env.helper.ts)

### Usage Example
```typescript
import { validateEnvironment, getEnvVar, isDevelopment } from '@app/shared';

// Validate all environment variables
const config = validateEnvironment();

// Get specific environment variable with type safety
const dbHost = getEnvVar('DB_HOST');
const port = getEnvVar<number>('PORT', 3000);

// Environment checks
if (isDevelopment()) {
  console.log('Running in development mode');
}
```

## Setup Instructions

### 1. Copy Environment File
```bash
# Copy the template
cp .env .env.stage.dev

# Or create environment-specific files
cp .env .env.stage.staging
cp .env .env.stage.prod
```

### 2. Update Configuration
Edit the environment file with your specific values:
```bash
# Update database credentials
DB_HOST=your_db_host
DB_PASSWORD=your_secure_password

# Update JWT secrets (use strong, random values)
JWT_SECRET=$(openssl rand -base64 32)
SESSION_SECRET=$(openssl rand -base64 24)

# Update email configuration
EMAIL_USERNAME=your_smtp_username
EMAIL_PASSWORD=your_smtp_password
```

### 3. Validate Configuration
The application will validate environment variables on startup. If validation fails, you'll see detailed error messages:

```bash
npm run start:dev
# Environment validation failed: JWT_SECRET must be at least 32 characters long
```

## Environment-Specific Configurations

### Development (.env.stage.dev)
```bash
NODE_ENV=development
STAGE=dev
THROTTLE_LIMIT=2000              # Higher limit for development
LOG_LEVEL=debug                  # Verbose logging
```

### Production (.env.stage.prod)
```bash
NODE_ENV=production
STAGE=prod
THROTTLE_LIMIT=1000              # Lower limit for production
LOG_LEVEL=warn                   # Less verbose logging
# Use strong, unique secrets
# Consider using AWS Secrets Manager
```

### Testing (.env.stage.test)
```bash
NODE_ENV=test
STAGE=test
DATABASE=workflow-engine-test    # Separate test database
REDIS_URL=redis://localhost:6380 # Separate test Redis
```

## Security Best Practices

### 1. Secret Management
- **Development**: Use `.env` files (not committed)
- **Production**: Use AWS Secrets Manager or similar
- **Never commit**: Add `.env*` to `.gitignore`

### 2. Strong Secrets
```bash
# Generate strong JWT secret (32+ characters)
JWT_SECRET=$(openssl rand -base64 32)

# Generate strong session secret (16+ characters)  
SESSION_SECRET=$(openssl rand -base64 24)
```

### 3. Environment Isolation
- Use different databases for each environment
- Use different Redis instances
- Use different AWS accounts/regions

## Troubleshooting

### Common Issues

#### 1. Validation Errors
```bash
# Error: JWT_SECRET is required
# Solution: Add JWT_SECRET to your .env file

# Error: THROTTLE_LIMIT must be a number
# Solution: Remove quotes around numeric values
THROTTLE_LIMIT=2000  # ✅ Correct
THROTTLE_LIMIT="2000" # ❌ Wrong
```

#### 2. Database Connection Issues
```bash
# Check database configuration
DB_HOST=localhost     # Correct host
DB_PORT=5432         # Correct port
DB_USER=postgres     # Valid user
DB_PASSWORD=password # Correct password
DATABASE=workflow-engine # Existing database
```

#### 3. Redis Connection Issues
```bash
# Check Redis URL format
REDIS_URL=redis://localhost:6379        # ✅ Correct
REDIS_URL=redis://user:pass@host:6379   # ✅ With auth
REDIS_URL=localhost:6379                # ❌ Missing protocol
```

### Debugging Environment Issues
```typescript
// Add to your code for debugging
import { validateEnvironment } from '@app/shared';

try {
  const config = validateEnvironment();
  console.log('Environment validation successful');
} catch (error) {
  console.error('Environment validation failed:', error.message);
}
```

## Docker Configuration

### Docker Compose Example
```yaml
version: '3.8'
services:
  app:
    build: .
    environment:
      - NODE_ENV=production
      - STAGE=prod
      - DB_HOST=postgres
      - REDIS_URL=redis://redis:6379
    env_file:
      - .env.stage.prod
```

### Kubernetes ConfigMap
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: workflow-engine-config
data:
  NODE_ENV: "production"
  STAGE: "prod"
  DB_HOST: "postgres-service"
  REDIS_URL: "redis://redis-service:6379"
```

## Migration from Old Configuration

If you're migrating from an older configuration:

1. **Check missing variables**: Run the app to see validation errors
2. **Update variable names**: Some variables may have been renamed
3. **Add new variables**: New features may require additional configuration
4. **Validate thoroughly**: Test all functionality after migration

## Support

For environment configuration issues:
1. Check the validation schema in `libs/shared/src/utils/env.validation.ts`
2. Review this documentation
3. Check application logs for specific validation errors
4. Ensure all required services (PostgreSQL, Redis, NATS) are running