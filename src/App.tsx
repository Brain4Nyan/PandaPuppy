import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Upload, Download, AlertCircle } from 'lucide-react';

interface TableRow {
  entryName: string;
  debit: number;
  credit: number;
}

function App() {
  const [tableData, setTableData] = useState<TableRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const processExcelFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData: any[] = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

        // Process the data
        const processedData: TableRow[] = [];
        let headerRow = -1;

        // Find the header row
        for (let i = 0; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (row && (row.some(cell => 
            typeof cell === 'string' && 
            ['account', 'debit', 'credit'].some(header => 
              cell.toLowerCase().includes(header)
            )
          ))) {
            headerRow = i;
            break;
          }
        }

        if (headerRow === -1) {
          throw new Error('Could not find header row in Excel file');
        }

        // Process the data rows
        for (let i = headerRow + 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!row || row.length === 0) continue;

          const entryName = row[0]?.toString() || '';
          if (!entryName || entryName.toLowerCase().includes('total')) continue;

          const debit = parseFloat(row[1]) || 0;
          const credit = parseFloat(row[2]) || 0;

          if (entryName && (debit !== 0 || credit !== 0)) {
            processedData.push({ entryName, debit, credit });
          }
        }

        setTableData(processedData);
        setError(null);
      } catch (err) {
        setError('Unable to process the file. Please upload a valid Excel file.');
        setTableData([]);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type.includes('excel') || file.name.match(/\.(xls|xlsx)$/)) {
        processExcelFile(file);
      } else {
        setError('Please upload a valid Excel file (.xls or .xlsx)');
      }
    }
  };

  const downloadTable = (format: 'xlsx' | 'csv') => {
    if (tableData.length === 0) return;

    const worksheet = XLSX.utils.json_to_sheet(tableData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Processed Data');

    const fileName = `processed_data.${format}`;
    XLSX.writeFile(workbook, fileName);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-800 mb-6">Excel File Processor</h1>
          
          {/* Upload Section */}
          <div className="mb-8">
            <label className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700 transition-colors">
              <Upload className="w-5 h-5 mr-2" />
              Upload Excel File
              <input
                type="file"
                className="hidden"
                accept=".xls,.xlsx"
                onChange={handleFileUpload}
              />
            </label>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg flex items-center">
              <AlertCircle className="w-5 h-5 mr-2" />
              {error}
            </div>
          )}

          {/* Table Display */}
          {tableData.length > 0 && (
            <div className="mb-6">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Entry Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Debit
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Credit
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {tableData.map((row, index) => (
                      <tr key={index}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {row.entryName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {row.debit.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {row.credit.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Download Buttons */}
              <div className="mt-6 flex gap-4">
                <button
                  onClick={() => downloadTable('xlsx')}
                  className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  <Download className="w-5 h-5 mr-2" />
                  Download Excel
                </button>
                <button
                  onClick={() => downloadTable('csv')}
                  className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  <Download className="w-5 h-5 mr-2" />
                  Download CSV
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;