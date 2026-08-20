-- ==============================================================================
-- TRACE-AI: DATABASE MIGRATION SCHEMA (PostgreSQL / Supabase)
-- ==============================================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Investigations Table
create table if not exists public.investigations (
    id uuid primary key default uuid_generate_v4(),
    case_number varchar(100) unique,
    title varchar(255) not null,
    description text,
    status varchar(50) default 'active' check (status in ('active', 'completed', 'archived')),
    risk_level varchar(50) default 'low' check (risk_level in ('low', 'medium', 'high', 'critical')),
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_investigations_created_at on public.investigations(created_at desc);

-- 2. Media Assets Table
create table if not exists public.media_assets (
    id uuid primary key default uuid_generate_v4(),
    investigation_id uuid not null references public.investigations(id) on delete cascade,
    filename varchar(255) not null,
    mime_type varchar(100) not null,
    storage_path text not null,
    sha256 varchar(64) not null,
    perceptual_hash varchar(64),
    size_bytes bigint not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_media_assets_investigation_id on public.media_assets(investigation_id);
create index if not exists idx_media_assets_sha256 on public.media_assets(sha256);

-- 3. Analysis Runs Table
create table if not exists public.analysis_runs (
    id uuid primary key default uuid_generate_v4(),
    investigation_id uuid not null references public.investigations(id) on delete cascade,
    media_asset_id uuid not null references public.media_assets(id) on delete cascade,
    status varchar(50) default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
    started_at timestamp with time zone default timezone('utc'::text, now()) not null,
    completed_at timestamp with time zone,
    summary text
);

create index if not exists idx_analysis_runs_media_asset_id on public.analysis_runs(media_asset_id);

-- 4. Forensic Findings Table
create table if not exists public.forensic_findings (
    id uuid primary key default uuid_generate_v4(),
    analysis_run_id uuid not null references public.analysis_runs(id) on delete cascade,
    category varchar(100) not null,
    evidence_level varchar(50) not null check (evidence_level in ('OBSERVED', 'INFERRED', 'CONCLUSION')),
    finding text not null,
    severity varchar(50) default 'info' check (severity in ('info', 'low', 'medium', 'high', 'critical')),
    confidence varchar(50) default 'medium' check (confidence in ('low', 'medium', 'high', 'conclusive')),
    method varchar(100),
    model varchar(100),
    evidence text, -- JSON string representation
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_forensic_findings_run_id on public.forensic_findings(analysis_run_id);

-- 5. C2PA Records Table
create table if not exists public.c2pa_records (
    id uuid primary key default uuid_generate_v4(),
    media_asset_id uuid not null references public.media_assets(id) on delete cascade,
    status varchar(50) not null check (status in ('VERIFIED', 'PRESENT_BUT_UNVERIFIED', 'NOT_PRESENT', 'INVALID', 'UNAVAILABLE')),
    issuer varchar(255),
    claim text,
    verification_result text,
    raw_summary text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_c2pa_records_media_id on public.c2pa_records(media_asset_id);

-- 6. Source Candidates Table
create table if not exists public.source_candidates (
    id uuid primary key default uuid_generate_v4(),
    investigation_id uuid not null references public.investigations(id) on delete cascade,
    url text not null,
    domain varchar(255) not null,
    title varchar(255),
    platform varchar(100) default 'web',
    publication_time timestamp with time zone,
    discovered_time timestamp with time zone default timezone('utc'::text, now()) not null,
    discovery_method varchar(100) not null,
    similarity_score double precision default 1.0,
    confidence varchar(50) default 'medium',
    evidence text
);

create index if not exists idx_source_candidates_investigation_id on public.source_candidates(investigation_id);

-- 7. Propagation Nodes Table
create table if not exists public.propagation_nodes (
    id uuid primary key default uuid_generate_v4(),
    investigation_id uuid not null references public.investigations(id) on delete cascade,
    node_type varchar(50) not null check (node_type in ('source', 'repost', 'modification', 'amplifier')),
    label varchar(255) not null,
    url text,
    platform varchar(100) not null,
    timestamp timestamp with time zone,
    media_hash varchar(64),
    confidence varchar(50) default 'high'
);

create index if not exists idx_propagation_nodes_investigation_id on public.propagation_nodes(investigation_id);

-- 8. Propagation Edges Table
create table if not exists public.propagation_edges (
    id uuid primary key default uuid_generate_v4(),
    investigation_id uuid not null references public.investigations(id) on delete cascade,
    source_node_id uuid not null,
    target_node_id uuid not null,
    relationship varchar(100) not null,
    confidence varchar(50) default 'medium',
    evidence text
);

create index if not exists idx_propagation_edges_investigation_id on public.propagation_edges(investigation_id);

-- 9. Narrative Versions Table
create table if not exists public.narrative_versions (
    id uuid primary key default uuid_generate_v4(),
    investigation_id uuid not null references public.investigations(id) on delete cascade,
    node_id varchar(100),
    text text not null,
    summary text,
    change_type varchar(100) default 'observed',
    confidence varchar(50) default 'medium'
);

create index if not exists idx_narrative_versions_investigation_id on public.narrative_versions(investigation_id);

-- 10. Reports Table
create table if not exists public.reports (
    id uuid primary key default uuid_generate_v4(),
    investigation_id uuid not null references public.investigations(id) on delete cascade,
    report_path text not null,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_reports_investigation_id on public.reports(investigation_id);

-- 11. Audit Events Table
create table if not exists public.audit_events (
    id uuid primary key default uuid_generate_v4(),
    investigation_id uuid references public.investigations(id) on delete cascade,
    user_id varchar(255) default 'system',
    event_type varchar(100) not null,
    description text not null,
    timestamp timestamp with time zone default timezone('utc'::text, now()) not null,
    metadata_json text
);

create index if not exists idx_audit_events_investigation_id on public.audit_events(investigation_id);

-- ==============================================================================
-- STORAGE INTEGRATION (Supabase Storage Buckets)
-- ==============================================================================

-- Create Storage bucket for private media evidence
insert into storage.buckets (id, name, public) 
values ('media', 'media', false)
on conflict (id) do nothing;

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

-- Enable RLS on investigations and logs
alter table public.investigations enable row level security;
alter table public.media_assets enable row level security;
alter table public.analysis_runs enable row level security;
alter table public.forensic_findings enable row level security;
alter table public.c2pa_records enable row level security;
alter table public.source_candidates enable row level security;
alter table public.propagation_nodes enable row level security;
alter table public.propagation_edges enable row level security;
alter table public.narrative_versions enable row level security;
alter table public.reports enable row level security;
alter table public.audit_events enable row level security;

-- Setup policy permissions (For hackathon, authenticated user has full access)
create policy "Allow authenticated CRUD on investigations" 
on public.investigations for all to authenticated using (true);

create policy "Allow authenticated CRUD on media_assets" 
on public.media_assets for all to authenticated using (true);

create policy "Allow authenticated CRUD on forensic_findings" 
on public.forensic_findings for all to authenticated using (true);

create policy "Allow authenticated CRUD on source_candidates" 
on public.source_candidates for all to authenticated using (true);

-- Storage bucket access rules
create policy "Allow authenticated reads on media bucket"
on storage.objects for select to authenticated using (bucket_id = 'media');

create policy "Allow authenticated inserts on media bucket"
on storage.objects for insert to authenticated with check (bucket_id = 'media');
