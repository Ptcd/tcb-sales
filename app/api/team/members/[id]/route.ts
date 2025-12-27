import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';

// DELETE /api/team/members/[id] - Remove team member
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const supabase = await createClient();
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Prevent self-removal
    if (user.id === params.id) {
      return NextResponse.json(
        { error: 'You cannot remove yourself from the team' },
        { status: 400 }
      );
    }

    // Get current user's profile
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('organization_id, role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'User profile not found' },
        { status: 404 }
      );
    }

    // Check if current user is admin
    if (profile.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only admins can remove team members' },
        { status: 403 }
      );
    }

    // Get member to remove
    const { data: memberToRemove, error: memberError } = await supabase
      .from('user_profiles')
      .select('id, organization_id, role')
      .eq('id', params.id)
      .single();

    if (memberError || !memberToRemove) {
      return NextResponse.json(
        { error: 'Member not found' },
        { status: 404 }
      );
    }

    // Check if member is in the same organization
    if (memberToRemove.organization_id !== profile.organization_id) {
      return NextResponse.json(
        { error: 'Member not in your organization' },
        { status: 403 }
      );
    }

    // Check if trying to remove the last admin
    if (memberToRemove.role === 'admin') {
      const { data: admins, error: adminsError } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('organization_id', profile.organization_id)
        .eq('role', 'admin');

      if (adminsError || !admins || admins.length <= 1) {
        return NextResponse.json(
          { error: 'Cannot remove the last admin' },
          { status: 400 }
        );
      }
    }

    // Delete user profile using database function (bypasses RLS)
    const { data: deleteResult, error: deleteError } = await supabase
      .rpc('delete_team_member', { member_id_to_delete: params.id });

    console.log('Delete operation result:', {
      error: deleteError,
      data: deleteResult,
      deletedRows: deleteResult?.length || 0
    });

    if (deleteError) {
      console.error('Error removing team member:', deleteError);
      console.error('Delete error details:', JSON.stringify(deleteError, null, 2));
      
      // Check if it's a permission/validation error from the function
      if (deleteError.message?.includes('Only admins') || deleteError.message?.includes('not in your organization')) {
        return NextResponse.json(
          { error: deleteError.message },
          { status: 403 }
        );
      }
      
      if (deleteError.message?.includes('not found')) {
        return NextResponse.json(
          { error: deleteError.message },
          { status: 404 }
        );
      }
      
      // Fallback to direct delete if function doesn't exist (for backwards compatibility)
      console.warn('Function delete_team_member not found, trying direct delete');
      const { error: directDeleteError, data: directDeleteData } = await supabase
        .from('user_profiles')
        .delete()
        .eq('id', params.id)
        .select();
      
      if (directDeleteError) {
        return NextResponse.json(
          { error: directDeleteError.message || 'Failed to remove team member' },
          { status: 500 }
        );
      }
      
      if (!directDeleteData || directDeleteData.length === 0) {
        return NextResponse.json(
          { error: 'Member not found or deletion was blocked' },
          { status: 404 }
        );
      }
      
      console.log('✅ Successfully deleted member via direct delete:', directDeleteData[0]);
    } else if (deleteResult && deleteResult.length > 0) {
      console.log('✅ Successfully deleted member via function:', deleteResult[0]);
    } else {
      return NextResponse.json(
        { error: 'Member not found or already removed' },
        { status: 404 }
      );
    }

    // Optionally, delete the user from auth.users
    // This requires admin privileges
    try {
      await supabase.auth.admin.deleteUser(params.id);
    } catch (authError) {
      console.error('Error deleting user from auth:', authError);
      // Continue even if this fails
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error in DELETE /api/team/members/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH /api/team/members/[id] - Update team member (role or name)
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const supabase = await createClient();
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get current user's profile
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('organization_id, role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'User profile not found' },
        { status: 404 }
      );
    }

    // Check if current user is admin
    if (profile.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only admins can update team members' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { role, full_name, hourly_rate_usd } = body;

    // Get member to update
    const { data: memberToUpdate, error: memberError } = await supabase
      .from('user_profiles')
      .select('id, organization_id, role')
      .eq('id', params.id)
      .single();

    if (memberError || !memberToUpdate) {
      return NextResponse.json(
        { error: 'Member not found' },
        { status: 404 }
      );
    }

    // Check if member is in the same organization
    if (memberToUpdate.organization_id !== profile.organization_id) {
      return NextResponse.json(
        { error: 'Member not in your organization' },
        { status: 403 }
      );
    }

    // Handle name update using database function (bypasses RLS)
    if (full_name !== undefined) {
      const { data: nameResult, error: nameUpdateError } = await supabase
        .rpc('update_team_member_name', {
          member_id_to_update: params.id,
          new_name: full_name || ''
        });

      if (nameUpdateError) {
        console.error('Error updating member name:', nameUpdateError);
        return NextResponse.json(
          { error: nameUpdateError.message || 'Failed to update name' },
          { status: 500 }
        );
      }

      if (!nameResult || nameResult.length === 0 || !nameResult[0].success) {
        const errorMessage = nameResult?.[0]?.message || 'Failed to update name';
        console.error('Name update failed:', errorMessage);
        return NextResponse.json(
          { error: errorMessage },
          { status: 400 }
        );
      }

      console.log('✅ Name updated successfully for member:', params.id);
      
      // If only updating name (no role change and no hourly rate), return early
      if (role === undefined && hourly_rate_usd === undefined) {
        return NextResponse.json({ 
          success: true,
          message: nameResult[0].message
        });
      }
    }

    // Handle hourly_rate_usd update (if provided) - use service role to bypass RLS
    if (hourly_rate_usd !== undefined) {
      const serviceSupabase = createServiceRoleClient();
      const rateValue = hourly_rate_usd === null || hourly_rate_usd === '' ? null : parseFloat(String(hourly_rate_usd));
      
      const { data: updateData, error: rateUpdateError } = await serviceSupabase
        .from('user_profiles')
        .update({ hourly_rate_usd: rateValue })
        .eq('id', params.id)
        .select('hourly_rate_usd')
        .single();

      if (rateUpdateError) {
        console.error('Error updating hourly rate:', rateUpdateError);
        return NextResponse.json(
          { error: rateUpdateError.message || 'Failed to update hourly rate' },
          { status: 500 }
        );
      }

      console.log('✅ Hourly rate updated successfully for member:', params.id, 'New rate:', updateData?.hourly_rate_usd);
      
      // If only updating hourly rate (no role change), return early
      if (role === undefined) {
        return NextResponse.json({ 
          success: true,
          message: 'Hourly rate updated successfully',
          hourly_rate_usd: updateData?.hourly_rate_usd
        });
      }
    }

    // Handle role update (if provided)
    if (role !== undefined) {
      if (!['admin', 'member'].includes(role)) {
        return NextResponse.json(
          { error: 'Invalid role' },
          { status: 400 }
        );
      }

      // If demoting from admin, check if they're the last admin
      if (memberToUpdate.role === 'admin' && role === 'member') {
        const { data: admins, error: adminsError } = await supabase
          .from('user_profiles')
          .select('id')
          .eq('organization_id', profile.organization_id)
          .eq('role', 'admin');

        if (adminsError || !admins || admins.length <= 1) {
          return NextResponse.json(
            { error: 'Cannot demote the last admin' },
            { status: 400 }
          );
        }
      }

      // Update role using database function (bypasses RLS)
      const { data: updateResult, error: updateError } = await supabase
        .rpc('update_team_member_role', { 
          member_id_to_update: params.id,
          new_role: role
        });

      if (updateError) {
        console.error('Error updating member role:', updateError);
        return NextResponse.json(
          { error: updateError.message || 'Failed to update member role' },
          { status: 500 }
        );
      }

      if (!updateResult || updateResult.length === 0 || !updateResult[0].success) {
        const errorMessage = updateResult?.[0]?.message || 'Failed to update member role';
        console.error('Role update failed:', errorMessage);
        return NextResponse.json(
          { error: errorMessage },
          { status: 400 }
        );
      }

      console.log('✅ Role updated successfully:', updateResult[0].message);
    }

    return NextResponse.json({ 
      success: true,
      message: 'Member updated successfully'
    });

  } catch (error) {
    console.error('Error in PATCH /api/team/members/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

