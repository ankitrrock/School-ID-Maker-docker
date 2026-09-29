-- Create a PRIVATE bucket for organization logos and student photos.
insert into storage.buckets (id, name, public)
values ('id-card-assets', 'id-card-assets', false)
on conflict (id) do update set public=false;

-- The Express server uses the Supabase service-role key server-side.
-- Do NOT put SUPABASE_SERVICE_ROLE_KEY in frontend JavaScript.
-- Keep this bucket private and use signed URLs for protected student assets.
