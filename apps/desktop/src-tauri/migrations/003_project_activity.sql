-- Keep the project picker ordered by actual local activity, not only by project creation.
-- All timestamps remain local SQLite metadata; no project content leaves this database.

create trigger if not exists touch_project_after_plan_insert
after insert on plans
begin
  update projects set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = new.project_id;
end;

create trigger if not exists touch_project_after_plan_update
after update on plans
begin
  update projects set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = new.project_id;
end;

create trigger if not exists touch_project_after_plan_delete
after delete on plans
begin
  update projects set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = old.project_id;
end;

create trigger if not exists touch_project_after_stage_insert
after insert on stages
begin
  update projects set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = new.project_id;
end;

create trigger if not exists touch_project_after_stage_update
after update on stages
begin
  update projects set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = new.project_id;
end;

create trigger if not exists touch_project_after_stage_delete
after delete on stages
begin
  update projects set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = old.project_id;
end;

create trigger if not exists touch_project_after_task_insert
after insert on tasks
begin
  update projects set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = new.project_id;
end;

create trigger if not exists touch_project_after_task_update
after update on tasks
begin
  update projects set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = new.project_id;
end;

create trigger if not exists touch_project_after_task_delete
after delete on tasks
begin
  update projects set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = old.project_id;
end;

create trigger if not exists touch_project_after_checklist_insert
after insert on checklist_items
begin
  update projects
  set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  where id = (select project_id from tasks where id = new.task_id);
end;

create trigger if not exists touch_project_after_checklist_update
after update on checklist_items
begin
  update projects
  set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  where id = (select project_id from tasks where id = new.task_id);
end;

create trigger if not exists touch_project_after_checklist_delete
after delete on checklist_items
begin
  update projects
  set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  where id = (select project_id from tasks where id = old.task_id);
end;

create trigger if not exists touch_project_after_note_insert
after insert on notes
begin
  update projects set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = new.project_id;
end;

create trigger if not exists touch_project_after_note_update
after update on notes
begin
  update projects set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = new.project_id;
end;

create trigger if not exists touch_project_after_note_delete
after delete on notes
begin
  update projects set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = old.project_id;
end;

create trigger if not exists touch_project_after_inbox_insert
after insert on inbox_items
begin
  update projects set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = new.project_id;
end;

create trigger if not exists touch_project_after_inbox_update
after update on inbox_items
begin
  update projects set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = new.project_id;
end;

create trigger if not exists touch_project_after_inbox_delete
after delete on inbox_items
begin
  update projects set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = old.project_id;
end;

create trigger if not exists touch_project_after_work_entry_insert
after insert on work_entries
begin
  update projects set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = new.project_id;
end;

create trigger if not exists touch_project_after_work_entry_update
after update on work_entries
begin
  update projects set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = new.project_id;
end;

create trigger if not exists touch_project_after_work_entry_delete
after delete on work_entries
begin
  update projects set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = old.project_id;
end;

create trigger if not exists touch_project_after_commit_insert
after insert on commits
begin
  update projects set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = new.project_id;
end;

create trigger if not exists touch_project_after_commit_update
after update on commits
begin
  update projects set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = new.project_id;
end;

create trigger if not exists touch_project_after_commit_delete
after delete on commits
begin
  update projects set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = old.project_id;
end;

create trigger if not exists touch_project_after_commit_link_insert
after insert on commit_task_links
begin
  update projects set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = new.project_id;
end;

create trigger if not exists touch_project_after_commit_link_update
after update on commit_task_links
begin
  update projects set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = new.project_id;
end;

create trigger if not exists touch_project_after_commit_link_delete
after delete on commit_task_links
begin
  update projects set updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = old.project_id;
end;
