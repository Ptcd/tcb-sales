import { createClient } from '@/lib/supabase/server';

/**
 * Get the current user and their organization ID
 * Returns null if not authenticated or profile not found
 */
export async function getUserWithOrganization() {
  const supabase = await createClient();
  
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  
  if (userError || !user) {
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from('user_profiles')
    .select('organization_id, role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile?.organization_id) {
    return null;
  }

  return {
    user,
    organizationId: profile.organization_id,
    role: profile.role as 'admin' | 'member'
  };
}

