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

interface SheetAnalysis {
  isBalanceSheet: boolean;
  confidence: number;
}

export function analyzeSheet(sheet: XLSX.WorkSheet): SheetAnalysis {
  const balanceSheetKeywords = [
    'balance sheet',
    'statement of financial position',
    'assets and liabilities',
    'financial position',
    'bs',
    'balance',
    'tb',
    'trial balance'
  ];

  const jsonData: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  const firstFewRows = jsonData.slice(0, 5).flat().map(cell => 
    cell?.toString().toLowerCase().trim() || ''
  );

  let confidence = 0;
  
  // Check for balance sheet keywords
  const hasKeywords = firstFewRows.some(cell =>
    balanceSheetKeywords.some(keyword => cell.includes(keyword))
  );
  if (hasKeywords) confidence += 0.6;

  // Check for typical trial balance columns
  const headers = jsonData[0]?.map((h: any) => (h?.toString() || '').toLowerCase().trim());
  const hasDebitCredit = headers?.some(h => h.includes('debit') || h.includes('credit'));
  if (hasDebitCredit) confidence += 0.4;

  // Check for assets and liabilities/equity
  const hasAssets = firstFewRows.some(cell => cell.includes('assets'));
  const hasLiabilities = firstFewRows.some(cell => 
    cell.includes('liabilities') || cell.includes('equity')
  );
  if (hasAssets && hasLiabilities) confidence += 0.4;

  return {
    isBalanceSheet: confidence > 0,
    confidence
  };
}

export function processExcelFile(
  file: File, 
  selectedSheet?: string
): Promise<{ data: ExcelData; sheets: Array<{ name: string; isBalanceSheet: boolean; confidence: number }> }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
        // Analyze all sheets
        const sheets = workbook.SheetNames.map(name => {
          const sheet = workbook.Sheets[name];
          const analysis = analyzeSheet(sheet);
          return {
            name,
            isBalanceSheet: analysis.isBalanceSheet,
            confidence: analysis.confidence
          };
        });

        // Use selected sheet or find best match
        const sheetToUse = selectedSheet || sheets.reduce((best, current) => 
          current.confidence > (best?.confidence || 0) ? current : best
        , sheets[0]).name;

        const sheet = workbook.Sheets[sheetToUse];
        const jsonData: any[] = XLSX.utils.sheet_to_json(sheet, { 
          header: 1,
          raw: false,
          defval: ''
        });

        // Find header row and column indices
        const headerRow = findHeaderRow(jsonData);
        if (headerRow === -1) {
          throw new Error('Could not find header row in Excel file');
        }

        const headers = jsonData[headerRow].map((h: string) => 
          h?.toString().toLowerCase().trim()
        );

        // Find relevant column indices
        const accountCol = headers.findIndex(h => h.includes('account') && !h.includes('type'));
        const typeCol = headers.findIndex(h => h.includes('type'));
        const debitCol = headers.findIndex(h => h.includes('debit'));
        const creditCol = headers.findIndex(h => h.includes('credit'));

        if (accountCol === -1) {
          throw new Error('Could not find account column');
        }

        const hasExistingClassification = debitCol !== -1 && creditCol !== -1;

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

          const entryName = row[accountCol]?.toString().trim() || '';
          if (!entryName) continue;

          const accountType = typeCol !== -1 ? 
            row[typeCol]?.toString().trim() || determineAccountType(i, jsonData) :
            determineAccountType(i, jsonData);

          if (hasExistingClassification) {
            // Parse debit and credit values, handling currency formatting
            const debit = parseFloat(row[debitCol]?.toString().replace(/[^0-9.-]/g, '') || '0');
            const credit = parseFloat(row[creditCol]?.toString().replace(/[^0-9.-]/g, '') || '0');
            
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
            const amount = parseFloat(row[1]?.toString().replace(/[^0-9.-]/g, '') || '0');
            if (amount !== 0) {
              const entry = classifyEntry(entryName, amount, accountType);
              entries.push(entry);
              
              if (entry.needsReview) {
                stats.needsReview++;
              } else {
                stats.autoClassified++;
              }
            }
          }
        }

        resolve({
          data: {
            entries,
            hasExistingClassification,
            stats
          },
          sheets
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
  const headerKeywords = ['account', 'debit', 'credit', 'amount', 'type'];
  
  for (let i = 0; i < Math.min(10, data.length); i++) {
    const row = data[i];
    if (row && (row.some((cell: any) => 
      typeof cell === 'string' && 
      headerKeywords.some(keyword => 
        cell.toLowerCase().includes(keyword)
      )
    ))) {
      return i;
    }
  }
  return 0; // Default to first row if no header found
}

function shouldProcessRow(row: any[]): boolean {
  if (!row || !row[0]) return false;
  
  const description = row[0].toString().toLowerCase().trim();
  
  // Skip totals and section headers
  if (description.includes('total') || description === '') return false;
  
  // Skip if all values in the row are empty
  const hasValues = row.some((cell, index) => 
    index > 0 && cell && cell.toString().trim() !== ''
  );
  
  return hasValues;
}

function determineAccountType(rowIndex: number, data: any[]): string {
  const accountTypeMap: { [key: string]: string } = {
    'revenue': 'Revenue/Income',
    'income': 'Revenue/Income',
    'expense': 'Cost/Expense',
    'cost': 'Cost/Expense',
    'asset': 'Asset',
    'bank': 'Asset',
    'liability': 'Liability',
    'equity': 'Equity',
    'capital': 'Equity'
  };

  // Check the current row's account type if available
  const currentRow = data[rowIndex];
  if (currentRow && currentRow[1]) {
    const typeCell = currentRow[1].toString().toLowerCase().trim();
    for (const [keyword, type] of Object.entries(accountTypeMap)) {
      if (typeCell.includes(keyword)) {
        return type;
      }
    }
  }

  // Look for context in previous rows
  for (let i = rowIndex - 1; i >= 0; i--) {
    const row = data[i];
    if (!row || !row[0]) continue;
    
    const cellValue = row[0].toString().toLowerCase().trim();
    for (const [keyword, type] of Object.entries(accountTypeMap)) {
      if (cellValue.includes(keyword)) {
        return type;
      }
    }
  }
  
  return 'Unknown';
}