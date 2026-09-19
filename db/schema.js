import {sql} from 'drizzle-orm';
import {sqliteTable,text,integer,check} from 'drizzle-orm/sqlite-core';

// Matches migrations/0001_sharing.sql and the existing D1 compare-and-swap store.
export const sharingState=sqliteTable('sharing_state',{
  id:text('id').primaryKey(),
  revision:integer('revision').notNull(),
  body:text('body').notNull(),
},table=>[
  check('sharing_positive_revision',sql`${table.revision} > 0`),
  check('sharing_valid_json',sql`json_valid(${table.body})`),
]);
