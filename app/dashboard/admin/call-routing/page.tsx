"use client";

import { useState, useEffect } from "react";
import { Settings, Clock, Users, Phone, Plus, Trash2, Save, Bell } from "lucide-react";
import toast from "react-hot-toast";
import { LoadingSpinner } from "@/components/LoadingSpinner";

interface AgentSchedule {
  id?: string;
  user_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
}

interface RoutingRule {
  id?: string;
  rule_name: string;
  priority: number;
  is_active: boolean;
  business_hours_start?: string;
  business_hours_end?: string;
  business_days?: number[];
  route_to_user_id?: string;
  route_to_phone?: string;
  route_to_voicemail: boolean;
  voicemail_message?: string;
}

interface OrgSettings {
  recording_enabled: boolean;
  recording_retention_days: number;
  default_ring_timeout: number;
  default_voicemail_message: string;
}

export default function CallRoutingPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [orgSettings, setOrgSettings] = useState<OrgSettings | null>(null);
  const [routingRules, setRoutingRules] = useState<RoutingRule[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"settings" | "rules" | "kpi">("settings");
  const [kpiSettings, setKpiSettings] = useState({
    notification_frequency: "daily",
    notification_time: "09:00:00",
    notification_day: 1,
    recipient_emails: [] as string[],
    is_active: true,
  });
  const [newEmail, setNewEmail] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Fetch org settings
      const settingsRes = await fetch("/api/admin/call-settings");
      if (settingsRes.ok) {
        const settings = await settingsRes.json();
        setOrgSettings(settings);
      }

      // Fetch routing rules
      const rulesRes = await fetch("/api/admin/routing-rules");
      if (rulesRes.ok) {
        const rules = await rulesRes.json();
        setRoutingRules(rules);
      }

      // Fetch users for routing
      const usersRes = await fetch("/api/admin/users");
      if (usersRes.ok) {
        const usersData = await usersRes.json();
        setUsers(usersData);
      }

      // Fetch KPI settings
      const kpiRes = await fetch("/api/admin/kpi-settings");
      if (kpiRes.ok) {
        const kpiData = await kpiRes.json();
        setKpiSettings(kpiData);
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load settings");
    } finally {
      setIsLoading(false);
    }
  };

  const saveOrgSettings = async () => {
    if (!orgSettings) return;

    try {
      const response = await fetch("/api/admin/call-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orgSettings),
      });

      if (!response.ok) throw new Error("Failed to save settings");

      toast.success("Settings saved successfully");
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error("Failed to save settings");
    }
  };

  const saveRoutingRule = async (rule: RoutingRule) => {
    try {
      const response = await fetch("/api/admin/routing-rules", {
        method: rule.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rule),
      });

      if (!response.ok) throw new Error("Failed to save rule");

      toast.success("Routing rule saved");
      fetchData();
    } catch (error) {
      console.error("Error saving rule:", error);
      toast.error("Failed to save routing rule");
    }
  };

  const deleteRoutingRule = async (id: string) => {
    if (!confirm("Are you sure you want to delete this routing rule?")) return;

    try {
      const response = await fetch(`/api/admin/routing-rules/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete rule");

      toast.success("Routing rule deleted");
      fetchData();
    } catch (error) {
      console.error("Error deleting rule:", error);
      toast.error("Failed to delete routing rule");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Call Routing Settings</h1>
        <p className="text-gray-600">Configure how incoming calls are routed to your team</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex space-x-8">
          <button
            onClick={() => setActiveTab("settings")}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === "settings"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            <Settings className="inline h-4 w-4 mr-2" />
            Organization Settings
          </button>
          <button
            onClick={() => setActiveTab("rules")}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === "rules"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            <Phone className="inline h-4 w-4 mr-2" />
            Routing Rules
          </button>
          <button
            onClick={() => setActiveTab("kpi")}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === "kpi"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            <Bell className="inline h-4 w-4 mr-2" />
            KPI Notifications
          </button>
        </nav>
      </div>

      {/* Settings Tab */}
      {activeTab === "settings" && orgSettings && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Organization Call Settings</h2>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <input
                  type="checkbox"
                  checked={orgSettings.recording_enabled}
                  onChange={(e) =>
                    setOrgSettings({ ...orgSettings, recording_enabled: e.target.checked })
                  }
                  className="mr-2"
                />
                Enable Call Recording
              </label>
              <p className="text-sm text-gray-500 ml-6">
                All calls will be recorded and stored securely
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Recording Retention (days)
              </label>
              <input
                type="number"
                value={orgSettings.recording_retention_days}
                onChange={(e) =>
                  setOrgSettings({
                    ...orgSettings,
                    recording_retention_days: parseInt(e.target.value) || 90,
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                min="1"
                max="365"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Default Ring Timeout (seconds)
              </label>
              <input
                type="number"
                value={orgSettings.default_ring_timeout}
                onChange={(e) =>
                  setOrgSettings({
                    ...orgSettings,
                    default_ring_timeout: parseInt(e.target.value) || 30,
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                min="5"
                max="60"
              />
              <p className="text-sm text-gray-500 mt-1">
                How long to ring before going to voicemail
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Default Voicemail Message
              </label>
              <textarea
                value={orgSettings.default_voicemail_message}
                onChange={(e) =>
                  setOrgSettings({
                    ...orgSettings,
                    default_voicemail_message: e.target.value,
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                rows={4}
              />
            </div>

            <button
              onClick={saveOrgSettings}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <Save className="h-4 w-4" />
              Save Settings
            </button>
          </div>
        </div>
      )}

      {/* Routing Rules Tab */}
      {activeTab === "rules" && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Routing Rules</h2>
            <button
              onClick={() => {
                const newRule: RoutingRule = {
                  rule_name: "New Rule",
                  priority: routingRules.length,
                  is_active: true,
                  route_to_voicemail: false,
                };
                setRoutingRules([...routingRules, newRule]);
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Add Rule
            </button>
          </div>

          <div className="space-y-4">
            {routingRules.map((rule, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Rule Name
                    </label>
                    <input
                      type="text"
                      value={rule.rule_name}
                      onChange={(e) => {
                        const updated = [...routingRules];
                        updated[index].rule_name = e.target.value;
                        setRoutingRules(updated);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Priority (higher = checked first)
                    </label>
                    <input
                      type="number"
                      value={rule.priority}
                      onChange={(e) => {
                        const updated = [...routingRules];
                        updated[index].priority = parseInt(e.target.value) || 0;
                        setRoutingRules(updated);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>

                <div className="mb-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={rule.is_active}
                      onChange={(e) => {
                        const updated = [...routingRules];
                        updated[index].is_active = e.target.checked;
                        setRoutingRules(updated);
                      }}
                    />
                    Active
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Business Hours Start
                    </label>
                    <input
                      type="time"
                      value={rule.business_hours_start || ""}
                      onChange={(e) => {
                        const updated = [...routingRules];
                        updated[index].business_hours_start = e.target.value;
                        setRoutingRules(updated);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Business Hours End
                    </label>
                    <input
                      type="time"
                      value={rule.business_hours_end || ""}
                      onChange={(e) => {
                        const updated = [...routingRules];
                        updated[index].business_hours_end = e.target.value;
                        setRoutingRules(updated);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Route To
                  </label>
                  <select
                    value={
                      rule.route_to_voicemail
                        ? "voicemail"
                        : rule.route_to_user_id
                        ? "user"
                        : rule.route_to_phone
                        ? "phone"
                        : "none"
                    }
                    onChange={(e) => {
                      const updated = [...routingRules];
                      if (e.target.value === "voicemail") {
                        updated[index].route_to_voicemail = true;
                        updated[index].route_to_user_id = undefined;
                        updated[index].route_to_phone = undefined;
                      } else if (e.target.value === "user") {
                        updated[index].route_to_voicemail = false;
                        updated[index].route_to_phone = undefined;
                      } else if (e.target.value === "phone") {
                        updated[index].route_to_voicemail = false;
                        updated[index].route_to_user_id = undefined;
                      }
                      setRoutingRules(updated);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="none">Select routing option</option>
                    <option value="user">Specific User</option>
                    <option value="phone">Phone Number</option>
                    <option value="voicemail">Voicemail</option>
                  </select>
                </div>

                {!rule.route_to_voicemail && rule.route_to_user_id === undefined && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {rule.route_to_phone ? "Phone Number" : "Select User"}
                    </label>
                    {rule.route_to_phone ? (
                      <input
                        type="tel"
                        value={rule.route_to_phone}
                        onChange={(e) => {
                          const updated = [...routingRules];
                          updated[index].route_to_phone = e.target.value;
                          setRoutingRules(updated);
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        placeholder="+1234567890"
                      />
                    ) : (
                      <select
                        value={rule.route_to_user_id || ""}
                        onChange={(e) => {
                          const updated = [...routingRules];
                          updated[index].route_to_user_id = e.target.value || undefined;
                          setRoutingRules(updated);
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      >
                        <option value="">Select user</option>
                        {users.map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.full_name || user.email}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                {rule.route_to_voicemail && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Voicemail Message
                    </label>
                    <textarea
                      value={rule.voicemail_message || ""}
                      onChange={(e) => {
                        const updated = [...routingRules];
                        updated[index].voicemail_message = e.target.value;
                        setRoutingRules(updated);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                      rows={3}
                    />
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  {rule.id && (
                    <button
                      onClick={() => deleteRoutingRule(rule.id!)}
                      className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg flex items-center gap-2"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>
                  )}
                  <button
                    onClick={() => saveRoutingRule(rule)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                  >
                    <Save className="h-4 w-4" />
                    Save
                  </button>
                </div>
              </div>
            ))}

            {routingRules.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                No routing rules configured. Click "Add Rule" to create one.
              </div>
            )}
          </div>
        </div>
      )}

      {/* KPI Notifications Tab */}
      {activeTab === "kpi" && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">KPI Notification Settings</h2>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <input
                  type="checkbox"
                  checked={kpiSettings.is_active}
                  onChange={(e) =>
                    setKpiSettings({ ...kpiSettings, is_active: e.target.checked })
                  }
                  className="mr-2"
                />
                Enable KPI Notifications
              </label>
              <p className="text-sm text-gray-500 ml-6">
                Receive automated KPI reports via email
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Notification Frequency
              </label>
              <select
                value={kpiSettings.notification_frequency}
                onChange={(e) =>
                  setKpiSettings({ ...kpiSettings, notification_frequency: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="disabled">Disabled</option>
              </select>
            </div>

            {kpiSettings.notification_frequency !== "disabled" && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Notification Time
                  </label>
                  <input
                    type="time"
                    value={kpiSettings.notification_time}
                    onChange={(e) =>
                      setKpiSettings({ ...kpiSettings, notification_time: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </div>

                {kpiSettings.notification_frequency === "weekly" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Day of Week
                    </label>
                    <select
                      value={kpiSettings.notification_day}
                      onChange={(e) =>
                        setKpiSettings({
                          ...kpiSettings,
                          notification_day: parseInt(e.target.value),
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="1">Monday</option>
                      <option value="2">Tuesday</option>
                      <option value="3">Wednesday</option>
                      <option value="4">Thursday</option>
                      <option value="5">Friday</option>
                      <option value="6">Saturday</option>
                      <option value="7">Sunday</option>
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Recipient Email Addresses
                  </label>
                  <div className="space-y-2">
                    {kpiSettings.recipient_emails.map((email, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <input
                          type="email"
                          value={email}
                          readOnly
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
                        />
                        <button
                          onClick={() => {
                            const newEmails = [...kpiSettings.recipient_emails];
                            newEmails.splice(index, 1);
                            setKpiSettings({ ...kpiSettings, recipient_emails: newEmails });
                          }}
                          className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    <div className="flex items-center gap-2">
                      <input
                        type="email"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="Enter email address"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                        onKeyPress={(e) => {
                          if (e.key === "Enter" && newEmail.trim()) {
                            setKpiSettings({
                              ...kpiSettings,
                              recipient_emails: [...kpiSettings.recipient_emails, newEmail.trim()],
                            });
                            setNewEmail("");
                          }
                        }}
                      />
                      <button
                        onClick={() => {
                          if (newEmail.trim()) {
                            setKpiSettings({
                              ...kpiSettings,
                              recipient_emails: [...kpiSettings.recipient_emails, newEmail.trim()],
                            });
                            setNewEmail("");
                          }
                        }}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Add email addresses that should receive KPI reports
                  </p>
                </div>
              </>
            )}

            <button
              onClick={async () => {
                try {
                  const response = await fetch("/api/admin/kpi-settings", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(kpiSettings),
                  });

                  if (!response.ok) throw new Error("Failed to save settings");

                  toast.success("KPI settings saved successfully");
                } catch (error) {
                  console.error("Error saving KPI settings:", error);
                  toast.error("Failed to save KPI settings");
                }
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <Save className="h-4 w-4" />
              Save KPI Settings
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

