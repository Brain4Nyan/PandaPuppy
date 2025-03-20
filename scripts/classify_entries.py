import pandas as pd
import numpy as np
from pathlib import Path
import json
from typing import Dict, List, Tuple
import re

def normalize_text(text: str) -> str:
    """Normalize text for comparison."""
    if not isinstance(text, str):
        return ""
    return re.sub(r'\s+', ' ', str(text).lower().strip())

def calculate_similarity(text1: str, text2: str) -> float:
    """Calculate Jaccard similarity between two texts."""
    set1 = set(normalize_text(text1).split())
    set2 = set(normalize_text(text2).split())
    
    if not set1 or not set2:
        return 0.0
        
    intersection = len(set1.intersection(set2))
    union = len(set1.union(set2))
    return intersection / union if union > 0 else 0.0

def find_best_match(entry: str, classifications: pd.DataFrame) -> Tuple[Dict, float]:
    """Find the best matching classification for an entry."""
    entry = normalize_text(entry)
    max_similarity = 0
    best_match = None
    
    for _, row in classifications.iterrows():
        # Calculate similarity for each classification level
        primary_sim = calculate_similarity(entry, row['Primary Classification'])
        secondary_sim = calculate_similarity(entry, row['Secondary Classification'])
        tertiary_sim = calculate_similarity(entry, row['Tertiary Classification'])
        
        # Use the maximum similarity among all levels
        similarity = max(primary_sim, secondary_sim, tertiary_sim)
        
        if similarity > max_similarity:
            max_similarity = similarity
            best_match = {
                'accountType': row['Account Type'],
                'primaryClassification': row['Primary Classification'],
                'secondaryClassification': row['Secondary Classification'],
                'tertiaryClassification': row['Tertiary Classification']
            }
    
    return best_match, max_similarity

def classify_entries(entries_df: pd.DataFrame, classifications_df: pd.DataFrame) -> List[Dict]:
    """Classify all entries using the classification tree."""
    results = []
    
    for _, row in entries_df.iterrows():
        entry_name = row['Entry Name']
        account_type = row['Account Type']
        
        # Filter classifications by account type
        relevant_classifications = classifications_df[
            classifications_df['Account Type'].str.lower() == account_type.lower()
        ]
        
        if relevant_classifications.empty:
            # No matching classifications found
            classification = {
                'entryName': entry_name,
                'accountType': account_type,
                'primaryClassification': 'UNKNOWN',
                'secondaryClassification': 'UNKNOWN',
                'tertiaryClassification': 'UNKNOWN',
                'confidence': 0.0,
                'masterSheet': f"{account_type} Master Sheet"
            }
        else:
            # Find best matching classification
            best_match, confidence = find_best_match(entry_name, relevant_classifications)
            
            classification = {
                'entryName': entry_name,
                'accountType': account_type,
                'primaryClassification': best_match['primaryClassification'],
                'secondaryClassification': best_match['secondaryClassification'],
                'tertiaryClassification': best_match['tertiaryClassification'],
                'confidence': confidence,
                'masterSheet': f"{account_type} Master Sheet"
            }
        
        results.append(classification)
    
    return results

def main():
    # Load classification tree
    classifications_path = Path('public/classification_tree.csv')
    classifications_df = pd.read_csv(classifications_path)
    
    # Load sample entries (you would replace this with your actual entries)
    entries_data = {
        'Entry Name': ['Cash in Bank', 'Accounts Receivable', 'Office Equipment'],
        'Account Type': ['Asset', 'Asset', 'Asset']
    }
    entries_df = pd.DataFrame(entries_data)
    
    # Classify entries
    results = classify_entries(entries_df, classifications_df)
    
    # Save results to JSON
    output_path = Path('public/classified_entries.json')
    with output_path.open('w') as f:
        json.dump(results, f, indent=2)

if __name__ == '__main__':
    main()