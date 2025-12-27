"use client";

import { useState, useEffect } from "react";
import { Download, RefreshCw, Calendar } from "lucide-react";
import toast from "react-hot-toast";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import Button from "@/components/Button";

interface PayrollEntry {
  userId: string;
  name: string;
  email: string;
  hourlyRate: number;
  hoursWorked: number;
  basePay: number;
  bonuses: number;
  totalPay: number;
}

interface PayrollData {
  startDate: string;
  endDate: string;
  payroll: PayrollEntry[];
  totals: {
    hoursWorked: number;
    basePay: number;
    bonuses: number;
    totalPay: number;
  };
}

export default function PayrollPage() {
  const [data, setData] = useState<PayrollData | null>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(() => {
    const today = new Date();
    const day = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
    return monday.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => {
    const today = new Date();
    const day = today.getDay();
    const friday = new Date(today);
    friday.setDate(today.getDate() + (5 - day));
    return friday.toISOString().split("T")[0];
  });

  useEffect(() => {
    fetchPayroll();
  }, [startDate, endDate]);

  const fetchPayroll = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/governance/payroll?start_date=${startDate}&end_date=${endDate}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setData(json);
    } catch (error) {
      toast.error("Failed to load payroll");
    } finally {
      setLoading(false);
    }
  };

  const exportCSV = () => {
    if (!data) return;
    const headers = ["Name", "Email", "Hours", "Rate", "Base Pay", "Bonuses", "Total"];
    const rows = data.payroll.map(p => [
      p.name,
      p.email,
      p.hoursWorked.toString(),
      p.hourlyRate.toString(),
      p.basePay.toFixed(2),
      p.bonuses.toFixed(2),
      p.totalPay.toFixed(2),
    ]);
    rows.push(["TOTALS", "", data.totals.hoursWorked.toString(), "", data.totals.basePay.toFixed(2), data.totals.bonuses.toFixed(2), data.totals.totalPay.toFixed(2)]);
    
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payroll-${startDate}-to-${endDate}.csv`;
    a.click();
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Weekly Payroll</h2>
          <p className="text-gray-600">Pay period: {startDate} to {endDate}</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchPayroll} variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          <Button onClick={exportCSV}>
            <Download className="w-4 h-4 mr-2" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Date Selector */}
      <div className="flex gap-4 items-center bg-white p-4 rounded-lg shadow">
        <Calendar className="w-5 h-5 text-gray-400" />
        <div>
          <label className="text-sm text-gray-600">Start</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
            className="ml-2 border rounded px-2 py-1" />
        </div>
        <div>
          <label className="text-sm text-gray-600">End</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
            className="ml-2 border rounded px-2 py-1" />
        </div>
      </div>

      {/* Payroll Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-6 py-3 text-sm font-semibold">Name</th>
              <th className="text-right px-6 py-3 text-sm font-semibold">Hours</th>
              <th className="text-right px-6 py-3 text-sm font-semibold">Rate</th>
              <th className="text-right px-6 py-3 text-sm font-semibold">Base Pay</th>
              <th className="text-right px-6 py-3 text-sm font-semibold">Bonuses</th>
              <th className="text-right px-6 py-3 text-sm font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {data?.payroll.map((p) => (
              <tr key={p.userId} className="border-t">
                <td className="px-6 py-4">
                  <div className="font-medium">{p.name}</div>
                  <div className="text-sm text-gray-500">{p.email}</div>
                </td>
                <td className="px-6 py-4 text-right">{p.hoursWorked}h</td>
                <td className="px-6 py-4 text-right">${p.hourlyRate}/hr</td>
                <td className="px-6 py-4 text-right">${p.basePay.toFixed(2)}</td>
                <td className="px-6 py-4 text-right text-green-600">${p.bonuses.toFixed(2)}</td>
                <td className="px-6 py-4 text-right font-bold">${p.totalPay.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-100 font-bold">
            <tr>
              <td className="px-6 py-4">TOTALS</td>
              <td className="px-6 py-4 text-right">{data?.totals.hoursWorked}h</td>
              <td className="px-6 py-4 text-right">—</td>
              <td className="px-6 py-4 text-right">${data?.totals.basePay.toFixed(2)}</td>
              <td className="px-6 py-4 text-right text-green-600">${data?.totals.bonuses.toFixed(2)}</td>
              <td className="px-6 py-4 text-right">${data?.totals.totalPay.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {data?.payroll.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          No payroll data for this period. Make sure time logs are entered.
        </div>
      )}
    </div>
  );
}


