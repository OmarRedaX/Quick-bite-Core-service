import { db } from "../../../common/knex/knex";
import { CustomerAddress } from "../entity/customer-address.entity";

const CUSTOMER_ADDRESS_COLUMNS = [
    "id",
    "user_id",
    "label",
    "country",
    "city",
    "street",
    "building",
    "apartment_number",
    "type",
    "lat",
    "lng",
    "is_default",
    "created_at",
    "updated_at"
]

function toEntity (row: any) {
    return new CustomerAddress ({
        id: row.id,
        userId: row.user_id,
        label: row.label,
        country: row.country,
        city: row.city,
        street: row.street,
        building: row.building,
        apartmentNumber: row.apartment_number,
        type: row.type,
        lat: row.lat,
        lng: row.lng,
        isDefault: row.is_default,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    })
}

export async function createCustomerAddress ( customerAddress: Partial<CustomerAddress> ) {
    const [row] = await db('customer_addresses').insert({
        user_id: customerAddress.userId,
        label: customerAddress.label,
        country: customerAddress.country,
        city: customerAddress.city,
        street: customerAddress.street,
        building: customerAddress.building,
        apartment_number: customerAddress.apartmentNumber,
        type: customerAddress.type,
        lat: customerAddress.lat,
        lng: customerAddress.lng,
        is_default: customerAddress.isDefault,
        created_at: customerAddress.createdAt,
    }).returning(CUSTOMER_ADDRESS_COLUMNS);

    return toEntity(row);
}

export async function findCustomerAddress (id: string): Promise<CustomerAddress | undefined> {
    const row = await db('customer_addresses').where({ id })
    return row ? toEntity(row) : undefined
}