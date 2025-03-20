import Fuse from 'fuse.js';

export interface Classification {
  accountType: string;
  primaryClassification: string;
  secondaryClassification: string;
  tertiaryClassification: string;
  confidence?: number;
  matchDirection?: 'forward' | 'reverse' | 'word';
  matchSource?: 'primary' | 'secondary' | 'tertiary';
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

export class ClassificationMatcher {
  private classificationTree: ClassificationTree[];
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

  private searchAllColumns(text: string, classification: ClassificationTree): {
    found: boolean;
    level: 'primary' | 'secondary' | 'tertiary';
    confidence: number;
  } {
    const normalizedText = this.normalizeText(text);
    const pattern = this.createWordBoundaryPattern(normalizedText);

    if (pattern.test(this.normalizeText(classification.primary))) {
      return { found: true, level: 'primary', confidence: 1 };
    }

    if (pattern.test(this.normalizeText(classification.secondary))) {
      return { found: true, level: 'secondary', confidence: 0.9 };
    }

    if (pattern.test(this.normalizeText(classification.tertiary))) {
      return { found: true, level: 'tertiary', confidence: 0.8 };
    }

    return { found: false, level: 'primary', confidence: 0 };
  }

  private findWordMatches(words: string[], classification: ClassificationTree): {
    matchedWords: string[];
    level: 'primary' | 'secondary' | 'tertiary';
    confidence: number;
  } {
    const primaryWords = this.splitIntoWords(classification.primary);
    const secondaryWords = this.splitIntoWords(classification.secondary);
    const tertiaryWords = this.splitIntoWords(classification.tertiary);

    let bestMatch = {
      matchedWords: [] as string[],
      level: 'primary' as const,
      confidence: 0
    };

    const levels = [
      { words: primaryWords, level: 'primary' as const, weight: 1 },
      { words: secondaryWords, level: 'secondary' as const, weight: 0.9 },
      { words: tertiaryWords, level: 'tertiary' as const, weight: 0.8 }
    ];

    for (const { words: levelWords, level, weight } of levels) {
      const matches = words.filter(word => {
        const pattern = this.createWordBoundaryPattern(word);
        return levelWords.some(levelWord => 
          pattern.test(levelWord) || this.createWordBoundaryPattern(levelWord).test(word)
        );
      });

      if (matches.length > 0) {
        const confidence = (matches.length / Math.max(words.length, levelWords.length)) * weight;
        if (confidence > bestMatch.confidence) {
          bestMatch = { matchedWords: matches, level, confidence };
        }
      }
    }

    return bestMatch;
  }

  public findBestMatch(description: string, accountType: string): Classification {
    const normalizedDescription = this.normalizeText(description);
    
    // Check historical matches first
    const historicalMatch = this.historicalMatches.get(normalizedDescription);
    if (historicalMatch) {
      return {
        ...historicalMatch,
        confidence: 1,
        matchType: 'exact',
        matchSource: 'historical'
      };
    }

    const words = this.splitIntoWords(description);
    
    const relevantClassifications = this.classificationTree.filter(
      item => item.accountType.toLowerCase() === accountType.toLowerCase()
    );

    if (relevantClassifications.length === 0) {
      this.matchLogs.push({
        entryName: description,
        searchedText: normalizedDescription,
        words,
        possibleMatches: []
      });

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

    // Try exact phrase match
    const exactMatches = relevantClassifications
      .map(classification => {
        const match = this.searchAllColumns(description, classification);
        return {
          classification,
          ...match
        };
      })
      .filter(match => match.found)
      .sort((a, b) => b.confidence - a.confidence);

    if (exactMatches.length > 0) {
      const bestMatch = exactMatches[0];
      return {
        accountType,
        primaryClassification: bestMatch.classification.primary,
        secondaryClassification: bestMatch.classification.secondary,
        tertiaryClassification: bestMatch.classification.tertiary,
        confidence: bestMatch.confidence,
        matchType: 'exact',
        matchSource: bestMatch.level,
        possibleMatches: exactMatches.map(match => ({
          text: `${match.classification.primary} > ${match.classification.secondary} > ${match.classification.tertiary}`,
          confidence: match.confidence,
          matchType: 'exact',
          matchLevel: match.level
        }))
      };
    }

    // Try word-by-word matching
    const wordMatches = relevantClassifications
      .map(classification => {
        const match = this.findWordMatches(words, classification);
        return {
          classification,
          ...match
        };
      })
      .filter(match => match.matchedWords.length > 0)
      .sort((a, b) => b.confidence - a.confidence);

    if (wordMatches.length > 0) {
      const bestMatch = wordMatches[0];
      const possibleMatches = wordMatches.map(match => ({
        text: `${match.classification.primary} > ${match.classification.secondary} > ${match.classification.tertiary}`,
        confidence: match.confidence,
        matchType: 'word' as const,
        matchLevel: match.level,
        matchedWords: match.matchedWords
      }));

      this.matchLogs.push({
        entryName: description,
        searchedText: normalizedDescription,
        words,
        matchDirection: 'word',
        possibleMatches
      });

      if (bestMatch.confidence >= 0.4) {
        return {
          accountType,
          primaryClassification: bestMatch.classification.primary,
          secondaryClassification: bestMatch.classification.secondary,
          tertiaryClassification: bestMatch.classification.tertiary,
          confidence: bestMatch.confidence,
          matchType: 'word',
          matchSource: bestMatch.level,
          possibleMatches
        };
      }
    }

    // Try fuzzy matching as last resort
    const fuzzyResults = this.fuse.search(normalizedDescription);
    const possibleMatches = fuzzyResults
      .map(result => ({
        text: `${result.item.primary} > ${result.item.secondary} > ${result.item.tertiary}`,
        confidence: result.score ? Math.max(0, Math.min(1, 1 - result.score)) : 0,
        matchType: 'fuzzy' as const,
        matchLevel: 'primary' as const
      }))
      .filter(match => match.confidence > 0.3);

    this.matchLogs.push({
      entryName: description,
      searchedText: normalizedDescription,
      words,
      possibleMatches
    });

    if (fuzzyResults.length === 0 || fuzzyResults[0].score! > 0.6) {
      return {
        accountType,
        primaryClassification: 'UNKNOWN',
        secondaryClassification: 'UNKNOWN',
        tertiaryClassification: 'UNKNOWN',
        confidence: 0,
        matchType: 'none',
        possibleMatches
      };
    }

    const bestMatch = fuzzyResults[0];
    const confidence = bestMatch.score ? Math.max(0, Math.min(1, 1 - bestMatch.score)) : 0;

    return {
      accountType,
      primaryClassification: bestMatch.item.primary,
      secondaryClassification: bestMatch.item.secondary,
      tertiaryClassification: bestMatch.item.tertiary,
      confidence,
      matchType: 'fuzzy',
      possibleMatches
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