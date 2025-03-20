import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Upload, Download, AlertCircle } from 'lucide-react';
import { ClassificationMatcher, Classification, MatchLogEntry } from './utils/classificationMatcher';
import SearchableSelect from './components/SearchableSelect';
import MatchLog from './components/MatchLog';

interface TableRow {
  entryName: string;
  debit: number;
  credit: number;
  primaryClassification: string;
  secondaryClassification: string;
  tertiaryClassification: string;
  accountType: string;
  flagStatus?: string;
  confidence?: number;
  matchDirection?: 'forward' | 'reverse' | 'word';
  matchType?: 'exact' | 'word' | 'fuzzy' | 'none';
}

function App() {
  const [tableData, setTableData] = useState<TableRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [classificationMatcher, setClassificationMatcher] = useState<ClassificationMatcher | null>(null);
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [editingClassification, setEditingClassification] = useState<Classification | null>(null);
  const [matchLogs, setMatchLogs] = useState<MatchLogEntry[]>([]);

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

  const determineAccountType = (rowIndex: number, allRows: any[]): string => {
    for (let i = rowIndex - 1; i >= 0; i--) {
      const currentRow = allRows[i];
      if (!currentRow || !currentRow[0]) continue;
      
      const cellValue = currentRow[0].toString().toLowerCase().trim();
      
      if (cellValue.includes('assets')) return 'Asset';
      if (cellValue.includes('liabilities')) return 'Liability';
      if (cellValue.includes('equity')) return 'Equity';
      if (cellValue.includes('income') || cellValue.includes('revenue')) return 'Revenue/Income';
      if (cellValue.includes('expense') || cellValue.includes('cost')) return 'Cost/Expense';
    }
    
    return 'UNKNOWN';
  };

  const shouldProcessRow = (row: any[]): boolean => {
    if (!row || !row[0]) return false;
    
    const description = row[0].toString().toLowerCase().trim();
    
    if (
      description.includes('assets') ||
      description.includes('liabilities') ||
      description.includes('equity') ||
      description.includes('income') ||
      description.includes('revenue') ||
      description.includes('expense') ||
      description.includes('cost') ||
      description.includes('total') ||
      description.includes('net')
    ) {
      return false;
    }
    
    return true;
  };

  const processExcelFile = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData: any[] = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

        if (classificationMatcher) {
          classificationMatcher.clearMatchLogs();
        }

        const processedData: TableRow[] = [];
        let headerRow = -1;

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

        for (let i = headerRow + 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!shouldProcessRow(row)) continue;

          const entryName = row[0]?.toString() || '';
          const debit = parseFloat(row[1]) || 0;
          const credit = parseFloat(row[2]) || 0;

          if (entryName && (debit !== 0 || credit !== 0)) {
            const accountType = determineAccountType(i, jsonData);
            
            let classification: Classification = {
              accountType,
              primaryClassification: 'UNKNOWN',
              secondaryClassification: 'UNKNOWN',
              tertiaryClassification: 'UNKNOWN',
              confidence: 0
            };

            if (classificationMatcher) {
              try {
                classification = await classificationMatcher.findBestMatch(entryName, accountType);
              } catch (error) {
                console.error('Error classifying entry:', error);
              }
            }
            
            processedData.push({
              entryName,
              debit,
              credit,
              ...classification,
              flagStatus: classification.confidence && classification.confidence < 0.6 ? 'Needs Classification Review' : undefined
            });
          }
        }

        setTableData(processedData);
        if (classificationMatcher) {
          setMatchLogs(classificationMatcher.getMatchLogs());
        }
        setError(null);
      } catch (err) {
        setError('Unable to process the file. Please upload a valid Excel file.');
        setTableData([]);
        setMatchLogs([]);
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

  const handleEditClick = (index: number) => {
    setEditingRow(index);
    setEditingClassification({
      accountType: tableData[index].accountType,
      primaryClassification: tableData[index].primaryClassification,
      secondaryClassification: tableData[index].secondaryClassification,
      tertiaryClassification: tableData[index].tertiaryClassification,
      confidence: 1
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
    }
    setEditingRow(null);
    setEditingClassification(null);
  };

  const handleCancelClick = () => {
    setEditingRow(null);
    setEditingClassification(null);
  };

  const handleClassificationChange = (level: keyof Classification, value: string) => {
    if (!editingClassification || !classificationMatcher) return;

    const newClassification = { ...editingClassification };

    switch (level) {
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

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-800 mb-6">Financial Entry Classifier</h1>
          
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

          {error && (
            <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg flex items-center">
              <AlertCircle className="w-5 h-5 mr-2" />
              {error}
            </div>
          )}

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
                      <tr key={index} className={row.flagStatus ? 'bg-yellow-50' : ''}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {row.entryName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {row.debit.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {row.credit.toFixed(2)}
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
                          {row.confidence !== undefined ? `${(row.confidence * 100).toFixed(1)}%` : 'N/A'}
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

          {matchLogs.length > 0 && <MatchLog logs={matchLogs} />}
        </div>
      </div>
    </div>
  );
}

export default App;