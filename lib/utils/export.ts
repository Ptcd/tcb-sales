import Papa from "papaparse";
import * as XLSX from "xlsx";
import { BusinessResult } from "@/lib/types";

export function exportToCSV(
  data: BusinessResult[],
  filename: string = "google-maps-results"
) {
  // Map data to ensure all columns are included (same as Excel export)
  const mappedData = data.map((item) => ({
    id: item.id || "",
    name: item.name || "",
    address: item.address || "",
    phone: item.phone || "",
    email: item.email || "",
    website: item.website || "",
    rating: item.rating || "",
    reviewCount: item.reviewCount || "",
    placeId: item.placeId || "",
    latitude: item.latitude || "",
    longitude: item.longitude || "",
  }));

  const csv = Papa.unparse(mappedData);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `${filename}.csv`);
}

export function exportToExcel(
  data: BusinessResult[],
  filename: string = "google-maps-results"
) {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Results");

  // Generate buffer
  const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  const blob = new Blob([excelBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  downloadBlob(blob, `${filename}.xlsx`);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}
