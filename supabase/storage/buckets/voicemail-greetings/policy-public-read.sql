-- Public read, authenticated/service role write for voicemail greetings
begin;

-- Create bucket if not exists
insert into storage.buckets (id, name, public)
values ('voicemail-greetings', 'voicemail-greetings', true)
on conflict (id) do nothing;

-- Allow public read
create policy "Public read voicemail greetings"
on storage.objects
for select
to public
using (bucket_id = 'voicemail-greetings');

-- Allow authenticated and service role to insert/update/delete
create policy "Authenticated write voicemail greetings"
on storage.objects
for all
to authenticated
using (bucket_id = 'voicemail-greetings')
with check (bucket_id = 'voicemail-greetings');

create policy "Service role full access voicemail greetings"
on storage.objects
for all
to service_role
using (bucket_id = 'voicemail-greetings')
with check (bucket_id = 'voicemail-greetings');

commit;

