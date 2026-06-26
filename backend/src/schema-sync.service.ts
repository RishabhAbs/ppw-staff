import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class SchemaSyncService {
  private logger = new Logger('SchemaSync');

  constructor(
    @InjectDataSource()
    private dataSource: DataSource,
  ) {}

  async syncSchema() {
    this.logger.log('Checking schema drift between entities and database...');
    try {
      const sqlInMemory = await this.dataSource.driver
        .createSchemaBuilder()
        .log();

      const upQueries = sqlInMemory.upQueries.map((q) => q.query);

      const additivePatterns = [
        /^CREATE TABLE/i,
        /^ALTER TABLE\s+`?[^`\s]+`?\s+ADD\s/i,
        /^CREATE\s+(UNIQUE\s+)?INDEX/i,
      ];

      const additive = upQueries.filter((sql) =>
        additivePatterns.some((p) => p.test(sql)),
      );
      const nonAdditive = upQueries.filter(
        (sql) => !additive.includes(sql),
      );

      if (additive.length === 0) {
        this.logger.log('Schema is up-to-date, no additive changes needed.');
      } else {
        this.logger.log(`Applying ${additive.length} additive schema change(s):`);
        for (const sql of additive) {
          try {
            await this.dataSource.query(sql);
            this.logger.log(`  applied: ${this.truncate(sql)}`);
          } catch (err) {
            this.logger.warn(`  failed: ${err.message} | sql: ${this.truncate(sql)}`);
          }
        }
      }

      if (nonAdditive.length > 0) {
        this.logger.warn(
          `Skipped ${nonAdditive.length} non-additive change(s) (review manually — these may drop or alter data):`,
        );
        for (const sql of nonAdditive) {
          this.logger.warn(`  skipped: ${this.truncate(sql)}`);
        }
      }
    } catch (err) {
      this.logger.error(`Schema drift check failed: ${err.message}`);
    }
  }

  private truncate(sql: string, max = 200): string {
    return sql.length > max ? sql.slice(0, max) + '...' : sql;
  }
}