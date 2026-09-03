import type { Knex } from "knex";

// currency_enum was originally created with a typo ('EG' instead of 'EGP'),
// but application code (branch/enums.ts Currency.EGP) inserts 'EGP'. Renaming
// the enum value fixes existing rows in place — no data loss.
export async function up(knex: Knex): Promise<void> {
    await knex.raw(`
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_enum e
                JOIN pg_type t ON t.oid = e.enumtypid
                WHERE t.typname = 'currency_enum' AND e.enumlabel = 'EG'
            ) THEN
                ALTER TYPE currency_enum RENAME VALUE 'EG' TO 'EGP';
            END IF;
        END $$;
    `);
}


export async function down(knex: Knex): Promise<void> {
    await knex.raw(`
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM pg_enum e
                JOIN pg_type t ON t.oid = e.enumtypid
                WHERE t.typname = 'currency_enum' AND e.enumlabel = 'EGP'
            ) AND NOT EXISTS (
                SELECT 1 FROM pg_enum e
                JOIN pg_type t ON t.oid = e.enumtypid
                WHERE t.typname = 'currency_enum' AND e.enumlabel = 'EG'
            ) THEN
                ALTER TYPE currency_enum RENAME VALUE 'EGP' TO 'EG';
            END IF;
        END $$;
    `);
}

