pragma foreign_keys = on;

create table if not exists projects (
  id text primary key,
  name text not null,
  local_path text not null,
  git_enabled integer not null default 0,
  git_remote text,
  active_task_id text,
  created_at text not null,
  updated_at text not null
);

create table if not exists stages (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  title text not null,
  description text not null default '',
  position integer not null,
  status text not null check(status in ('future', 'current', 'completed')),
  created_at text not null,
  updated_at text not null
);

create table if not exists tasks (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  stage_id text not null references stages(id) on delete cascade,
  title text not null,
  description text not null default '',
  status text not null check(status in ('todo', 'active', 'blocked', 'done')),
  priority text check(priority in ('low', 'normal', 'high')),
  due_date text,
  next_step text not null default '',
  position integer not null,
  created_at text not null,
  updated_at text not null
);

create table if not exists checklist_items (
  id text primary key,
  task_id text not null references tasks(id) on delete cascade,
  title text not null,
  completed integer not null default 0,
  position integer not null,
  created_at text not null,
  updated_at text not null
);

create table if not exists notes (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  task_id text references tasks(id) on delete set null,
  body text not null,
  created_at text not null
);

create table if not exists inbox_items (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  task_id text references tasks(id) on delete set null,
  body text not null,
  kind text not null check(kind in ('untyped', 'bug', 'idea', 'question', 'note', 'task_candidate')),
  status text not null check(status in ('open', 'attached', 'converted', 'kept_as_note', 'deleted')),
  created_at text not null,
  updated_at text not null
);

create table if not exists work_entries (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  task_id text references tasks(id) on delete set null,
  source text not null check(source in ('focus', 'manual', 'status_change', 'note', 'inbox', 'git_recovery')),
  started_at text,
  ended_at text,
  duration_seconds integer,
  done text not null default '',
  remains text not null default '',
  next_step text not null default '',
  created_at text not null
);

create table if not exists commits (
  project_id text not null references projects(id) on delete cascade,
  sha text not null,
  branch text not null,
  message text not null,
  author_name text not null default '',
  committed_at text not null,
  changed_files_json text not null,
  primary key (project_id, sha)
);

create table if not exists commit_task_links (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  task_id text not null references tasks(id) on delete cascade,
  commit_sha text not null,
  link_mode text not null check(link_mode in ('focus_interval', 'active_task', 'manual')),
  created_at text not null,
  unique(project_id, task_id, commit_sha),
  foreign key (project_id, commit_sha) references commits(project_id, sha) on delete cascade
);

create table if not exists resume_briefs (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  task_id text references tasks(id) on delete set null,
  stage_id text references stages(id) on delete set null,
  latest_note text not null default '',
  next_step text not null default '',
  facts_json text not null,
  generated_at text not null
);

create table if not exists entitlements (
  id text primary key,
  license_state text not null check(license_state in ('free_beta', 'founder', 'trial', 'expired')),
  email text,
  license_key_hint text,
  offline_grace_ends_at text,
  updated_at text not null
);
