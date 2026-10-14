import { pgEnum } from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['caller', 'manager', 'admin']);
export const checklistTypeEnum = pgEnum('checklist_type', ['task', 'callback']);
export const checklistStatusEnum = pgEnum('checklist_status', ['not_started', 'in_progress', 'submitted']);
export const answerValueEnum = pgEnum('answer_value', ['Y', 'N', 'B']);
export const answerSourceEnum = pgEnum('answer_source', ['manual', 'auto_confirmed', 'auto_overridden']);
export const projectTypeEnum = pgEnum('project_type', ['HVAC', 'WATER HEATER', 'GENERATOR', 'OTHER']);
export const syncKindEnum = pgEnum('sync_kind', ['reconcile', 'backfill', 'webhook', 'manual', 'employees']);
export const syncStatusEnum = pgEnum('sync_status', ['running', 'ok', 'error']);
export const webhookStatusEnum = pgEnum('webhook_status', ['pending', 'processed', 'failed', 'skipped']);

export type Role = (typeof roleEnum.enumValues)[number];
export type ChecklistStatus = (typeof checklistStatusEnum.enumValues)[number];
export type AnswerSource = (typeof answerSourceEnum.enumValues)[number];
