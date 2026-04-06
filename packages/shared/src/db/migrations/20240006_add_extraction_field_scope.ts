import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('extraction_field_configs', (t) => {
    t.enu('applies_to', ['header', 'line_item']).notNullable().defaultTo('header');
  });

  await knex.raw('ALTER TABLE extraction_field_configs DROP CONSTRAINT IF EXISTS extraction_field_configs_field_key_unique');
  await knex.raw('CREATE UNIQUE INDEX IF NOT EXISTS idx_extraction_field_configs_key_scope ON extraction_field_configs(field_key, applies_to)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS idx_extraction_field_configs_key_scope');
  await knex.raw('ALTER TABLE extraction_field_configs DROP COLUMN IF EXISTS applies_to');
  await knex.raw('CREATE UNIQUE INDEX IF NOT EXISTS extraction_field_configs_field_key_unique ON extraction_field_configs(field_key)');
}
