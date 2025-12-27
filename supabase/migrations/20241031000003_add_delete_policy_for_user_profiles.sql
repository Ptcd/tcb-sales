-- Add DELETE policy for user_profiles
-- Admins can delete other members in their organization (but not themselves)
CREATE POLICY "Admins can delete members in their organization"
  ON user_profiles FOR DELETE
  USING (
    organization_id = get_user_organization_id() AND
    id != auth.uid() AND
    EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

