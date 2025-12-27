"use client";

import { useState, useEffect } from "react";
import {
  Phone,
  Plus,
  Search,
  Trash2,
  Edit2,
  Check,
  X,
  MessageSquare,
  PhoneCall,
  AlertCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import { LoadingSpinner } from "@/components/LoadingSpinner";

interface TwilioNumber {
  sid: string;
  phoneNumber: string;
  friendlyName: string;
  capabilities: {
    voice: boolean;
    sms: boolean;
    mms: boolean;
  };
  dateCreated?: string;
}

interface AvailableNumber {
  phoneNumber: string;
  friendlyName: string;
  capabilities: {
    voice: boolean;
    sms: boolean;
    mms: boolean;
  };
  locality?: string;
  region?: string;
  postalCode?: string;
}

export default function PhoneNumbersPage() {
  const [numbers, setNumbers] = useState<TwilioNumber[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [editingSid, setEditingSid] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  useEffect(() => {
    fetchNumbers();
  }, []);

  const fetchNumbers = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/twilio/numbers");
      if (!response.ok) throw new Error("Failed to fetch phone numbers");

      const data = await response.json();
      setNumbers(data.numbers || []);
    } catch (error) {
      console.error("Error fetching phone numbers:", error);
      toast.error("Failed to load phone numbers");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRelease = async (sid: string, phoneNumber: string) => {
    if (
      !confirm(
        `Are you sure you want to release ${phoneNumber}? This action cannot be undone.`
      )
    ) {
      return;
    }

    try {
      const response = await fetch(`/api/twilio/numbers/${sid}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to release phone number");

      toast.success("Phone number released successfully");
      fetchNumbers();
    } catch (error) {
      console.error("Error releasing phone number:", error);
      toast.error("Failed to release phone number");
    }
  };

  const handleUpdateName = async (sid: string) => {
    if (!editingName.trim()) {
      toast.error("Friendly name cannot be empty");
      return;
    }

    try {
      const response = await fetch(`/api/twilio/numbers/${sid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ friendlyName: editingName }),
      });

      if (!response.ok) throw new Error("Failed to update phone number");

      toast.success("Phone number updated successfully");
      setEditingSid(null);
      setEditingName("");
      fetchNumbers();
    } catch (error) {
      console.error("Error updating phone number:", error);
      toast.error("Failed to update phone number");
    }
  };

  const startEditing = (number: TwilioNumber) => {
    setEditingSid(number.sid);
    setEditingName(number.friendlyName);
  };

  const cancelEditing = () => {
    setEditingSid(null);
    setEditingName("");
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Phone className="h-8 w-8 text-blue-600" />
                <h1 className="text-3xl font-bold text-gray-900">
                  Phone Numbers
                </h1>
              </div>
              <p className="text-gray-600">
                Manage your Twilio phone numbers for calls and SMS
              </p>
            </div>
            <button
              onClick={() => setShowPurchaseModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Plus className="h-5 w-5" />
              Add Number
            </button>
          </div>
        </div>

        {/* Info Banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">About Twilio Phone Numbers</p>
              <p>
                Purchase phone numbers to use as your outbound caller ID for
                calls and SMS. Numbers typically cost $1-2/month plus usage
                fees.
              </p>
            </div>
          </div>
        </div>

        {/* Numbers List */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center">
              <LoadingSpinner />
              <p className="text-gray-500 mt-2">Loading phone numbers...</p>
            </div>
          ) : numbers.length === 0 ? (
            <div className="p-8 text-center">
              <Phone className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                No Phone Numbers
              </h3>
              <p className="text-gray-600 mb-4">
                Purchase a phone number to start making calls and sending SMS
              </p>
              <button
                onClick={() => setShowPurchaseModal(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Purchase Your First Number
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Phone Number
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Friendly Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Capabilities
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Added
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {numbers.map((number) => (
                    <tr key={number.sid} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center text-sm font-medium text-gray-900">
                          <Phone className="h-4 w-4 text-gray-400 mr-2" />
                          {number.phoneNumber}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {editingSid === number.sid ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              className="px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              autoFocus
                            />
                            <button
                              onClick={() => handleUpdateName(number.sid)}
                              className="p-1 text-green-600 hover:bg-green-50 rounded"
                              title="Save"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              onClick={cancelEditing}
                              className="p-1 text-gray-600 hover:bg-gray-50 rounded"
                              title="Cancel"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-900">
                              {number.friendlyName}
                            </span>
                            <button
                              onClick={() => startEditing(number)}
                              className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded"
                              title="Edit name"
                            >
                              <Edit2 className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {number.capabilities.voice && (
                            <span className="inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                              <PhoneCall className="h-3 w-3 mr-1" />
                              Voice
                            </span>
                          )}
                          {number.capabilities.sms && (
                            <span className="inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                              <MessageSquare className="h-3 w-3 mr-1" />
                              SMS
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(number.dateCreated)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button
                          onClick={() =>
                            handleRelease(number.sid, number.phoneNumber)
                          }
                          className="text-red-600 hover:text-red-900 flex items-center gap-1"
                        >
                          <Trash2 className="h-4 w-4" />
                          Release
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Purchase Modal */}
        {showPurchaseModal && (
          <PurchaseNumberModal
            onClose={() => setShowPurchaseModal(false)}
            onPurchased={() => {
              setShowPurchaseModal(false);
              fetchNumbers();
            }}
          />
        )}
      </div>
    </div>
  );
}

interface PurchaseNumberModalProps {
  onClose: () => void;
  onPurchased: () => void;
}

function PurchaseNumberModal({
  onClose,
  onPurchased,
}: PurchaseNumberModalProps) {
  const [areaCode, setAreaCode] = useState("");
  const [numberType, setNumberType] = useState<"local" | "tollfree">("local");
  const [availableNumbers, setAvailableNumbers] = useState<AvailableNumber[]>(
    []
  );
  const [isSearching, setIsSearching] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState<string | null>(null);

  const handleSearch = async () => {
    if (numberType === "local" && !areaCode) {
      toast.error("Please enter an area code");
      return;
    }

    setIsSearching(true);
    try {
      const response = await fetch("/api/twilio/numbers/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          areaCode: numberType === "local" ? areaCode : undefined,
          type: numberType,
        }),
      });

      if (!response.ok) throw new Error("Failed to search phone numbers");

      const data = await response.json();
      setAvailableNumbers(data.numbers || []);

      if (data.numbers.length === 0) {
        toast.error("No numbers found. Try a different area code.");
      }
    } catch (error) {
      console.error("Error searching phone numbers:", error);
      toast.error("Failed to search phone numbers");
    } finally {
      setIsSearching(false);
    }
  };

  const handlePurchase = async (phoneNumber: string) => {
    setIsPurchasing(phoneNumber);
    try {
      const response = await fetch("/api/twilio/numbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber,
          friendlyName: phoneNumber,
        }),
      });

      if (!response.ok) throw new Error("Failed to purchase phone number");

      toast.success("Phone number purchased successfully!");
      onPurchased();
    } catch (error) {
      console.error("Error purchasing phone number:", error);
      toast.error("Failed to purchase phone number");
      setIsPurchasing(null);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">
              Purchase Phone Number
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Search Form */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Number Type
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="local"
                      checked={numberType === "local"}
                      onChange={(e) =>
                        setNumberType(e.target.value as "local" | "tollfree")
                      }
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-700">
                      Local Number (~$1/mo)
                    </span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="tollfree"
                      checked={numberType === "tollfree"}
                      onChange={(e) =>
                        setNumberType(e.target.value as "local" | "tollfree")
                      }
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-700">
                      Toll-Free (~$2/mo)
                    </span>
                  </label>
                </div>
              </div>

              {numberType === "local" && (
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-2">
                    Area Code
                  </label>
                  <input
                    type="text"
                    value={areaCode}
                    onChange={(e) =>
                      setAreaCode(e.target.value.replace(/\D/g, "").slice(0, 3))
                    }
                    placeholder="e.g., 414 for Milwaukee"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    maxLength={3}
                  />
                </div>
              )}

              <button
                onClick={handleSearch}
                disabled={isSearching}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {isSearching ? (
                  <>
                    <LoadingSpinner />
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="h-5 w-5" />
                    Search Available Numbers
                  </>
                )}
              </button>
            </div>

            {/* Available Numbers */}
            {availableNumbers.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-gray-900">
                  Available Numbers ({availableNumbers.length})
                </h4>
                <div className="max-h-96 overflow-y-auto space-y-2">
                  {availableNumbers.map((number) => (
                    <div
                      key={number.phoneNumber}
                      className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
                    >
                      <div>
                        <div className="font-medium text-gray-900">
                          {number.phoneNumber}
                        </div>
                        {number.locality && (
                          <div className="text-sm text-gray-600">
                            {number.locality}, {number.region}
                          </div>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          {number.capabilities.voice && (
                            <span className="text-xs px-2 py-0.5 bg-green-100 text-green-800 rounded">
                              Voice
                            </span>
                          )}
                          {number.capabilities.sms && (
                            <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-800 rounded">
                              SMS
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handlePurchase(number.phoneNumber)}
                        disabled={isPurchasing !== null}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                      >
                        {isPurchasing === number.phoneNumber
                          ? "Purchasing..."
                          : "Purchase"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
