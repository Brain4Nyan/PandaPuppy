import * as XLSX from 'xlsx';
import { classifyEntry, ClassifiedEntry } from './accountingRules';

interface ExcelData {
  entries: ClassifiedEntry[];
  hasExistingClassification: boolean;
  stats: {
    totalRows: number;
    autoClassified: number;
    preClassified: number;
    needsReview: number;
  };
}

export function processExcelFile(file: File): Promise<ExcelData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData: any[] = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

        // Find header row
        const headerRow = findHeaderRow(jsonData);
        if (headerRow === -1) {
          throw new Error('Could not find header row in Excel file');
        }

        // Check if file has existing Credit/Debit classification
        const headers = jsonData[headerRow].map((h: string) => 
          h?.toString().toLowerCase().trim()
        );
        const hasExistingClassification = 
          headers.includes('credit') && headers.includes('debit');

        const stats = {
          totalRows: 0,
          autoClassified: 0,
          preClassified: 0,
          needsReview: 0
        };

        const entries: ClassifiedEntry[] = [];

        // Process data rows
        for (let i = headerRow + 1; i < jsonData.length; i++) {
          const row = jsonData[i];
          if (!shouldProcessRow(row)) continue;

          stats.totalRows++;

          const entryName = row[0]?.toString() || '';
          const accountType = determineAccountType(i, jsonData);
          
          if (hasExistingClassification) {
            // Use existing classification
            const debit = parseFloat(row[1]) || 0;
            const credit = parseFloat(row[2]) || 0;
            
            entries.push({
              entryName,
              amount: debit || credit,
              debitAmount: debit || null,
              creditAmount: credit || null,
              accountType,
              classification: debit > 0 ? 'Debit' : 'Credit',
              needsReview: false
            });
            stats.preClassified++;
          } else {
            // Auto-classify based on amount
            const amount = parseFloat(row[1]) || 0;
            if (amount !== 0) {
              const entry = classifyEntry(entryName, amount, accountType);
              entries.push({
                ...entry,
                debitAmount: entry.classification === 'Debit' ? Math.abs(amount) : null,
                creditAmount: entry.classification === 'Credit' ? Math.abs(amount) : null
              });
              
              if (entry.needsReview) {
                stats.needsReview++;
              } else {
                stats.autoClassified++;
              }
            }
          }
        }

        resolve({
          entries,
          hasExistingClassification,
          stats
        });
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsArrayBuffer(file);
  });
}

function findHeaderRow(data: any[]): number {
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (row && (row.some((cell: any) => 
      typeof cell === 'string' && 
      ['account', 'debit', 'credit', 'amount'].some(header => 
        cell.toLowerCase().includes(header)
      )
    ))) {
      return i;
    }
  }
  return -1;
}

function shouldProcessRow(row: any[]): boolean {
  if (!row || !row[0]) return false;
  
  const description = row[0].toString().toLowerCase().trim();
  
  const skipKeywords = [
    'assets',
    'liabilities',
    'equity',
    'income',
    'revenue',
    'expense',
    'cost',
    'total',
    'net'
  ];
  
  return !skipKeywords.some(keyword => description.includes(keyword));
}

function determineAccountType(rowIndex: number, data: any[]): string {
  for (let i = rowIndex - 1; i >= 0; i--) {
    const row = data[i];
    if (!row || !row[0]) continue;
    
    const cellValue = row[0].toString().toLowerCase().trim();
    
    if (cellValue.includes('assets')) return 'Asset';
    if (cellValue.includes('liabilities')) return 'Liability';
    if (cellValue.includes('equity')) return 'Equity';
    if (cellValue.includes('income') || cellValue.includes('revenue')) return 'Revenue/Income';
    if (cellValue.includes('expense') || cellValue.includes('cost')) return 'Cost/Expense';
  }
  
  return 'Unknown';
}