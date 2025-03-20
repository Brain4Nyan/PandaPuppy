import React, { useState, useEffect } from 'react';
import { Upload, Download, AlertCircle, Star, FileSpreadsheet } from 'lucide-react';
import { ClassificationMatcher } from './utils/classificationMatcher';
import { processExcelFile } from './utils/excelProcessor';
import { ClassifiedEntry } from './utils/accountingRules';
import SearchableSelect from './components/SearchableSelect';
import ClassificationStats from './components/ClassificationStats';
import * as XLSX from 'xlsx';

interface TableRow extends ClassifiedEntry {
  primaryClassification: string;
  secondaryClassification: string;
  tertiaryClassification: string;
  confidence?: number;
  flagStatus?: string;
}

interface ColumnOption {
  key: keyof TableRow;
  label: string;
  recommended?: boolean;
}

interface SheetInfo {
  name: string;
  isBalanceSheet: boolean;
  confidence: number;
}

const COLUMN_OPTIONS: ColumnOption[] = [
  { key: 'entryName', label: 'Entry Name', recommended: true },
  { key: 'debitAmount', label: 'Debit', recommended: true },
  { key: 'creditAmount', label: 'Credit', recommended: true },
  { key: 'accountType', label: 'Account Type' },
  { key: 'primaryClassification', label: 'Primary Classification' },
  { key: 'secondaryClassification', label: 'Secondary Classification' },
  { key: 'tertiaryClassification', label: 'Tertiary Classification' },
  { key: 'confidence', label: 'Confidence' },
  { key: 'flagStatus', label: 'Flag Status' }
];

function App() {
  const [tableData, setTableData] = useState<TableRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [classificationMatcher, setClassificationMatcher] = useState<ClassificationMatcher | null>(null);
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [editingClassification, setEditingClassification] = useState<{
    accountType: string;
    primaryClassification: string;
    secondaryClassification: string;
    tertiaryClassification: string;
  } | null>(null);
  const [stats, setStats] = useState({
    totalRows: 0,
    autoClassified: 0,
    preClassified: 0,
    needsReview: 0
  });
  const [hasExistingClassification, setHasExistingClassification] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState<Set<keyof TableRow>>(
    new Set(COLUMN_OPTIONS.filter(col => col.recommended).map(col => col.key))
  );
  const [availableSheets, setAvailableSheets] = useState<SheetInfo[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [currentFile, setCurrentFile] = useState<File | null>(null);

  useEffect(() => {
    fetch('/automa8e_tree.csv')
      .then(response => response.text())
      .then(csvText => {
        const rows = csvText.split('\n').map(row => row.split(','));
        setClassificationMatcher(new ClassificationMatcher(rows));
      })
      .catch(err => {
        console.error('Error loading classification data:', err);
        setError('Failed to load classification data');
      });
  }, []);

  const processFile = async (file: File, sheet?: string) => {
    try {
      const { data, sheets } = await processExcelFile(file, sheet);
      setAvailableSheets(sheets);
      
      if (!sheet) {
        // If no sheet is selected, use the one with highest confidence
        const bestSheet = sheets.reduce((best, current) => 
          current.confidence > (best?.confidence || 0) ? current : best
        , sheets[0]);
        setSelectedSheet(bestSheet.name);
      }

      const processedData: TableRow[] = data.entries.map(entry => {
        let classification = classificationMatcher?.findBestMatch(entry.entryName, entry.accountType);
        
        let flagStatus: string | undefined;
        if (entry.needsReview) {
          flagStatus = 'Needs Classification Review';
        } else if (classification?.confidence !== undefined && classification.confidence < 0.4) {
          flagStatus = 'Low Confidence Match';
        }

        return {
          ...entry,
          primaryClassification: classification?.primaryClassification || 'UNKNOWN',
          secondaryClassification: classification?.secondaryClassification || 'UNKNOWN',
          tertiaryClassification: classification?.tertiaryClassification || 'UNKNOWN',
          confidence: classification?.confidence,
          flagStatus
        };
      });

      const updatedStats = {
        ...data.stats,
        needsReview: processedData.filter(row => row.flagStatus !== undefined).length
      };

      setTableData(processedData);
      setStats(updatedStats);
      setHasExistingClassification(data.hasExistingClassification);
      setError(null);
    } catch (err) {
      setError('Unable to process the file. Please check the format and try again.');
      setTableData([]);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.match(/\.(xls|xlsx)$/)) {
      setError('Please upload a valid Excel file (.xls or .xlsx)');
      return;
    }

    setCurrentFile(file);
    await processFile(file);
  };

  const handleSheetChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    const sheet = event.target.value;
    setSelectedSheet(sheet);
    if (currentFile) {
      await processFile(currentFile, sheet);
    }
  };

  const handleEditClick = (index: number) => {
    const row = tableData[index];
    setEditingRow(index);
    setEditingClassification({
      accountType: row.accountType,
      primaryClassification: row.primaryClassification,
      secondaryClassification: row.secondaryClassification,
      tertiaryClassification: row.tertiaryClassification
    });
  };

  const handleSaveClick = (index: number) => {
    if (editingClassification) {
      const newData = [...tableData];
      newData[index] = {
        ...newData[index],
        ...editingClassification,
        flagStatus: undefined
      };
      setTableData(newData);
      setEditingRow(null);
      setEditingClassification(null);
    }
  };

  const handleCancelClick = () => {
    setEditingRow(null);
    setEditingClassification(null);
  };

  const handleClassificationChange = (field: keyof typeof editingClassification, value: string) => {
    if (!editingClassification) return;

    const newClassification = { ...editingClassification };

    switch (field) {
      case 'accountType':
        newClassification.accountType = value;
        newClassification.primaryClassification = 'UNKNOWN';
        newClassification.secondaryClassification = 'UNKNOWN';
        newClassification.tertiaryClassification = 'UNKNOWN';
        break;
      case 'primaryClassification':
        newClassification.primaryClassification = value;
        newClassification.secondaryClassification = 'UNKNOWN';
        newClassification.tertiaryClassification = 'UNKNOWN';
        break;
      case 'secondaryClassification':
        newClassification.secondaryClassification = value;
        newClassification.tertiaryClassification = 'UNKNOWN';
        break;
      case 'tertiaryClassification':
        newClassification.tertiaryClassification = value;
        break;
    }

    setEditingClassification(newClassification);
  };

  const handleColumnToggle = (column: keyof TableRow) => {
    const newSelectedColumns = new Set(selectedColumns);
    if (newSelectedColumns.has(column)) {
      newSelectedColumns.delete(column);
    } else {
      newSelectedColumns.add(column);
    }
    setSelectedColumns(newSelectedColumns);
  };

  const downloadTable = (format: 'xlsx' | 'csv') => {
    if (tableData.length === 0 || selectedColumns.size === 0) return;

    const filteredData = tableData.map(row => {
      const filteredRow: Partial<TableRow> = {};
      selectedColumns.forEach(column => {
        filteredRow[column] = row[column];
      });
      return filteredRow;
    });

    const worksheet = XLSX.utils.json_to_sheet(filteredData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Processed Data');

    const fileName = `processed_data.${format}`;
    XLSX.writeFile(workbook, fileName);
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            Accounting Report Standardizer
          </h1>
          <p className="text-lg text-gray-600 mb-8">
            Flawlessly Converting Various Accounting Reports to Automa8e Format!
          </p>
          
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

            {availableSheets.length > 0 && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Sheet to Process
                </label>
                <div className="flex items-center space-x-2">
                  <FileSpreadsheet className="w-5 h-5 text-gray-500" />
                  <select
                    value={selectedSheet}
                    onChange={handleSheetChange}
                    className="block w-64 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  >
                    {availableSheets.map((sheet, index) => (
                      <option key={index} value={sheet.name}>
                        {sheet.name} {sheet.isBalanceSheet ? '(Balance Sheet)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg flex items-center">
              <AlertCircle className="w-5 h-5 mr-2" />
              {error}
            </div>
          )}

          {tableData.length > 0 && (
            <>
              <ClassificationStats
                stats={stats}
                hasExistingClassification={hasExistingClassification}
              />

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
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Account Type
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Primary Classification
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Secondary Classification
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Tertiary Classification
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Confidence
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Flag Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {tableData.map((row, index) => (
                      <tr
                        key={index}
                        className={row.flagStatus ? 'bg-yellow-50' : ''}
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {row.entryName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {row.debitAmount?.toFixed(2) || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {row.creditAmount?.toFixed(2) || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {editingRow === index ? (
                            <SearchableSelect
                              value={editingClassification?.accountType || 'UNKNOWN'}
                              options={classificationMatcher?.getUniqueAccountTypes() || []}
                              onChange={(value) => handleClassificationChange('accountType', value)}
                            />
                          ) : (
                            row.accountType
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {editingRow === index ? (
                            <SearchableSelect
                              value={editingClassification?.primaryClassification || 'UNKNOWN'}
                              options={classificationMatcher?.getPrimaryClassifications(editingClassification?.accountType || '') || []}
                              onChange={(value) => handleClassificationChange('primaryClassification', value)}
                              isDisabled={editingClassification?.accountType === 'UNKNOWN'}
                            />
                          ) : (
                            row.primaryClassification
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {editingRow === index ? (
                            <SearchableSelect
                              value={editingClassification?.secondaryClassification || 'UNKNOWN'}
                              options={classificationMatcher?.getSecondaryClassifications(
                                editingClassification?.accountType || '',
                                editingClassification?.primaryClassification || ''
                              ) || []}
                              onChange={(value) => handleClassificationChange('secondaryClassification', value)}
                              isDisabled={editingClassification?.primaryClassification === 'UNKNOWN'}
                            />
                          ) : (
                            row.secondaryClassification
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {editingRow === index ? (
                            <SearchableSelect
                              value={editingClassification?.tertiaryClassification || 'UNKNOWN'}
                              options={classificationMatcher?.getTertiaryClassifications(
                                editingClassification?.accountType || '',
                                editingClassification?.primaryClassification || '',
                                editingClassification?.secondaryClassification || ''
                              ) || []}
                              onChange={(value) => handleClassificationChange('tertiaryClassification', value)}
                              isDisabled={editingClassification?.secondaryClassification === 'UNKNOWN'}
                            />
                          ) : (
                            row.tertiaryClassification
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {row.confidence !== undefined
                            ? `${(row.confidence * 100).toFixed(1)}%`
                            : 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600">
                          {row.flagStatus}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {editingRow === index ? (
                            <div className="flex space-x-2">
                              <button
                                onClick={() => handleSaveClick(index)}
                                className="text-green-600 hover:text-green-900"
                              >
                                Save
                              </button>
                              <button
                                onClick={handleCancelClick}
                                className="text-red-600 hover:text-red-900"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleEditClick(index)}
                              className="text-blue-600 hover:text-blue-900"
                            >
                              Edit
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-6">
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">Select Columns to Export</h3>
                  <div className="flex flex-wrap gap-3">
                    {COLUMN_OPTIONS.map((column) => (
                      <label
                        key={column.key}
                        className={`inline-flex items-center px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                          selectedColumns.has(column.key)
                            ? 'bg-blue-50 border-blue-500 text-blue-700'
                            : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="hidden"
                          checked={selectedColumns.has(column.key)}
                          onChange={() => handleColumnToggle(column.key)}
                        />
                        <span className="flex items-center">
                          {column.label}
                          {column.recommended && (
                            <Star className="w-4 h-4 ml-1 text-yellow-500 fill-current" />
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex gap-4">
                  <button
                    onClick={() => downloadTable('xlsx')}
                    className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={selectedColumns.size === 0}
                  >
                    <Download className="w-5 h-5 mr-2" />
                    Download Excel
                  </button>
                  <button
                    onClick={() => downloadTable('csv')}
                    className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={selectedColumns.size === 0}
                  >
                    <Download className="w-5 h-5 mr-2" />
                    Download CSV
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;