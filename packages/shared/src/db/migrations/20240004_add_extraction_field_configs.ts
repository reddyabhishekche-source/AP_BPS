import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('extraction_field_configs', (t) => {
    t.uuid('field_id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('field_key', 100).notNullable().unique();
    t.string('field_label', 200).notNullable();
    t.enu('field_type', ['string', 'number', 'date', 'boolean']).notNullable().defaultTo('string');
    t.text('description').nullable();
    t.boolean('required').notNullable().defaultTo(false);
    t.boolean('is_active').notNullable().defaultTo(true);
    t.integer('sort_order').notNullable().defaultTo(0);
    t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('extraction_field_configs');
}
