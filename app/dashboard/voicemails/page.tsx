"use client";

import { useState, useEffect } from "react";
import { Voicemail as VoicemailIcon, Play, Pause, Download, Phone, Clock, Calendar, Settings, Save, Trash2, Upload } from "lucide-react";
import toast from "react-hot-toast";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import Button from "@/components/Button";

interface Voicemail {
  id: string;
  leadId: string;
  leadName: string | null;
  phoneNumber: string;
  duration: number;
  recordingUrl: string | null;
  notes: string | null;
  status: string;
  isNew: boolean;
  initiatedAt: string;
}

interface PhoneNumberSetting {
  id: string;
  phone_number: string;
  voicemail_greeting: string | null;
}

export default function VoicemailsPage() {
  const [voicemails, setVoicemails] = useState<Voicemail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [audioElements, setAudioElements] = useState<Map<string, HTMLAudioElement>>(new Map());
  const [showSettings, setShowSettings] = useState(false);
  const [phoneNumberSettings, setPhoneNumberSettings] = useState<PhoneNumberSetting[]>([]);
  const [greetingEdits, setGreetingEdits] = useState<Map<string, string>>(new Map());
  const [isSaving, setIsSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  useEffect(() => {
    fetchVoicemails();
    fetchVoicemailSettings();
  }, []);

  const fetchVoicemailSettings = async () => {
    try {
      const response = await fetch("/api/voicemails/settings");
      if (response.ok) {
        const data = await response.json();
        setPhoneNumberSettings(data.phoneNumbers || []);
        // Initialize greeting edits with current values
        const edits = new Map<string, string>();
        (data.phoneNumbers || []).forEach((pn: PhoneNumberSetting) => {
          edits.set(pn.id, pn.voicemail_greeting || "");
        });
        setGreetingEdits(edits);
      }
    } catch (error) {
      console.error("Error fetching voicemail settings:", error);
    }
  };

  const handleSaveGreeting = async (phoneNumberId: string) => {
    setIsSaving(true);
    try {
      const greeting = greetingEdits.get(phoneNumberId) || "";
      const response = await fetch("/api/voicemails/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumberId,
          voicemailGreeting: greeting.trim() || null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save voicemail greeting");
      }

      toast.success("Voicemail greeting saved successfully");
      fetchVoicemailSettings();
    } catch (error: any) {
      console.error("Error saving voicemail greeting:", error);
      toast.error(error.message || "Failed to save voicemail greeting");
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearGreeting = async (phoneNumberId: string) => {
    setIsSaving(true);
    try {
      const response = await fetch("/api/voicemails/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumberId,
          voicemailGreeting: null,
        }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to clear voicemail greeting");
      }
      toast.success("Voicemail greeting cleared");
      fetchVoicemailSettings();
    } catch (err: any) {
      console.error("Error clearing greeting:", err);
      toast.error(err.message || "Failed to clear greeting");
    } finally {
      setIsSaving(false);
    }
  };

  const handleUploadGreeting = async (phoneNumberId: string, file: File) => {
    try {
      setUploadingId(phoneNumberId);
      const lowerName = file.name.toLowerCase();
      const supported = ["wav", "mp3", "ogg", "flac", "webm"];
      const ext = lowerName.split(".").pop() || "";
      if (!supported.includes(ext)) {
        throw new Error("Unsupported audio format. Use wav, mp3, ogg, flac, or webm.");
      }
      const form = new FormData();
      form.append("phoneNumberId", phoneNumberId);
      form.append("file", file);
      const res = await fetch("/api/voicemails/settings/upload", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      toast.success("Greeting uploaded");
      // Set the greeting edit to the URL so user sees it saved
      const newEdits = new Map(greetingEdits);
      newEdits.set(phoneNumberId, data.url);
      setGreetingEdits(newEdits);
      fetchVoicemailSettings();
    } catch (err: any) {
      console.error("Upload greeting error:", err);
      toast.error(err.message || "Failed to upload greeting");
    } finally {
      setUploadingId(null);
    }
  };

  const fetchVoicemails = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/voicemails");
      if (!response.ok) throw new Error("Failed to fetch voicemails");

      const data = await response.json();
      const formattedVoicemails = (data.voicemails || []).map((v: any) => ({
        id: v.id,
        leadId: v.lead_id,
        leadName: v.lead_name,
        phoneNumber: v.phone_number,
        duration: v.duration || 0,
        recordingUrl: v.recording_url,
        notes: v.notes,
        status: v.status,
        isNew: v.is_new !== false,
        initiatedAt: v.initiated_at,
      }));
      setVoicemails(formattedVoicemails);
    } catch (error) {
      console.error("Error fetching voicemails:", error);
      toast.error("Failed to load voicemails");
    } finally {
      setIsLoading(false);
    }
  };

  const markAsRead = async (voicemailId: string) => {
    try {
      const response = await fetch(`/api/voicemails/${voicemailId}`, {
        method: "PATCH",
      });

      if (response.ok) {
        // Update local state
        setVoicemails((prev) =>
          prev.map((vm) => (vm.id === voicemailId ? { ...vm, isNew: false } : vm))
        );
      }
    } catch (error) {
      console.error("Error marking voicemail as read:", error);
    }
  };

  const handleDelete = async (voicemailId: string) => {
    try {
      const res = await fetch(`/api/voicemails/${voicemailId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete voicemail");
      }
      setVoicemails((prev) => prev.filter((vm) => vm.id !== voicemailId));
      toast.success("Voicemail deleted");
    } catch (err: any) {
      console.error("Delete voicemail error:", err);
      toast.error(err.message || "Failed to delete voicemail");
    }
  };

  const handlePlayPause = (voicemail: Voicemail) => {
    // Mark as read when playing
    if (voicemail.isNew) {
      markAsRead(voicemail.id);
    }

    if (!voicemail.recordingUrl) {
      toast.error("No recording available");
      return;
    }

    // Use our proxy endpoint instead of direct Twilio URL (avoids auth issues)
    const proxyUrl = `/api/voicemails/${voicemail.id}/recording`;
    const audio = audioElements.get(voicemail.id) || new Audio(proxyUrl);

    if (!audioElements.has(voicemail.id)) {
      setAudioElements(new Map(audioElements.set(voicemail.id, audio)));
      
      audio.addEventListener("ended", () => {
        setPlayingId(null);
      });
    }

    if (playingId === voicemail.id) {
      audio.pause();
      setPlayingId(null);
    } else {
      // Pause any currently playing audio
      audioElements.forEach((a, id) => {
        if (id !== voicemail.id) {
          a.pause();
        }
      });
      
      audio.play();
      setPlayingId(voicemail.id);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } else if (diffInHours < 48) {
      return "Yesterday " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } else {
      return date.toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <VoicemailIcon className="h-8 w-8 text-blue-600" />
                <h1 className="text-3xl font-bold text-gray-900">Voicemails</h1>
              </div>
              <p className="text-gray-600 mt-1">Listen to voicemail messages from your leads</p>
            </div>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Settings className="h-5 w-5" />
              {showSettings ? "Hide Settings" : "Voicemail Settings"}
            </button>
          </div>
        </div>

        {/* Voicemail Settings */}
        {showSettings && (
          <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Voicemail Greeting Settings</h2>
            {phoneNumberSettings.length === 0 ? (
              <p className="text-gray-600">No phone numbers assigned to you. Contact an admin to assign a phone number.</p>
            ) : (
              <div className="space-y-6">
                {phoneNumberSettings.map((phoneNumber) => (
                  <div key={phoneNumber.id} className="border-b border-gray-200 pb-6 last:border-b-0 last:pb-0">
                    <div className="mb-3">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Phone Number: {phoneNumber.phone_number}
                      </label>
                      <p className="text-xs text-gray-500 mb-3">
                        Custom greeting for this phone number. Leave empty to use organization default. You can type a greeting, paste a link to an audio file, or upload an audio file.
                      </p>
                      <textarea
                        value={greetingEdits.get(phoneNumber.id) || ""}
                        onChange={(e) => {
                          const newEdits = new Map(greetingEdits);
                          newEdits.set(phoneNumber.id, e.target.value);
                          setGreetingEdits(newEdits);
                        }}
                        placeholder="Thank you for calling. We are unable to take your call right now. Please leave a message and we will get back to you as soon as possible."
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[100px]"
                        rows={4}
                      />
                    </div>
                    <Button
                      onClick={() => handleSaveGreeting(phoneNumber.id)}
                      disabled={isSaving}
                      loading={isSaving}
                      className="w-auto"
                    >
                      <Save className="h-4 w-4 inline mr-2" />
                      Save Greeting
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => handleClearGreeting(phoneNumber.id)}
                      disabled={isSaving}
                      className="ml-2 text-sm text-gray-600"
                    >
                      Clear
                    </Button>
                    <div className="flex flex-wrap gap-3 mt-3 items-center">
                      <label className="flex items-center gap-2 text-sm text-gray-700">
                        <Upload className="h-4 w-4" />
                        <span>Upload audio</span>
                        <input
                          type="file"
                          accept=".wav,.mp3,.ogg,.flac,.webm"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleUploadGreeting(phoneNumber.id, file);
                          }}
                          disabled={uploadingId === phoneNumber.id}
                          className="text-xs"
                        />
                      </label>
                      <span className="text-xs text-gray-500">Supported: wav, mp3, ogg, flac, webm</span>
                      {uploadingId === phoneNumber.id && (
                        <span className="text-xs text-gray-500">Uploading…</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Voicemails List */}
        {voicemails.length === 0 ? (
          <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-12 text-center">
            <VoicemailIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Voicemails</h3>
            <p className="text-gray-600">
              When leads leave voicemail messages, they'll appear here
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {voicemails.map((voicemail) => (
              <div
                key={voicemail.id}
                className={`bg-white rounded-lg shadow-lg border ${
                  voicemail.isNew ? "border-blue-500 border-2" : "border-gray-200"
                } p-6 hover:shadow-xl transition-shadow`}
              >
                <div className="flex items-start gap-4">
                  {/* Play Button */}
                  <button
                    onClick={() => handlePlayPause(voicemail)}
                    disabled={!voicemail.recordingUrl}
                    className={`flex-shrink-0 w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
                      voicemail.recordingUrl
                        ? "bg-blue-600 hover:bg-blue-700 text-white"
                        : "bg-gray-300 text-gray-500 cursor-not-allowed"
                    }`}
                  >
                    {playingId === voicemail.id ? (
                      <Pause className="h-6 w-6" />
                    ) : (
                      <Play className="h-6 w-6 ml-1" />
                    )}
                  </button>

                  {/* Voicemail Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {voicemail.leadName || "Unknown Caller"}
                        </h3>
                        {voicemail.isNew && (
                          <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full">
                            NEW
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        {voicemail.recordingUrl && (
                          <a
                            href={`/api/voicemails/${voicemail.id}/recording`}
                            download={`voicemail-${voicemail.leadName || voicemail.phoneNumber}-${new Date(voicemail.initiatedAt).toISOString().split('T')[0]}.mp3`}
                            className="text-blue-600 hover:text-blue-700 transition-colors"
                            title="Download recording"
                          >
                            <Download className="h-5 w-5" />
                          </a>
                        )}
                        <button
                          onClick={() => handleDelete(voicemail.id)}
                          className="text-red-600 hover:text-red-700 transition-colors flex items-center gap-1 text-sm"
                          title="Delete voicemail"
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mb-3">
                      <div className="flex items-center gap-1">
                        <Phone className="h-4 w-4" />
                        <span>{voicemail.phoneNumber}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        <span>{formatDuration(voicemail.duration)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        <span>{formatDate(voicemail.initiatedAt)}</span>
                      </div>
                    </div>

                    {/* Transcription / Notes */}
                    {voicemail.notes && (
                      <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-700">{voicemail.notes}</p>
                      </div>
                    )}

                    {!voicemail.recordingUrl && (
                      <div className="mt-3 text-sm text-red-600">
                        Recording not available
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


