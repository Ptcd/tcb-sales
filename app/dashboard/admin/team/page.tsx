"use client";

import { useState, useEffect } from "react";
import { UserPlus, Mail, Phone, User, Shield, Users, Trash2, RotateCw, X, Tag, Pencil, Rocket, Check } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import Input from "@/components/Input";
import Button from "@/components/Button";

interface UserProfile {
  id: string;
  full_name: string | null;
  email: string;
  role: "admin" | "member";
  phone_number: string | null;
  assigned_twilio_number: string | null;
  assigned_campaign_id: string | null;
  organization_id: string;
  is_activator: boolean | null;
  hourly_rate_usd: number | null;
}

interface TeamInvitation {
  id: string;
  email: string;
  role: "admin" | "member";
  status: "pending" | "accepted" | "expired";
  invited_by: string;
  invitedByName?: string;
  expires_at: string;
  created_at: string;
}

interface TwilioNumber {
  sid: string;
  phoneNumber: string;
  friendlyName: string;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
}

interface UserCampaigns {
  [userId: string]: Campaign[];
}

export default function TeamManagementPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [resendingInviteId, setResendingInviteId] = useState<string | null>(null);
  const [cancellingInviteId, setCancellingInviteId] = useState<string | null>(null);
const [twilioNumbers, setTwilioNumbers] = useState<TwilioNumber[]>([]);
const [phoneModalUserId, setPhoneModalUserId] = useState<string | null>(null);
const [isAssigningPhone, setIsAssigningPhone] = useState(false);
const [selectedPhoneNumber, setSelectedPhoneNumber] = useState<string>("");
const [selectedPhoneCampaignId, setSelectedPhoneCampaignId] = useState<string>("");
const [campaigns, setCampaigns] = useState<Campaign[]>([]);
const [userCampaigns, setUserCampaigns] = useState<UserCampaigns>({});
const [campaignModalUserId, setCampaignModalUserId] = useState<string | null>(null);
const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>([]);
const [isUpdatingCampaigns, setIsUpdatingCampaigns] = useState(false);
const [editNameUserId, setEditNameUserId] = useState<string | null>(null);
const [editNameValue, setEditNameValue] = useState("");
const [isUpdatingName, setIsUpdatingName] = useState(false);
const [editRateUserId, setEditRateUserId] = useState<string | null>(null);
const [editRateValue, setEditRateValue] = useState("");
const [isUpdatingRate, setIsUpdatingRate] = useState(false);

// Reassign modal state
const [reassignModalUserId, setReassignModalUserId] = useState<string | null>(null);
const [reassignModalUserName, setReassignModalUserName] = useState<string>("");
const [reassignToUserId, setReassignToUserId] = useState<string>("");
const [isReassigning, setIsReassigning] = useState(false);

// Remove user modal state
const [removeModalUserId, setRemoveModalUserId] = useState<string | null>(null);
const [removeModalUserName, setRemoveModalUserName] = useState<string>("");
const [removeModalUserEmail, setRemoveModalUserEmail] = useState<string>("");
const [removeReassignToUserId, setRemoveReassignToUserId] = useState<string>("");
const [isRemovingUser, setIsRemovingUser] = useState(false);
const [updatingActivatorId, setUpdatingActivatorId] = useState<string | null>(null);

  useEffect(() => {
    fetchTeamData();
  }, []);

useEffect(() => {
  if (!selectedPhoneNumber && twilioNumbers.length > 0) {
    setSelectedPhoneNumber(twilioNumbers[0].phoneNumber);
  }
}, [twilioNumbers, selectedPhoneNumber]);

  const fetchTeamData = async () => {
    setIsLoading(true);
    try {
      // Fetch users
      const usersResponse = await fetch("/api/team/users");
      const usersData = await usersResponse.json();

      // Fetch all invitations (we'll filter by status on frontend)
      const invitesResponse = await fetch("/api/team/invitations");
      const invitesData = await invitesResponse.json();

      // Fetch Twilio numbers for assignment
      const numbersResponse = await fetch("/api/twilio/numbers");
      const numbersData = await numbersResponse.json();

      // Fetch campaigns
      const campaignsResponse = await fetch("/api/campaigns");
      const campaignsData = await campaignsResponse.json();

      if (usersResponse.ok) {
        setUsers(usersData.users || []);
        
        // Fetch campaigns for each user
        const campaignsMap: UserCampaigns = {};
        for (const user of usersData.users || []) {
          const userCampaignsResponse = await fetch(`/api/team/users/${user.id}/campaigns`);
          if (userCampaignsResponse.ok) {
            const userCampaignsData = await userCampaignsResponse.json();
            campaignsMap[user.id] = userCampaignsData.campaigns || [];
          }
        }
        setUserCampaigns(campaignsMap);
      }

      if (campaignsResponse.ok) {
        setCampaigns(campaignsData.campaigns || []);
      }

      if (invitesResponse.ok) {
        const fetchedInvitations = invitesData.invitations || [];
        console.log(`[Team Page] Fetched ${fetchedInvitations.length} invitations:`, fetchedInvitations);
        setInvitations(fetchedInvitations);
      } else {
        console.error("[Team Page] Failed to fetch invitations:", invitesData);
        toast.error("Failed to load invitations");
        setInvitations([]);
      }

      if (numbersResponse.ok && numbersData.numbers) {
        setTwilioNumbers(numbersData.numbers);
      }
    } catch (error) {
      console.error("Error fetching team data:", error);
      toast.error("Failed to load team data");
      setInvitations([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInviteUser = async () => {
    if (!inviteEmail || !inviteEmail.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }

    try {
      const response = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to send invitation");
      }

      toast.success(`Invitation sent to ${inviteEmail}`);
      setShowInviteModal(false);
      setInviteEmail("");
      setInviteRole("member");
      fetchTeamData();
    } catch (error: any) {
      console.error("Error inviting user:", error);
      toast.error(error.message || "Failed to send invitation");
    }
  };

  const openReassignModal = (userId: string, userName: string) => {
    setReassignModalUserId(userId);
    setReassignModalUserName(userName);
    setReassignToUserId("");
  };

  const closeReassignModal = () => {
    setReassignModalUserId(null);
    setReassignModalUserName("");
    setReassignToUserId("");
    setIsReassigning(false);
  };

  const handleReassignCRM = async () => {
    if (!reassignModalUserId || !reassignToUserId) {
      toast.error("Please select a user to reassign leads to");
      return;
    }

    setIsReassigning(true);
    try {
      const response = await fetch("/api/admin/reassign-rep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromUserId: reassignModalUserId,
          toUserId: reassignToUserId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to reassign leads");
      }

      toast.success(`Successfully reassigned ${data.reassignedCount} lead(s)`);
      closeReassignModal();
      fetchTeamData();
    } catch (error: any) {
      console.error("Error reassigning CRM:", error);
      toast.error(error.message || "Failed to reassign leads");
    } finally {
      setIsReassigning(false);
    }
  };

  // Remove User functions
  const openRemoveModal = (userId: string, userName: string, userEmail: string) => {
    setRemoveModalUserId(userId);
    setRemoveModalUserName(userName);
    setRemoveModalUserEmail(userEmail);
    setRemoveReassignToUserId("");
  };

  const closeRemoveModal = () => {
    setRemoveModalUserId(null);
    setRemoveModalUserName("");
    setRemoveModalUserEmail("");
    setRemoveReassignToUserId("");
    setIsRemovingUser(false);
  };

  const handleRemoveUser = async () => {
    if (!removeModalUserId) return;

    if (!removeReassignToUserId) {
      toast.error("Please select a user to receive their leads");
      return;
    }

    setIsRemovingUser(true);
    try {
      const response = await fetch("/api/admin/remove-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userIdToRemove: removeModalUserId,
          reassignToUserId: removeReassignToUserId,
          deleteFromAuth: true, // Permanently delete from Supabase Auth
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to remove user");
      }

      toast.success(
        `${data.user_removed.name || data.user_removed.email} has been permanently removed. ${data.leads_reassigned} lead(s) were reassigned.`
      );
      closeRemoveModal();
      fetchTeamData();
    } catch (error: any) {
      console.error("Error removing user:", error);
      toast.error(error.message || "Failed to remove user");
    } finally {
      setIsRemovingUser(false);
    }
  };

  const handleToggleActivator = async (userId: string, currentValue: boolean) => {
    setUpdatingActivatorId(userId);
    try {
      const response = await fetch(`/api/team/members/${userId}/activator`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_activator: !currentValue }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update");
      }
      toast.success(!currentValue ? "Activator assigned" : "Activator removed");
      fetchTeamData();
    } catch (error: any) {
      toast.error(error.message || "Failed to update activator");
    } finally {
      setUpdatingActivatorId(null);
    }
  };

  const handleResendInvite = async (invitationId: string, email: string) => {
    setResendingInviteId(invitationId);
    try {
      const response = await fetch(`/api/team/invitations/${invitationId}`, {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to resend invitation");
      }

      toast.success(`Invitation resent to ${email}`);
      // Refresh invitations to get updated expiration date
      fetchTeamData();
    } catch (error: any) {
      console.error("Error resending invitation:", error);
      toast.error(error.message || "Failed to resend invitation");
    } finally {
      setResendingInviteId(null);
    }
  };

  const handleCancelInvite = async (invitationId: string, email: string) => {
    if (!confirm(`Cancel invitation for ${email}? They will need to be invited again to join.`)) {
      return;
    }

    setCancellingInviteId(invitationId);
    try {
      const response = await fetch(`/api/team/invitations/${invitationId}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to cancel invitation");
      }

      toast.success(`Invitation cancelled for ${email}`);
      // Remove from state immediately
      setInvitations(invitations.filter((inv) => inv.id !== invitationId));
    } catch (error: any) {
      console.error("Error cancelling invitation:", error);
      toast.error(error.message || "Failed to cancel invitation");
    } finally {
      setCancellingInviteId(null);
    }
  };

  const openAssignPhoneModal = (userId: string) => {
    setPhoneModalUserId(userId);
    setIsAssigningPhone(false);
    if (twilioNumbers.length > 0) {
      setSelectedPhoneNumber(twilioNumbers[0].phoneNumber);
    } else {
      setSelectedPhoneNumber("");
    }
    // Set current user's campaign if they have one assigned
    const user = users.find(u => u.id === userId);
    setSelectedPhoneCampaignId(user?.assigned_campaign_id || "");
  };

  const closeAssignPhoneModal = () => {
    setPhoneModalUserId(null);
    setIsAssigningPhone(false);
    setSelectedPhoneNumber("");
    setSelectedPhoneCampaignId("");
  };

  const handleAssignPhoneNumber = async () => {
    if (!phoneModalUserId) {
      return;
    }

    if (!selectedPhoneNumber) {
      toast.error("Please select a phone number");
      return;
    }

    setIsAssigningPhone(true);
    try {
      const response = await fetch(`/api/admin/users/${phoneModalUserId}/phone-number`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          phoneNumber: selectedPhoneNumber,
          campaignId: selectedPhoneCampaignId || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to assign phone number");
      }

      toast.success("Phone number assigned successfully");
      closeAssignPhoneModal();
      fetchTeamData();
    } catch (error: any) {
      console.error("Error assigning phone number:", error);
      toast.error(error.message || "Failed to assign phone number");
    } finally {
      setIsAssigningPhone(false);
    }
  };

  const handleRemovePhoneNumber = async (userId: string, userName: string) => {
    if (!confirm(`Remove phone number assignment from ${userName}?`)) {
      return;
    }

    try {
      // Find the user's assigned phone number
      const user = users.find(u => u.id === userId);
      const phoneNumber = user?.assigned_twilio_number;

      const response = await fetch(`/api/admin/users/${userId}/phone-number`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to remove phone number");
      }

      toast.success("Phone number removed successfully");
      if (phoneModalUserId === userId) {
        closeAssignPhoneModal();
      }
      fetchTeamData();
    } catch (error: any) {
      console.error("Error removing phone number:", error);
      toast.error(error.message || "Failed to remove phone number");
    }
  };

  const openCampaignModal = async (userId: string) => {
    setCampaignModalUserId(userId);
    setSelectedCampaignIds(userCampaigns[userId]?.map(c => c.id) || []);
  };

  const closeCampaignModal = () => {
    setCampaignModalUserId(null);
    setSelectedCampaignIds([]);
  };

  const openEditNameModal = (userId: string, currentName: string | null) => {
    setEditNameUserId(userId);
    setEditNameValue(currentName || "");
  };

  const closeEditNameModal = () => {
    setEditNameUserId(null);
    setEditNameValue("");
  };

  const handleUpdateName = async () => {
    if (!editNameUserId) return;

    setIsUpdatingName(true);
    try {
      const response = await fetch(`/api/team/members/${editNameUserId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: editNameValue.trim() || null }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update name");
      }

      toast.success("Name updated successfully");
      closeEditNameModal();
      fetchTeamData();
    } catch (error: any) {
      console.error("Error updating name:", error);
      toast.error(error.message || "Failed to update name");
    } finally {
      setIsUpdatingName(false);
    }
  };

  const handleUpdateHourlyRate = async (userId?: string, rateValue?: string) => {
    const targetUserId = userId || editRateUserId;
    const targetValue = rateValue !== undefined ? rateValue : editRateValue;
    
    if (!targetUserId) return;

    // Allow empty/null to clear the rate
    const rateToSend = targetValue === "" ? null : parseFloat(targetValue);

    setIsUpdatingRate(true);
    try {
      const response = await fetch(`/api/team/members/${targetUserId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hourly_rate_usd: rateToSend }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update hourly rate");
      }

      // Update local state immediately for snappy UI
      setUsers(prev => prev.map(u => 
        u.id === targetUserId 
          ? { ...u, hourly_rate_usd: rateToSend } 
          : u
      ));

      toast.success("Hourly rate saved");
      setEditRateUserId(null);
      setEditRateValue("");
    } catch (error: any) {
      console.error("Error updating hourly rate:", error);
      toast.error(error.message || "Failed to update hourly rate");
    } finally {
      setIsUpdatingRate(false);
    }
  };

  const handleUpdateCampaigns = async () => {
    if (!campaignModalUserId) return;

    setIsUpdatingCampaigns(true);
    try {
      // Get current campaigns for user
      const currentCampaignIds = userCampaigns[campaignModalUserId]?.map(c => c.id) || [];
      
      // Determine which campaigns to add and remove
      const toAdd = selectedCampaignIds.filter(id => !currentCampaignIds.includes(id));
      const toRemove = currentCampaignIds.filter(id => !selectedCampaignIds.includes(id));

      // Update each campaign's members
      for (const campaignId of toAdd) {
        const response = await fetch(`/api/campaigns/${campaignId}/members`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "add",
            user_ids: [campaignModalUserId],
            role: "member",
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || `Failed to add to campaign`);
        }
      }

      for (const campaignId of toRemove) {
        const response = await fetch(`/api/campaigns/${campaignId}/members`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "remove",
            user_ids: [campaignModalUserId],
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || `Failed to remove from campaign`);
        }
      }

      toast.success("Campaigns updated successfully");
      closeCampaignModal();
      fetchTeamData();
    } catch (error: any) {
      console.error("Error updating campaigns:", error);
      toast.error(error.message || "Failed to update campaigns");
    } finally {
      setIsUpdatingCampaigns(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <>
      <Toaster position="top-right" />
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Team Management</h1>
            <p className="text-sm text-gray-600 mt-1">
              Manage team members, roles, and invitations
            </p>
          </div>
          <Button
            onClick={() => setShowInviteModal(true)}
            leftIcon={<UserPlus className="w-4 h-4" />}
          >
            Invite User
          </Button>
        </div>

        {/* Team Members */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Users className="w-5 h-5" />
              Team Members ({users.length})
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                    Hourly Rate
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                    Phone
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                    Campaigns
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                    Activator
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-semibold text-sm">
                          {user.full_name?.[0]?.toUpperCase() || user.email[0].toUpperCase()}
                        </div>
                        <span className="font-medium text-gray-900">
                          {user.full_name || <span className="text-gray-400 italic">No name</span>}
                        </span>
                        <button
                          onClick={() => openEditNameModal(user.id, user.full_name)}
                          className="text-gray-400 hover:text-blue-600 transition-colors"
                          title="Edit name"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {user.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          user.role === "admin"
                            ? "bg-purple-100 text-purple-800"
                            : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {user.role === "admin" ? (
                          <>
                            <Shield className="w-3 h-3 mr-1" />
                            Admin
                          </>
                        ) : user.is_activator ? (
                          <>
                            <Rocket className="w-3 h-3 mr-1" />
                            Activator
                          </>
                        ) : (
                          <>
                            <User className="w-3 h-3 mr-1" />
                            Rep
                          </>
                        )}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      <div className="flex items-center gap-2">
                        {editRateUserId === user.id ? (
                          <div className="flex items-center gap-1">
                            <span className="text-gray-500">$</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={editRateValue}
                              onChange={(e) => setEditRateValue(e.target.value)}
                              onBlur={() => handleUpdateHourlyRate()}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleUpdateHourlyRate();
                                } else if (e.key === 'Escape') {
                                  setEditRateUserId(null);
                                  setEditRateValue("");
                                }
                              }}
                              className="w-16 border border-blue-400 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                              placeholder="0.00"
                              autoFocus
                              disabled={isUpdatingRate}
                            />
                            {isUpdatingRate && <LoadingSpinner size="sm" />}
                          </div>
                        ) : (
                          <>
                            <span 
                              onClick={() => {
                                setEditRateUserId(user.id);
                                setEditRateValue(user.hourly_rate_usd?.toString() || "");
                              }}
                              className="cursor-pointer hover:text-blue-600"
                              title="Click to edit"
                            >
                              {user.hourly_rate_usd ? `$${user.hourly_rate_usd.toFixed(2)}/hr` : <span className="text-gray-400">—</span>}
                            </span>
                            <button
                              onClick={() => {
                                setEditRateUserId(user.id);
                                setEditRateValue(user.hourly_rate_usd?.toString() || "");
                              }}
                              className="text-gray-400 hover:text-blue-600 transition-colors"
                              title="Edit hourly rate"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      <div className="flex items-center gap-2">
                        {user.assigned_twilio_number ? (
                          <>
                            <span className="font-medium text-blue-600">{user.assigned_twilio_number}</span>
                            <button
                              onClick={() => handleRemovePhoneNumber(user.id, user.full_name || user.email)}
                              className="text-red-600 hover:text-red-800 text-xs"
                              title="Remove phone number assignment"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {userCampaigns[user.id]?.length > 0 ? (
                          userCampaigns[user.id].map((campaign) => (
                            <span
                              key={campaign.id}
                              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800"
                            >
                              {campaign.name}
                            </span>
                          ))
                        ) : (
                          <span className="text-gray-400 text-xs">No campaigns</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => handleToggleActivator(user.id, user.is_activator || false)}
                        disabled={updatingActivatorId === user.id}
                        className={`px-3 py-1 rounded text-xs font-medium ${
                          user.is_activator 
                            ? "bg-green-600 text-white" 
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {updatingActivatorId === user.id ? "..." : user.is_activator ? "✓ Activator" : "Set Activator"}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openCampaignModal(user.id)}
                          className="text-blue-600 hover:text-blue-800 font-medium text-xs"
                          title="Manage campaigns"
                        >
                          <Tag className="w-4 h-4 inline mr-1" />
                          Campaigns
                        </button>
                        <button
                          onClick={() => openAssignPhoneModal(user.id)}
                          className="text-blue-600 hover:text-blue-800 font-medium text-xs"
                          title={user.assigned_twilio_number ? "Change phone number assignment" : "Assign phone number"}
                        >
                          <Phone className="w-4 h-4 inline mr-1" />
                          {user.assigned_twilio_number ? "Change" : "Assign"}
                        </button>
                        <button
                          onClick={() =>
                            openReassignModal(
                              user.id,
                              user.full_name || user.email
                            )
                          }
                          className="text-amber-600 hover:text-amber-800 font-medium text-xs"
                          title="Reassign all leads from this user"
                        >
                          Reassign
                        </button>
                        <button
                          onClick={() =>
                            openRemoveModal(
                              user.id,
                              user.full_name || user.email,
                              user.email
                            )
                          }
                          className="text-red-600 hover:text-red-800 font-medium text-xs"
                          title="Permanently remove user and delete from system"
                        >
                          <Trash2 className="w-4 h-4 inline mr-1" />
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pending Invitations */}
        {invitations.filter((inv) => inv.status === "pending").length > 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Mail className="w-5 h-5" />
                Pending Invitations ({invitations.filter((inv) => inv.status === "pending").length})
              </h2>
            </div>
            <div className="p-6">
              <div className="space-y-3">
                {invitations
                  .filter((inv) => inv.status === "pending")
                  .map((invitation) => (
                    <div
                      key={invitation.id}
                      className="flex items-center justify-between p-4 bg-yellow-50 rounded-lg border border-yellow-200"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">
                          {invitation.email}
                        </p>
                        <p className="text-sm text-gray-600">
                          Role: {invitation.role === "admin" ? "Admin" : "Rep"} • Expires:{" "}
                          {new Date(invitation.expires_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleResendInvite(invitation.id, invitation.email)}
                          disabled={resendingInviteId === invitation.id}
                          className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-100 rounded hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <RotateCw className={`w-4 h-4 ${resendingInviteId === invitation.id ? 'animate-spin' : ''}`} />
                          {resendingInviteId === invitation.id ? "Resending..." : "Resend"}
                        </button>
                        <button
                          onClick={() => handleCancelInvite(invitation.id, invitation.email)}
                          disabled={cancellingInviteId === invitation.id}
                          className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-red-700 bg-red-100 rounded hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <X className="w-4 h-4" />
                          {cancellingInviteId === invitation.id ? "Cancelling..." : "Cancel"}
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        ) : invitations.length > 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
            <p className="text-sm text-gray-600">
              No pending invitations. ({invitations.length} total invitation(s) with other statuses)
            </p>
          </div>
        ) : null}

        {/* Phone Number Assignment Modal */}
        {phoneModalUserId && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-bold text-gray-900 mb-4">
                Assign Phone Number
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Twilio Number
                  </label>
                  <select
                    value={selectedPhoneNumber}
                    onChange={(e) => setSelectedPhoneNumber(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">-- Select a number --</option>
                    {twilioNumbers.map((number) => (
                      <option key={number.sid} value={number.phoneNumber}>
                        {number.phoneNumber} {number.friendlyName !== number.phoneNumber ? `(${number.friendlyName})` : ""}
                      </option>
                    ))}
                  </select>
                  {twilioNumbers.length === 0 && (
                    <p className="text-xs text-gray-500 mt-1">
                      No Twilio numbers available. Purchase numbers in Twilio Numbers page.
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Assign to Campaign (Optional)
                  </label>
                  <select
                    value={selectedPhoneCampaignId}
                    onChange={(e) => setSelectedPhoneCampaignId(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">-- No campaign (organization-wide) --</option>
                    {campaigns.filter(c => c.status === "active").map((campaign) => (
                      <option key={campaign.id} value={campaign.id}>
                        {campaign.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Calls to this number will route to campaign teammates if the assigned user doesn't answer.
                  </p>
                </div>
                <div className="flex gap-3 justify-end">
                  <Button
                    variant="outline"
                    onClick={closeAssignPhoneModal}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleAssignPhoneNumber}
                    disabled={!selectedPhoneNumber || isAssigningPhone}
                    loading={isAssigningPhone}
                  >
                    {isAssigningPhone ? "Assigning..." : "Assign"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Campaign Assignment Modal */}
        {campaignModalUserId && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 max-h-[80vh] flex flex-col">
              <h3 className="text-lg font-bold text-gray-900 mb-4">
                Assign Campaigns
              </h3>
              <div className="flex-1 overflow-y-auto mb-4">
                <p className="text-sm text-gray-600 mb-4">
                  Select campaigns for {users.find(u => u.id === campaignModalUserId)?.full_name || users.find(u => u.id === campaignModalUserId)?.email}
                </p>
                <div className="space-y-2">
                  {campaigns.filter(c => c.status === 'active').map((campaign) => (
                    <label
                      key={campaign.id}
                      className="flex items-center gap-2 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedCampaignIds.includes(campaign.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedCampaignIds([...selectedCampaignIds, campaign.id]);
                          } else {
                            setSelectedCampaignIds(selectedCampaignIds.filter(id => id !== campaign.id));
                          }
                        }}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="flex-1 text-sm font-medium text-gray-900">
                        {campaign.name}
                      </span>
                    </label>
                  ))}
                  {campaigns.filter(c => c.status === 'active').length === 0 && (
                    <p className="text-sm text-gray-500 text-center py-4">
                      No active campaigns. Create campaigns first.
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-3 justify-end border-t pt-4">
                <Button
                  variant="outline"
                  onClick={closeCampaignModal}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleUpdateCampaigns}
                  disabled={isUpdatingCampaigns}
                  loading={isUpdatingCampaigns}
                >
                  {isUpdatingCampaigns ? "Updating..." : "Update Campaigns"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Invite Modal */}
        {showInviteModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-bold text-gray-900 mb-4">
                Invite Team Member
              </h3>
              <div className="space-y-4">
                <Input
                  label="Email Address"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="user@example.com"
                />
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Role
                  </label>
                  <select
                    value={inviteRole}
                    onChange={(e) =>
                      setInviteRole(e.target.value as "admin" | "member")
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="member">Rep (Salesperson)</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div className="flex gap-3 justify-end">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowInviteModal(false);
                      setInviteEmail("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleInviteUser}>Send Invitation</Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Edit Name Modal */}
        {editNameUserId && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-bold text-gray-900 mb-4">
                Edit First Name
              </h3>
              <div className="space-y-4">
                <Input
                  label="First Name"
                  type="text"
                  value={editNameValue}
                  onChange={(e) => setEditNameValue(e.target.value)}
                  placeholder="Enter first name"
                  autoFocus
                />
                <p className="text-xs text-gray-500">
                  This name will be used in template variables like {"{{sender_name}}"}
                </p>
                <div className="flex gap-3 justify-end">
                  <Button
                    variant="outline"
                    onClick={closeEditNameModal}
                    disabled={isUpdatingName}
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleUpdateName}
                    disabled={isUpdatingName}
                    loading={isUpdatingName}
                  >
                    {isUpdatingName ? "Saving..." : "Save Name"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Reassign CRM Modal */}
        {reassignModalUserId && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                Reassign All Leads
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Transfer all leads from <strong>{reassignModalUserName}</strong> to another team member.
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Reassign to:
                  </label>
                  <select
                    value={reassignToUserId}
                    onChange={(e) => setReassignToUserId(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">-- Select team member --</option>
                    {users
                      .filter((u) => u.id !== reassignModalUserId)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.full_name || u.email} ({u.email})
                        </option>
                      ))}
                  </select>
                </div>
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <p className="text-xs text-yellow-800">
                    <strong>Note:</strong> This will move all leads currently assigned to{" "}
                    {reassignModalUserName} to the selected user. Call history and activities
                    will remain attributed to the original rep for reporting accuracy.
                  </p>
                </div>
                <div className="flex gap-3 justify-end">
                  <Button
                    variant="outline"
                    onClick={closeReassignModal}
                    disabled={isReassigning}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleReassignCRM}
                    disabled={!reassignToUserId || isReassigning}
                    loading={isReassigning}
                    className="bg-amber-600 hover:bg-amber-700"
                  >
                    {isReassigning ? "Reassigning..." : "Reassign Leads"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Remove User Modal */}
        {removeModalUserId && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-bold text-red-600 mb-2 flex items-center gap-2">
                <Trash2 className="w-5 h-5" />
                Permanently Remove User
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                You are about to permanently delete <strong>{removeModalUserName}</strong> ({removeModalUserEmail}).
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Transfer their leads to:
                  </label>
                  <select
                    value={removeReassignToUserId}
                    onChange={(e) => setRemoveReassignToUserId(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">-- Select team member --</option>
                    {users
                      .filter((u) => u.id !== removeModalUserId)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.full_name || u.email} ({u.email})
                        </option>
                      ))}
                  </select>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-xs text-red-800 font-medium mb-1">
                    ⚠️ This action is permanent and cannot be undone!
                  </p>
                  <ul className="text-xs text-red-700 list-disc list-inside space-y-1">
                    <li>User will be removed from all campaigns</li>
                    <li>User profile will be deleted</li>
                    <li>User will be deleted from authentication (can't log in)</li>
                    <li>All their leads will be transferred to the selected user</li>
                  </ul>
                </div>
                <div className="flex gap-3 justify-end">
                  <Button
                    variant="outline"
                    onClick={closeRemoveModal}
                    disabled={isRemovingUser}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleRemoveUser}
                    disabled={!removeReassignToUserId || isRemovingUser}
                    loading={isRemovingUser}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    {isRemovingUser ? "Removing..." : "Delete User Permanently"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

