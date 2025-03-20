import React from 'react';

interface MatchLogProps {
  logs: MatchLogEntry[];
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

const MatchLog: React.FC<MatchLogProps> = ({ logs }) => {
  if (logs.length === 0) return null;

  return (
    <div className="mt-8 bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-bold text-gray-800 mb-4">Classification Match Log</h2>
      <div className="space-y-6">
        {logs.map((log, index) => (
          <div key={index} className="border-b border-gray-200 pb-4 last:border-b-0 last:pb-0">
            <h3 className="font-semibold text-gray-700">Entry: {log.entryName}</h3>
            <p className="text-sm text-gray-600 mt-1">Searched text: {log.searchedText}</p>
            <p className="text-sm text-gray-600">Words analyzed: {log.words.join(', ')}</p>
            {log.matchDirection && (
              <p className="text-sm text-gray-600">Match direction: {log.matchDirection}</p>
            )}
            
            {log.possibleMatches.length > 0 ? (
              <div className="mt-2">
                <p className="text-sm font-medium text-gray-700">Possible matches:</p>
                <ul className="mt-1 space-y-2">
                  {log.possibleMatches.map((match, matchIndex) => (
                    <li key={matchIndex} className="text-sm text-gray-600">
                      <div>
                        {match.text} ({match.matchType} match, {match.matchLevel} level
                        {match.matchDirection && `, ${match.matchDirection} direction`})
                      </div>
                      <div className="text-gray-500">
                        Confidence: {(match.confidence * 100).toFixed(1)}%
                        {match.matchedWords && (
                          <span className="ml-2">
                            Matched words: {match.matchedWords.join(', ')}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-2 text-sm text-gray-600 italic">No close matches found</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default MatchLog;