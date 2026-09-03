import {db} from "../../src/lib/knex/knex";

// RBAC catalog tables are seeded once by migrations (roles, permissions,
// role_permissions) and never reseeded — truncating them here would silently
// wipe RBAC data for the rest of the test run, breaking every later test that
// depends on it (register-as-restaurant-owner, member invites, the rbac()
// middleware). Matches order-service's reset-and-seed script, which keeps
// the same three tables stable across resets (see TESTING_GUIDE.md).
//
// spatial_ref_sys is PostGIS's own reference-data table (SRID definitions,
// installed once by `CREATE EXTENSION postgis`) — truncating it breaks every
// geography operation (ST_DWithin/ST_MakePoint, and the `location` GENERATED
// column on restaurant_branches) with "Cannot find SRID (4326)".
const PRESERVED_TABLES = ['roles', 'permissions', 'role_permissions', 'spatial_ref_sys'];

export async function truncateAll(): Promise<void> {
    const result = await db.raw<{rows: {tablename: string}[]}>
    (`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public'
        AND tableName NOT IN ('knex_migrations', 'knex_migrations_lock')`);

    const tableNames = result.rows
        .map((r) => r.tablename)
        .filter((name) => !PRESERVED_TABLES.includes(name))
        .map((name) => `"${name}"`)
        .join(", ");

    await db.raw(`TRUNCATE TABLE ${tableNames} RESTART IDENTITY CASCADE`)
}