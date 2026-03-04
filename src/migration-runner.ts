import { DataSource } from 'typeorm';
import { Logger } from '@nestjs/common';

/**
 * Runs database migrations automatically on application startup
 * 
 * @param dataSource - The TypeORM DataSource instance
 * @param exitOnFailure - Whether to exit the process if migrations fail (default: false)
 * @returns A promise that resolves when migrations are complete
 */
export async function runMigrations(dataSource: DataSource, exitOnFailure = false): Promise<void> {
  const logger = new Logger('MigrationRunner');
  
  try {
    logger.log('Initializing database connection');
    if (!dataSource.isInitialized) {
      await dataSource.initialize();
    }

    logger.log('Running pending migrations');
    const migrations = await dataSource.runMigrations();

    if (migrations.length > 0) {
      logger.log(`Successfully applied ${migrations.length} migrations:`);
      migrations.forEach((migration) => logger.log(`    - ${migration.name}`));
    } else {
      logger.log('No pending migrations to run');
    }
  } catch (error) {
    logger.error(`Migration error: ${error.message}`);
    logger.error(`Stack trace: ${error.stack}`);
    logger.error('Application startup failed due to migration errors');

    if (exitOnFailure) {
      process.exit(1);
    } else {
      logger.warn('Continuing application startup despite migration failure');
    }
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
      logger.log('Database connection closed');
    }
  }
}