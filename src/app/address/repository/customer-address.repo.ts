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

export async function findCustomerAddress (id: number): Promise<CustomerAddress | undefined> {
    const [row] = await db('customer_addresses').where("user_id", id).returning(CUSTOMER_ADDRESS_COLUMNS);
    return row ? toEntity(row) : undefined
}

export async function updateCustomerAddress (id: number, userId: number, data: Partial<CustomerAddress>) {
    const row = await db('customer_addresses').where("id", id).andWhere("user_id", userId).update({
        label: data.label,
        country: data.country,
        city: data.city,
        street: data.street,
        building: data.building,
        apartment_number: data.apartmentNumber,
        type: data.type,
        lat: data.lat,
        lng: data.lng,
        is_default: data.isDefault,
        updated_at: new Date()
    }).returning(CUSTOMER_ADDRESS_COLUMNS);
    
    return row ? toEntity(row[0]) : undefined
}

export async function deleteCustomerAddress(id: number, userId: number) {
    await db('customer_addresses').where("id", id).andWhere("user_id", userId).del()
}