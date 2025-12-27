"use client";

import { useState, useEffect } from "react";
import { 
  Trash2, 
  RotateCcw, 
  AlertCircle, 
  Search, 
  Phone, 
  Mail, 
  MessageSquare,
  MapPin,
  Loader2
} from "lucide-react";
import toast, { Toaster } from "react-hot-toast";

interface RecycleBinItem {
  id: string;
  type: "search_history" | "lead" | "sms" | "email" | "call";
  title: string;
  subtitle: string;
  deleted_at: string;
  daysRemaining: number;
}

export default function RecycleBinPage() {
  const [items, setItems] = useState<RecycleBinItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [isEmptying, setIsEmptying] = useState(false);

  useEffect(() => {
    fetchRecycleBinItems();
  }, []);

  const fetchRecycleBinItems = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/recycle-bin");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch recycle bin items");
      }

      setItems(data.items || []);
    } catch (error: any) {
      console.error("Error fetching recycle bin:", error);
      toast.error(error.message || "Failed to load recycle bin");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestore = async (item: RecycleBinItem) => {
    const toastId = toast.loading(`Restoring ${item.type}...`);
    try {
      const response = await fetch("/api/recycle-bin/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, type: item.type }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to restore item");
      }

      toast.success(data.message || "Item restored successfully", { id: toastId });
      
      // Remove from list
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch (error: any) {
      console.error("Error restoring item:", error);
      toast.error(error.message || "Failed to restore item", { id: toastId });
    }
  };

  const handlePermanentDelete = async (item: RecycleBinItem) => {
    if (!confirm(`⚠️ Permanently delete this ${item.type}? This action cannot be undone!`)) {
      return;
    }

    const toastId = toast.loading(`Permanently deleting...`);
    try {
      const response = await fetch("/api/recycle-bin/permanent", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, type: item.type }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete item");
      }

      toast.success(data.message || "Item permanently deleted", { id: toastId });
      
      // Remove from list
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch (error: any) {
      console.error("Error deleting item:", error);
      toast.error(error.message || "Failed to delete item", { id: toastId });
    }
  };

  const handleEmptyRecycleBin = async () => {
    if (!confirm(`⚠️ Permanently delete ALL ${items.length} items? This action cannot be undone!`)) {
      return;
    }

    if (!confirm("Are you absolutely sure? This will permanently delete everything in the recycle bin.")) {
      return;
    }

    setIsEmptying(true);
    const toastId = toast.loading("Emptying recycle bin...");
    try {
      const response = await fetch("/api/recycle-bin/empty", {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to empty recycle bin");
      }

      toast.success(data.message || "Recycle bin emptied", { id: toastId });
      setItems([]);
    } catch (error: any) {
      console.error("Error emptying recycle bin:", error);
      toast.error(error.message || "Failed to empty recycle bin", { id: toastId });
    } finally {
      setIsEmptying(false);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "search_history":
        return <Search className="h-5 w-5 text-blue-500" />;
      case "lead":
        return <MapPin className="h-5 w-5 text-green-500" />;
      case "sms":
        return <MessageSquare className="h-5 w-5 text-purple-500" />;
      case "email":
        return <Mail className="h-5 w-5 text-orange-500" />;
      case "call":
        return <Phone className="h-5 w-5 text-teal-500" />;
      default:
        return <AlertCircle className="h-5 w-5 text-gray-500" />;
    }
  };

  const getTypeBadge = (type: string) => {
    const colors = {
      search_history: "bg-blue-100 text-blue-700",
      lead: "bg-green-100 text-green-700",
      sms: "bg-purple-100 text-purple-700",
      email: "bg-orange-100 text-orange-700",
      call: "bg-teal-100 text-teal-700",
    };
    return colors[type as keyof typeof colors] || "bg-gray-100 text-gray-700";
  };

  const getTypeLabel = (type: string) => {
    return type === "search_history" ? "Search" : type.charAt(0).toUpperCase() + type.slice(1);
  };

  // Filter items
  const filteredItems = items.filter((item) => {
    const matchesSearch = 
      item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.subtitle.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === "all" || item.type === filterType;
    return matchesSearch && matchesType;
  });

  return (
    <>
      <Toaster position="top-right" />
      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Recycle Bin</h1>
              <p className="text-sm text-gray-600 mt-1">
                Items are permanently deleted after 30 days
              </p>
            </div>
            {items.length > 0 && (
              <button
                onClick={handleEmptyRecycleBin}
                disabled={isEmptying}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
              >
                {isEmptying ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Empty Recycle Bin
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6 flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search deleted items..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Type Filter */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Types</option>
            <option value="search_history">Search History</option>
            <option value="lead">Leads</option>
            <option value="sms">SMS</option>
            <option value="email">Emails</option>
            <option value="call">Calls</option>
          </select>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        )}

        {/* Empty State */}
        {!isLoading && items.length === 0 && (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-white rounded-full mb-6 shadow-lg">
              <Trash2 className="w-10 h-10 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Recycle Bin is Empty
            </h3>
            <p className="text-sm text-gray-600">
              Deleted items will appear here and can be restored within 30 days
            </p>
          </div>
        )}

        {/* Items List */}
        {!isLoading && filteredItems.length > 0 && (
          <div className="space-y-3">
            {filteredItems.map((item) => (
              <div
                key={`${item.type}-${item.id}`}
                className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className="mt-1">{getTypeIcon(item.type)}</div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900 truncate">
                        {item.title}
                      </h3>
                      <span className={`text-xs px-2 py-1 rounded ${getTypeBadge(item.type)}`}>
                        {getTypeLabel(item.type)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 truncate mb-2">
                      {item.subtitle}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>
                        Deleted {new Date(item.deleted_at).toLocaleDateString()}
                      </span>
                      <span className={item.daysRemaining <= 7 ? "text-red-600 font-semibold" : ""}>
                        {item.daysRemaining} days remaining
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleRestore(item)}
                      className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm"
                      title="Restore"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Restore
                    </button>
                    <button
                      onClick={() => handlePermanentDelete(item)}
                      className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2 text-sm"
                      title="Delete Permanently"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* No Results from Filter */}
        {!isLoading && items.length > 0 && filteredItems.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-600">No items match your search or filter</p>
          </div>
        )}
      </div>
    </>
  );
}

