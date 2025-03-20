import React from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';

interface ClassificationStatsProps {
  stats: {
    totalRows: number;
    autoClassified: number;
    preClassified: number;
    needsReview: number;
  };
  hasExistingClassification: boolean;
}

const ClassificationStats: React.FC<ClassificationStatsProps> = ({
  stats,
  hasExistingClassification
}) => {
  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <h2 className="text-xl font-semibold text-gray-800 mb-4">
        Classification Summary
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-blue-50 p-4 rounded-lg">
          <div className="text-blue-600 text-2xl font-bold">{stats.totalRows}</div>
          <div className="text-blue-800">Total Entries</div>
        </div>

        {hasExistingClassification ? (
          <div className="bg-green-50 p-4 rounded-lg">
            <div className="text-green-600 text-2xl font-bold">
              {stats.preClassified}
            </div>
            <div className="text-green-800">Pre-classified Entries</div>
          </div>
        ) : (
          <div className="bg-green-50 p-4 rounded-lg">
            <div className="text-green-600 text-2xl font-bold">
              {stats.autoClassified}
            </div>
            <div className="text-green-800">Auto-classified Entries</div>
          </div>
        )}

        <div className="bg-yellow-50 p-4 rounded-lg">
          <div className="text-yellow-600 text-2xl font-bold">
            {stats.needsReview}
          </div>
          <div className="text-yellow-800">Needs Review</div>
        </div>

        <div className="bg-purple-50 p-4 rounded-lg">
          <div className="text-purple-600 text-2xl font-bold">
            {((stats.autoClassified + stats.preClassified) / stats.totalRows * 100).toFixed(1)}%
          </div>
          <div className="text-purple-800">Classification Rate</div>
        </div>
      </div>

      {stats.needsReview > 0 && (
        <div className="mt-4 p-4 bg-yellow-50 rounded-lg flex items-center">
          <AlertCircle className="w-5 h-5 text-yellow-500 mr-2" />
          <span className="text-yellow-700">
            {stats.needsReview} entries need review. Please check the flagged rows below.
          </span>
        </div>
      )}

      {stats.needsReview === 0 && (
        <div className="mt-4 p-4 bg-green-50 rounded-lg flex items-center">
          <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
          <span className="text-green-700">
            All entries have been successfully classified!
          </span>
        </div>
      )}
    </div>
  );
};

export default ClassificationStats;