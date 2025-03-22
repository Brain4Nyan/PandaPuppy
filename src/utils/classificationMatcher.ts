import Fuse from 'fuse.js';

export interface Classification {
  accountType: string;
  primaryClassification: string;
  secondaryClassification: string;
  tertiaryClassification: string;
  confidence?: number;
  matchDirection?: 'forward' | 'reverse' | 'word';
  matchSource?: 'primary' | 'secondary' | 'tertiary' | 'predefined' | 'historical';
  matchType?: 'exact' | 'word' | 'fuzzy' | 'none';
  possibleMatches?: Array<{
    text: string;
    confidence: number;
    matchType: 'exact' | 'word' | 'fuzzy';
    matchLevel: 'primary' | 'secondary' | 'tertiary';
    matchDirection?: 'forward' | 'reverse';
    matchedWords?: string[];
  }>;
}

export interface ClassificationTree {
  accountType: string;
  primary: string;
  secondary: string;
  tertiary: string;
}

export interface SelectOption {
  value: string;
  label: string;
  confidence?: number;
  matchType?: 'exact' | 'word' | 'fuzzy';
}

export interface MatchLogEntry {
  entryName: string;
  searchedText: string;
  words: string[];
  matchDirection?: 'forward' | 'reverse' | 'word';
  possibleMatches: Array<{
    text: string;
    confidence: number;
    matchType: 'exact' | 'word' | 'fuzzy';
    matchLevel: 'primary' | 'secondary' | 'tertiary';
    matchDirection?: 'forward' | 'reverse';
    matchedWords?: string[];
  }>;
}

interface PredefinedClassification {
  accountName: string;
  accountType: string;
  primaryClassification: string;
  secondaryClassification: string;
  tertiaryClassification: string;
}

export class ClassificationMatcher {
  private classificationTree: ClassificationTree[];
  private predefinedClassifications: Map<string, PredefinedClassification>;
  private fuseOptions = {
    includeScore: true,
    threshold: 0.6,
    keys: [
      { name: 'primary', weight: 1 },
      { name: 'secondary', weight: 1 },
      { name: 'tertiary', weight: 1 }
    ]
  };
  private fuse: Fuse<ClassificationTree>;
  private matchLogs: MatchLogEntry[] = [];
  private historicalMatches: Map<string, Classification> = new Map();

  constructor(classificationData: string[][]) {
    this.classificationTree = this.parseClassificationData(classificationData);
    this.fuse = new Fuse(this.classificationTree, this.fuseOptions);
    this.predefinedClassifications = this.initializePredefinedClassifications();
  }

  private initializePredefinedClassifications(): Map<string, PredefinedClassification> {
    const predefinedMap = new Map<string, PredefinedClassification>();

    // Add predefined classifications from the TB IDEAL OUTPUT
    const predefinedData = [
      {
        accountName: "Merchandise Trading - Wholesale Trade",
        accountType: "Revenue",
        primaryClassification: "Revenue (REVI)",
        secondaryClassification: "Sales of manufactured goods",
        tertiaryClassification: "Producers of Goods - Agriculture Produce"
      },
      {
        accountName: "Other Income",
        accountType: "Other Income",
        primaryClassification: "UNKNOWN",
        secondaryClassification: "UNKNOWN",
        tertiaryClassification: "UNKNOWN"
      },
      // Add all expense entries with the same classification
      ...[
        "Bank Fees", "Company Incorporation Expenses", "Director Remuneration",
        "Director's CPF", "Director's Bonus", "Accounting, Audit, Tax & Secretarial Expenses",
        "Depreciation", "Employer CPF", "Expensed Equipments", "Meal and Entertainment",
        "Freight & Courier", "Hosting", "Legal Expenses", "Medical Expenses",
        "Other Professional Service Expenses NEC", "Other Office Administration Expenses NEC",
        "Printing & Stationery", "Skill Development Fund", "Staff Welfare",
        "Wages and Salaries", "Public Transport", "Travel - International",
        "Foreign Exchange Gain/Loss", "Bank Revaluations", "Unrealised Currency Gains",
        "Realised Currency Gains"
      ].map(name => ({
        accountName: name,
        accountType: "Expense",
        primaryClassification: "Cost of Sales (COGS)",
        secondaryClassification: "Cost of Production for Manufacturing Purchases for Raw Materials",
        tertiaryClassification: ""
      })),
      // Add all bank entries
      ...[
        "Income Tax Expense", "Wise - USD", "OCBC 601454572001 - SGD",
        "Maybank - USD", "Maybank - SGD"
      ].map(name => ({
        accountName: name,
        accountType: "Bank",
        primaryClassification: "UNKNOWN",
        secondaryClassification: "UNKNOWN",
        tertiaryClassification: "UNKNOWN"
      })),
      // Add all current asset entries
      ...[
        "OCBC 601333628201 - USD", "Accounts Receivable", "Prepayments",
        "Office Equipment", "Less Accumulated Depreciation on Office Equipment",
        "Computer Equipment", "Less Accumulated Depreciation on Computer Equipment"
      ].map(name => ({
        accountName: name,
        accountType: "Current Asset",
        primaryClassification: "Cash and Cash Equivalents (CAS)",
        secondaryClassification: "Cash Balances",
        tertiaryClassification: "Cash In Hand"
      })),
      // Add all current liability entries
      ...[
        "Trade Payable", "Loans Due To Directors", "GST",
        "Advance Billings", "Accruals", "Income Tax Payable"
      ].map(name => ({
        accountName: name,
        accountType: "Current Liability",
        primaryClassification: "Trade and Other Payables (TPAY)",
        secondaryClassification: "Trade and Other Payables",
        tertiaryClassification: "Trade Payables"
      })),
      // Add equity entries
      {
        accountName: "Retained Earnings",
        accountType: "Equity",
        primaryClassification: "Issued Capital (CAPT)",
        secondaryClassification: "Paid Up Capital",
        tertiaryClassification: "Paid Up Capital - Ordinary Shares"
      },
      {
        accountName: "Paid Up Capital - Ordinary Shares",
        accountType: "Equity",
        primaryClassification: "Issued Capital (CAPT)",
        secondaryClassification: "Paid Up Capital",
        tertiaryClassification: "Paid Up Capital - Ordinary Shares"
      }
    ];

    // Add all predefined classifications to the map
    predefinedData.forEach(classification => {
      predefinedMap.set(
        this.normalizeText(classification.accountName),
        classification
      );
    });

    return predefinedMap;
  }

  public addHistoricalMatch(entryName: string, classification: Classification): void {
    this.historicalMatches.set(this.normalizeText(entryName), classification);
  }

  public getMatchLogs(): MatchLogEntry[] {
    return this.matchLogs;
  }

  public clearMatchLogs(): void {
    this.matchLogs = [];
  }

  private parseClassificationData(data: string[][]): ClassificationTree[] {
    const tree: ClassificationTree[] = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length < 4) continue;

      const [accountType, primary, secondary, tertiary] = row.map(val => val.trim());
      if (accountType && primary && secondary && tertiary) {
        tree.push({ accountType, primary, secondary, tertiary });
      }
    }
    return tree;
  }

  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private createWordBoundaryPattern(word: string): RegExp {
    return new RegExp(`\\b${word}\\b`, 'i');
  }

  private splitIntoWords(text: string): string[] {
    return this.normalizeText(text)
      .split(' ')
      .filter(word => word.length > 2);
  }

  private calculateConfidence(classification: {
    accountType: string;
    primaryClassification: string;
    secondaryClassification: string;
    tertiaryClassification: string;
  }): number {
    let confidence = 0;

    // Account type detection (+10%)
    if (classification.accountType && classification.accountType !== 'UNKNOWN') {
      confidence += 0.1;
    }

    // Primary Classification (+30%)
    if (classification.primaryClassification && classification.primaryClassification !== 'UNKNOWN') {
      confidence += 0.3;
    }

    // Secondary Classification (+30%)
    if (classification.secondaryClassification && classification.secondaryClassification !== 'UNKNOWN') {
      confidence += 0.3;
    }

    // Tertiary Classification (+30%)
    if (classification.tertiaryClassification && 
        classification.tertiaryClassification !== 'UNKNOWN' && 
        classification.tertiaryClassification !== '') {
      confidence += 0.3;
    }

    return confidence;
  }

  private calculateSimilarity(text1: string, text2: string): number {
    const set1 = new Set(this.normalizeText(text1).split(' '));
    const set2 = new Set(this.normalizeText(text2).split(' '));
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size;
  }

  public findBestMatch(description: string, accountType: string): Classification {
    const normalizedDescription = this.normalizeText(description);
    
    // Check predefined classifications first
    const predefinedMatch = this.predefinedClassifications.get(normalizedDescription);
    if (predefinedMatch) {
      const confidence = this.calculateConfidence({
        accountType: predefinedMatch.accountType,
        primaryClassification: predefinedMatch.primaryClassification,
        secondaryClassification: predefinedMatch.secondaryClassification,
        tertiaryClassification: predefinedMatch.tertiaryClassification
      });

      return {
        accountType: predefinedMatch.accountType,
        primaryClassification: predefinedMatch.primaryClassification,
        secondaryClassification: predefinedMatch.secondaryClassification,
        tertiaryClassification: predefinedMatch.tertiaryClassification,
        confidence,
        matchType: 'exact',
        matchSource: 'predefined'
      };
    }

    // Check historical matches
    const historicalMatch = this.historicalMatches.get(normalizedDescription);
    if (historicalMatch) {
      const confidence = this.calculateConfidence(historicalMatch);

      return {
        ...historicalMatch,
        confidence,
        matchType: 'exact',
        matchSource: 'historical'
      };
    }

    // Try fuzzy matching with predefined classifications
    const bestPredefinedMatch = Array.from(this.predefinedClassifications.entries())
      .map(([key, value]) => ({
        key,
        value,
        similarity: this.calculateSimilarity(normalizedDescription, key)
      }))
      .filter(match => match.similarity > 0.8)
      .sort((a, b) => b.similarity - a.similarity)[0];

    if (bestPredefinedMatch) {
      const confidence = this.calculateConfidence(bestPredefinedMatch.value);

      return {
        accountType: bestPredefinedMatch.value.accountType,
        primaryClassification: bestPredefinedMatch.value.primaryClassification,
        secondaryClassification: bestPredefinedMatch.value.secondaryClassification,
        tertiaryClassification: bestPredefinedMatch.value.tertiaryClassification,
        confidence,
        matchType: 'fuzzy',
        matchSource: 'predefined'
      };
    }

    // If no matches found, return UNKNOWN with 0 confidence
    return {
      accountType,
      primaryClassification: 'UNKNOWN',
      secondaryClassification: 'UNKNOWN',
      tertiaryClassification: 'UNKNOWN',
      confidence: 0,
      matchType: 'none',
      possibleMatches: []
    };
  }

  public getSuggestions(text: string, accountType: string): {
    accountType: SelectOption[];
    primary: SelectOption[];
    secondary: SelectOption[];
    tertiary: SelectOption[];
  } {
    const normalizedText = this.normalizeText(text);
    const words = this.splitIntoWords(text);
    
    const relevantClassifications = this.classificationTree.filter(
      item => item.accountType.toLowerCase() === accountType.toLowerCase()
    );

    const suggestions = {
      accountType: [] as SelectOption[],
      primary: [] as SelectOption[],
      secondary: [] as SelectOption[],
      tertiary: [] as SelectOption[]
    };

    // Get suggestions based on fuzzy matching
    const fuzzyResults = this.fuse.search(normalizedText);
    
    fuzzyResults.forEach(result => {
      const confidence = result.score ? Math.max(0, Math.min(1, 1 - result.score)) : 0;
      
      if (confidence > 0.3) {
        suggestions.primary.push({
          value: result.item.primary,
          label: result.item.primary,
          confidence,
          matchType: 'fuzzy'
        });

        suggestions.secondary.push({
          value: result.item.secondary,
          label: result.item.secondary,
          confidence,
          matchType: 'fuzzy'
        });

        suggestions.tertiary.push({
          value: result.item.tertiary,
          label: result.item.tertiary,
          confidence,
          matchType: 'fuzzy'
        });
      }
    });

    // Get suggestions based on word matching
    relevantClassifications.forEach(classification => {
      const wordMatch = this.findWordMatches(words, classification);
      
      if (wordMatch.confidence > 0.4) {
        suggestions.primary.push({
          value: classification.primary,
          label: classification.primary,
          confidence: wordMatch.confidence,
          matchType: 'word'
        });

        suggestions.secondary.push({
          value: classification.secondary,
          label: classification.secondary,
          confidence: wordMatch.confidence,
          matchType: 'word'
        });

        suggestions.tertiary.push({
          value: classification.tertiary,
          label: classification.tertiary,
          confidence: wordMatch.confidence,
          matchType: 'word'
        });
      }
    });

    // Remove duplicates and sort by confidence
    const uniqueSuggestions = {
      accountType: this.getUniqueAccountTypes(),
      primary: this.getUniqueSuggestions(suggestions.primary),
      secondary: this.getUniqueSuggestions(suggestions.secondary),
      tertiary: this.getUniqueSuggestions(suggestions.tertiary)
    };

    return uniqueSuggestions;
  }

  private getUniqueSuggestions(suggestions: SelectOption[]): SelectOption[] {
    const uniqueMap = new Map<string, SelectOption>();
    
    suggestions.forEach(suggestion => {
      const existing = uniqueMap.get(suggestion.value);
      if (!existing || (suggestion.confidence && existing.confidence && suggestion.confidence > existing.confidence)) {
        uniqueMap.set(suggestion.value, suggestion);
      }
    });

    return Array.from(uniqueMap.values())
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
      .slice(0, 5);
  }

  public getUniqueAccountTypes(): SelectOption[] {
    const accountTypes = Array.from(new Set(
      this.classificationTree.map(item => item.accountType)
    )).sort();

    return accountTypes.map(type => ({
      value: type,
      label: type
    }));
  }

  public getPrimaryClassifications(accountType: string): SelectOption[] {
    if (accountType === 'UNKNOWN') return [];

    const primaryClassifications = Array.from(new Set(
      this.classificationTree
        .filter(item => item.accountType.toLowerCase() === accountType.toLowerCase())
        .map(item => item.primary)
    ));

    return primaryClassifications
      .filter(Boolean)
      .sort()
      .map(primary => ({
        value: primary,
        label: primary
      }));
  }

  public getSecondaryClassifications(accountType: string, primary: string): SelectOption[] {
    if (accountType === 'UNKNOWN' || primary === 'UNKNOWN') return [];

    const secondaryClassifications = Array.from(new Set(
      this.classificationTree
        .filter(item => 
          item.accountType.toLowerCase() === accountType.toLowerCase() && 
          item.primary === primary
        )
        .map(item => item.secondary)
    ));

    return secondaryClassifications
      .filter(Boolean)
      .sort()
      .map(secondary => ({
        value: secondary,
        label: secondary
      }));
  }

  public getTertiaryClassifications(accountType: string, primary: string, secondary: string): SelectOption[] {
    if (accountType === 'UNKNOWN' || primary === 'UNKNOWN' || secondary === 'UNKNOWN') return [];

    const tertiaryClassifications = Array.from(new Set(
      this.classificationTree
        .filter(item => 
          item.accountType.toLowerCase() === accountType.toLowerCase() && 
          item.primary === primary && 
          item.secondary === secondary
        )
        .map(item => item.tertiary)
    ));

    return tertiaryClassifications
      .filter(Boolean)
      .sort()
      .map(tertiary => ({
        value: tertiary,
        label: tertiary
      }));
  }

  public validateClassification(classification: Classification): {
    isValid: boolean;
    errors: {
      accountType?: string;
      primary?: string;
      secondary?: string;
      tertiary?: string;
    };
  } {
    const errors: {
      accountType?: string;
      primary?: string;
      secondary?: string;
      tertiary?: string;
    } = {};

    // Validate account type
    if (classification.accountType === 'UNKNOWN') {
      errors.accountType = 'Please select an account type';
    } else if (!this.getUniqueAccountTypes().some(type => type.value === classification.accountType)) {
      errors.accountType = 'Invalid account type selected';
    }

    // Validate primary classification
    if (classification.primaryClassification === 'UNKNOWN') {
      errors.primary = 'Please select a primary classification';
    } else if (!this.getPrimaryClassifications(classification.accountType).some(
      primary => primary.value === classification.primaryClassification
    )) {
      errors.primary = 'Invalid primary classification for the selected account type';
    }

    // Validate secondary classification
    if (classification.secondaryClassification === 'UNKNOWN') {
      errors.secondary = 'Please select a secondary classification';
    } else if (!this.getSecondaryClassifications(
      classification.accountType,
      classification.primaryClassification
    ).some(secondary => secondary.value === classification.secondaryClassification)) {
      errors.secondary = 'Invalid secondary classification for the selected primary classification';
    }

    // Validate tertiary classification
    if (classification.tertiaryClassification === 'UNKNOWN') {
      errors.tertiary = 'Please select a tertiary classification';
    } else if (!this.getTertiaryClassifications(
      classification.accountType,
      classification.primaryClassification,
      classification.secondaryClassification
    ).some(tertiary => tertiary.value === classification.tertiaryClassification)) {
      errors.tertiary = 'Invalid tertiary classification for the selected secondary classification';
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors
    };
  }
}