import { pgTable, text, uuid, timestamp, integer, boolean, real, jsonb, uniqueIndex } from 'drizzle-orm/pg-core';

export const projects = pgTable('projects', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default('A little space for your next big idea.'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const files = pgTable('files', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  path: text('path').notNull(),
  content: text('content').notNull().default(''),
  language: text('language').notNull().default('plaintext'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, table => [uniqueIndex('files_project_path_idx').on(table.projectId, table.path)]);

export const settings = pgTable('settings', {
  id: text('id').primaryKey().default('local'),
  provider: text('provider').notNull().default('llama'),
  endpoint: text('endpoint').notNull().default('http://127.0.0.1:8080/v1'),
  apiKey: text('api_key').notNull().default(''),
  model: text('model').notNull().default(''),
  temperature: real('temperature').notNull().default(0.3),
  maxTokens: integer('max_tokens').notNull().default(4096),
  contextSize: integer('context_size').notNull().default(16384),
  systemPrompt: text('system_prompt').notNull().default('You are Forge, a thoughtful local coding assistant. Write correct, accessible, maintainable code. Explain your reasoning concisely. When using tools, make small, focused changes and verify your work.'),
  autoApprove: boolean('auto_approve').notNull().default(false),
});

export const conversations = pgTable('conversations', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  title: text('title').notNull().default('New conversation'),
  mode: text('mode').notNull().default('agent'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const messages = pgTable('messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  content: text('content').notNull().default(''),
  toolCalls: jsonb('tool_calls'),
  toolCallId: text('tool_call_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const executionRuns = pgTable('execution_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull(),
  language: text('language').notNull(),
  command: text('command'),
  stdout: text('stdout').notNull().default(''),
  stderr: text('stderr').notNull().default(''),
  exitCode: integer('exit_code'),
  duration: integer('duration').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
