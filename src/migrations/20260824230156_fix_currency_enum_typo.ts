import type { Knex } from "knex";

// currency_enum was originally created with a typo ('EG' instead of 'EGP'),
// but application code (branch/enums.ts Currency.EGP) inserts 'EGP'. Renaming
// the enum value fixes existing rows in place — no data loss.
export async function up(knex: Knex): Promise<void> {
    await knex.raw(`ALTER TYPE currency_enum RENAME VALUE 'EG' TO 'EGP';`);
}


export async function down(knex: Knex): Promise<void> {
    await knex.raw(`ALTER TYPE currency_enum RENAME VALUE 'EGP' TO 'EG';`);
}

