import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('invoices', (t) => {
    t.integer('extraction_retry_count').notNullable().defaultTo(0);
    t.timestamp('extraction_last_retried_at').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('invoices', (t) => {
    t.dropColumn('extraction_last_retried_at');
    t.dropColumn('extraction_retry_count');
  });
}
