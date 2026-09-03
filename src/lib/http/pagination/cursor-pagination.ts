import {Knex} from "knex";

export interface PaginationParams {
    cursor?: string;
    limit: number;
    sortBy: string;
    sortOrder: 'asc' | 'desc';
}

export interface FilterParams {
    field: string;
    operator: 'eq' | 'gt' | 'lt' | 'lte' | 'gte' | 'in' | 'like';
    value: string | string[];
}

export interface PaginationMeta {
    nextCursor: string | null;
    hasMore: boolean;
    count: number;
}

function camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?$/;

// createdAt: 2025-10-10 desc 10
// select * from xxxx where xxx = yyy
// createdAt  < 2025-10-10 order by created_at desc limit 10

export function applyCursorPagination<T>( query: Knex.QueryBuilder, params: PaginationParams ): Knex.QueryBuilder {
    if(!params.sortBy) {
        return query;
    }
    const dbColumn = camelToSnake(params.sortBy);
    if(params.cursor) {
        const op = params.sortOrder === 'asc' ? '>' : '<'
        // buildPaginationResult serializes a Date cursor with .toISOString() (a
        // 'Z'-suffixed UTC string). Comparing that string against a `timestamp`
        // (no tz) column makes Postgres cast it through the session TimeZone
        // first -- when that isn't UTC (this app runs with 'Africa/Cairo'), the
        // cast silently shifts the value and corrupts the comparison. A JS Date
        // is serialized by node-pg the same way the original insert was, so it
        // round-trips correctly regardless of session timezone.
        const cursorValue: string | Date = ISO_DATETIME_RE.test(params.cursor) ? new Date(params.cursor) : params.cursor;
        query = query.where(dbColumn, op, cursorValue)
    }
    return query.orderBy(dbColumn, params.sortOrder).limit(params.limit + 1);
}

export function applyFilters<T>( query: Knex.QueryBuilder, filters: FilterParams[] ): Knex.QueryBuilder {
    for (const filter of filters) {
       switch (filter.operator) {
           case 'eq': query.where(filter.field, filter.value); break;
           case 'gt': query.where(filter.field, '>', filter.value);break;
           case 'lt': query.where(filter.field, '<', filter.value);break;
           case 'lte': query.where(filter.field, '<=', filter.value);break;
           case 'gte': query.where(filter.field, '>=', filter.value);break;
           case 'like': query.whereLike(filter.field, `%${filter.value}%`);break; // LIKE bdu -> abdullah
           case 'in': query.whereIn(filter.field, Array.isArray(filter.value) ? filter.value : [filter.value]);break;
       }
    }
    return query;
}

export function buildPaginationResult<T>(rows: T[], limit: number, sortBy: string): {data: T[], meta: PaginationMeta} {
    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    let nextCursor = null

    if(data.length > 0) {
          const lastItem = data[data.length - 1] as any;
          const cursorValue = lastItem[sortBy];
          // Date must be serialized as ISO (not the default `String(Date)` locale
          // format, e.g. "Wed Aug 25 2026 ... GMT+0300 (...)") — Postgres can't
          // parse that back as a timestamp on the next page's WHERE clause.
          nextCursor = hasMore && lastItem
              ? (cursorValue instanceof Date ? cursorValue.toISOString() : String(cursorValue))
              : null;
    }
    return {
        data,
        meta:{
            nextCursor: nextCursor,
            hasMore: hasMore,
            count: data.length,
        }
    }
}
