"use client";

import { useState, useEffect } from "react";
import { Plus, Calendar, Clock } from "lucide-react";
import toast from "react-hot-toast";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import Button from "@/components/Button";
import Input from "@/components/Input";

interface TimeLog {
  id: string;
  date: string;
  hours_logged: number;
  notes: string | null;
  team_member_id: string;
  campaign_id: string;
  user_profiles?: { full_name: string; email: string } | null;
  campaigns?: { name: string } | null;
}

interface Campaign {
  id: string;
  name: string;
}

interface User {
  id: string;
  full_name: string | null;
  email: string;
}

export default function TimeLogsPage() {
  const [timeLogs, setTimeLogs] = useState<TimeLog[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    team_member_id: "",
    campaign_id: "",
    date: new Date().toISOString().split("T")[0],
    hours_logged: "",
    notes: "",
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const [logsRes, campaignsRes, usersRes] = await Promise.all([
        fetch("/api/governance/time-logs?limit=100"),
        fetch("/api/campaigns"),
        fetch("/api/team/users"),
      ]);

      if (logsRes.ok) {
        const logsData = await logsRes.json();
        setTimeLogs(logsData);
      }

      if (campaignsRes.ok) {
        const campaignsData = await campaignsRes.json();
        setCampaigns(campaignsData);
      }

      if (usersRes.ok) {
        const usersData = await usersRes.json();
        setUsers(usersData);
      }
    } catch (error: any) {
      console.error("Error loading data:", error);
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch("/api/governance/time-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          hours_logged: parseFloat(formData.hours_logged),
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create time log");
      }

      toast.success("Time log created");
      setShowForm(false);
      setFormData({
        team_member_id: "",
        campaign_id: "",
        date: new Date().toISOString().split("T")[0],
        hours_logged: "",
        notes: "",
      });
      loadData();
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Time Logs</h1>
          <p className="text-gray-600 mt-1">Track labor costs by campaign</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="w-4 h-4 mr-2" />
          Log Time
        </Button>
      </div>

      {showForm && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Log Time</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Team Member</label>
              <select
                value={formData.team_member_id}
                onChange={(e) => setFormData({ ...formData, team_member_id: e.target.value })}
                className="w-full border rounded px-3 py-2"
                required
              >
                <option value="">Select user</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.full_name || user.email}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Campaign</label>
              <select
                value={formData.campaign_id}
                onChange={(e) => setFormData({ ...formData, campaign_id: e.target.value })}
                className="w-full border rounded px-3 py-2"
                required
              >
                <option value="">Select campaign</option>
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Date</label>
              <Input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Hours</label>
              <Input
                type="number"
                step="0.25"
                min="0"
                max="24"
                value={formData.hours_logged}
                onChange={(e) => setFormData({ ...formData, hours_logged: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Notes (optional)</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full border rounded px-3 py-2"
                rows={3}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit">Save</Button>
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b">
          <h2 className="text-xl font-semibold">Recent Time Logs</h2>
        </div>
        <div className="p-6">
          {timeLogs.length === 0 ? (
            <p className="text-gray-500">No time logs yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Date</th>
                    <th className="text-left py-2">Team Member</th>
                    <th className="text-left py-2">Campaign</th>
                    <th className="text-left py-2">Hours</th>
                    <th className="text-left py-2">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {timeLogs.map((log) => (
                    <tr key={log.id} className="border-b">
                      <td className="py-2">{new Date(log.date).toLocaleDateString()}</td>
                      <td className="py-2">
                        {log.user_profiles?.full_name || log.user_profiles?.email || "Unknown"}
                      </td>
                      <td className="py-2">{log.campaigns?.name || "Unknown"}</td>
                      <td className="py-2">{log.hours_logged}h</td>
                      <td className="py-2 text-sm text-gray-500">{log.notes || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


