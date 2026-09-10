import {sqliteTable,text,integer} from 'drizzle-orm/sqlite-core';
export const workspaces=sqliteTable('workspaces',{id:text('id').primaryKey(),data:text('data').notNull(),revision:integer('revision').notNull().default(0)});
export const modelConnections=sqliteTable('model_connections',{id:text('id').primaryKey(),owner:text('owner').notNull(),name:text('name').notNull().default(''),kind:text('kind').notNull(),provider:text('provider').notNull(),model:text('model').notNull(),endpoint:text('endpoint'),keyCiphertext:text('key_ciphertext').notNull(),updatedAt:text('updated_at').notNull()});

export const modelSelections=sqliteTable('model_selections',{id:text('id').primaryKey(),owner:text('owner').notNull(),kind:text('kind').notNull(),connectionId:text('connection_id')});
