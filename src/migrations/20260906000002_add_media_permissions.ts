import type {Knex} from "knex";

/**
 * Permissions for the media module (presigned S3 uploads for product images
 * and restaurant logos). `system_admin` bypasses the catalog entirely in
 * rbac(), so only the restaurant roles need grants here.
 *
 * `owner` gets all three. `branch_manager` gets create/read because it already
 * holds core:product:create/update and so needs to attach images to the
 * products it manages — but not delete, matching the same "destructive actions
 * stay with the owner" line drawn for core:member:delete in the seed data.
 * `staff` is read-only on products and gets nothing here.
 *
 * `owner`'s "every permission" grant in 20260327014716_seed_rbac_data.ts
 * already ran and only covered permissions that existed then, so it must be
 * granted explicitly rather than assumed.
 */
export async function up(knex: Knex): Promise<void> {
    await knex.raw(`
        INSERT INTO permissions (resource, action, created_at) VALUES
            ('core:media', 'create', NOW()),
            ('core:media', 'read', NOW()),
            ('core:media', 'delete', NOW())
        ON CONFLICT (resource, action) DO NOTHING;
    `);

    await knex.raw(`
        INSERT INTO role_permissions (role_id, permission_id, created_at)
        SELECT r.id, p.id, NOW()
        FROM roles r, permissions p
        WHERE r.name = 'owner'
          AND p.resource = 'core:media'
        ON CONFLICT DO NOTHING;
    `);

    await knex.raw(`
        INSERT INTO role_permissions (role_id, permission_id, created_at)
        SELECT r.id, p.id, NOW()
        FROM roles r, permissions p
        WHERE r.name = 'branch_manager'
          AND p.resource = 'core:media'
          AND p.action IN ('create', 'read')
        ON CONFLICT DO NOTHING;
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`
        DELETE FROM role_permissions
        WHERE permission_id IN (SELECT id FROM permissions WHERE resource = 'core:media');
        DELETE FROM permissions WHERE resource = 'core:media';
    `);
}
