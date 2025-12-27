"use client";

import { useState, useEffect } from "react";
import { Mic, Calendar, Clock, Phone, Building, Play, Pause, Download } from "lucide-react";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import toast from "react-hot-toast";

interface Recording {
  id: string;
  meeting_id: string;
  company_name: string;
  phone: string;
  scheduled_at: string;
  duration_seconds: number;
  recording_url: string;
  recording_status: string;
  outcome: string;
}

export default function AdminRecordingsPage() {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);

  useEffect(() => {
    fetchRecordings();
  }, []);

  const fetchRecordings = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/recordings");
      if (!response.ok) throw new Error("Failed to fetch recordings");
      const data = await response.json();
      setRecordings(data.recordings || []);
    } catch (error: any) {
      console.error("Error fetching recordings:", error);
      toast.error(error.message || "Failed to load recordings");
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white mb-2">Scheduled Appointment Recordings</h1>
        <p className="text-slate-400">Listen to recordings from activation meetings</p>
      </div>

      {recordings.length === 0 ? (
        <div className="bg-slate-800 rounded-lg p-8 text-center">
          <Mic className="h-12 w-12 text-slate-500 mx-auto mb-3" />
          <p className="text-slate-400">No recordings available</p>
        </div>
      ) : (
        <div className="space-y-4">
          {recordings.map((recording) => (
            <div key={recording.id} className="bg-slate-800 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Building className="h-4 w-4 text-slate-400" />
                    <span className="text-white font-medium">{recording.company_name}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-slate-400">
                    <span className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {recording.phone}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(recording.scheduled_at)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDuration(recording.duration_seconds)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPlayingId(playingId === recording.id ? null : recording.id)}
                    className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                  >
                    {playingId === recording.id ? (
                      <Pause className="h-5 w-5" />
                    ) : (
                      <Play className="h-5 w-5" />
                    )}
                  </button>
                  {recording.recording_url && (
                    <a
                      href={recording.recording_url}
                      download
                      className="p-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg"
                    >
                      <Download className="h-5 w-5" />
                    </a>
                  )}
                </div>
              </div>

              {playingId === recording.id && recording.recording_url && (
                <div className="mt-4">
                  <audio
                    src={recording.recording_url}
                    controls
                    autoPlay
                    className="w-full"
                    onEnded={() => setPlayingId(null)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
