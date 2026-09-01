import type {Knex} from "knex";

/**
 * analytics-service's RBAC middleware (lib/rbac/middleware.go) gates every
 * restaurant-scoped analytics endpoint behind a single `analytics:read`
 * permission, checked against the caller's restaurantRole the same way
 * order-service's `rbac({resource, action})` does. That permission was
 * never seeded here, so no restaurant_user (owner/branch_manager/staff)
 * could ever pass the check — only `system_admin` could, since it bypasses
 * the permission catalog entirely (see analytics-service's Require()).
 *
 * This adds the missing permission and grants it to `owner` and
 * `branch_manager` — the roles that actually run a restaurant's
 * operations day to day — deliberately NOT `staff`, matching the same
 * "staff doesn't get this one" precedent as 20260901000001's
 * `orders:reject` grant.
 *
 * `owner`'s "every permission" grant in 20260327014716_seed_rbac_data.ts
 * already ran and only covered permissions that existed at that time, so
 * it must be granted here explicitly too, not assumed to already apply.
 */
export async function up(knex: Knex): Promise<void> {
    await knex.raw(`
        INSERT INTO permissions (resource, action, created_at) VALUES
            ('analytics', 'read', NOW())
        ON CONFLICT (resource, action) DO NOTHING;
    `);

    await knex.raw(`
        INSERT INTO role_permissions (role_id, permission_id, created_at)
        SELECT r.id, p.id, NOW()
        FROM roles r, permissions p
        WHERE r.name IN ('owner', 'branch_manager')
          AND p.resource = 'analytics'
          AND p.action = 'read'
        ON CONFLICT DO NOTHING;
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`
        DELETE FROM role_permissions
        WHERE permission_id IN (
            SELECT id FROM permissions WHERE resource = 'analytics' AND action = 'read'
        );
        DELETE FROM permissions WHERE resource = 'analytics' AND action = 'read';
    `);
}
