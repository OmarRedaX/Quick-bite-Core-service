import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`
        CREATE TABLE media (
            id BIGSERIAL PRIMARY KEY,
            -- Owner of the file: the restaurant whose product/logo it is for,
            -- NOT the uploader (that is uploaded_by). Nullable because a system
            -- admin uploads a logo before POST /restaurants creates the row it
            -- would reference.
            restaurant_id BIGINT,
            uploaded_by BIGINT NOT NULL,
            storage_key TEXT NOT NULL UNIQUE,
            url TEXT NOT NULL,
            content_type TEXT NOT NULL,
            size_bytes BIGINT,
            status TEXT NOT NULL CHECK (status IN ('pending','ready','failed','deleted')) DEFAULT 'pending',
            created_at TIMESTAMP NOT NULL,
            updated_at TIMESTAMP NOT NULL,

            CONSTRAINT fk_media_restaurant_id FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE SET NULL,
            CONSTRAINT fk_media_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES users(id)
        );

        CREATE INDEX idx_media_restaurant_id ON media(restaurant_id);
        CREATE INDEX idx_media_uploaded_by ON media(uploaded_by);
        CREATE INDEX idx_media_status ON media(status);
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`DROP TABLE IF EXISTS media;`);
}
