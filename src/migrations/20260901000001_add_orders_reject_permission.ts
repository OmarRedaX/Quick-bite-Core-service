import type {Knex} from "knex";

/**
 * The order-status permission catalog (20260418000001) never seeded a
 * distinct `orders:reject` action — the reject transition on
 * order-service's restaurant-scoped PATCH .../orders/:publicId/status was
 * gated only by restaurant/branch membership, not by role, so `staff`
 * (seeded with `orders:accept` but not meant to reject) could reject
 * orders anyway. This adds the missing permission and grants it to the
 * same roles that already get `orders:accept` — `owner` and
 * `branch_manager` — but deliberately NOT `staff`, matching this
 * migration's own "staff -> read/update/accept only" intent.
 *
 * `owner`'s "every permission" grant in 20260327014716_seed_rbac_data.ts
 * already ran and only covered permissions that existed at that time, so
 * it must be granted here explicitly too, not assumed to already apply.
 */
export async function up(knex: Knex): Promise<void> {
    await knex.raw(`
        INSERT INTO permissions (resource, action, created_at) VALUES
            ('orders', 'reject', NOW())
        ON CONFLICT (resource, action) DO NOTHING;
    `);

    await knex.raw(`
        INSERT INTO role_permissions (role_id, permission_id, created_at)
        SELECT r.id, p.id, NOW()
        FROM roles r, permissions p
        WHERE r.name IN ('owner', 'branch_manager')
          AND p.resource = 'orders'
          AND p.action = 'reject'
        ON CONFLICT DO NOTHING;
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`
        DELETE FROM role_permissions
        WHERE permission_id IN (
            SELECT id FROM permissions WHERE resource = 'orders' AND action = 'reject'
        );
        DELETE FROM permissions WHERE resource = 'orders' AND action = 'reject';
    `);
}
