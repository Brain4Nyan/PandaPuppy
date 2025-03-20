import React from 'react';
import SearchableSelect from './SearchableSelect';
import { Classification, SelectOption } from '../utils/classificationMatcher';

interface ClassificationFormProps {
  classification: Classification;
  onChange: (field: keyof Classification, value: string) => void;
  accountTypeOptions: SelectOption[];
  primaryOptions: SelectOption[];
  secondaryOptions: SelectOption[];
  tertiaryOptions: SelectOption[];
  suggestions?: {
    accountType?: SelectOption[];
    primary?: SelectOption[];
    secondary?: SelectOption[];
    tertiary?: SelectOption[];
  };
  errors?: {
    accountType?: string;
    primary?: string;
    secondary?: string;
    tertiary?: string;
  };
}

const ClassificationForm: React.FC<ClassificationFormProps> = ({
  classification,
  onChange,
  accountTypeOptions,
  primaryOptions,
  secondaryOptions,
  tertiaryOptions,
  suggestions,
  errors
}) => {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Account Type
        </label>
        <SearchableSelect
          value={classification.accountType}
          options={accountTypeOptions}
          onChange={(value) => onChange('accountType', value)}
          placeholder="Select Account Type"
          suggestions={suggestions?.accountType}
          error={errors?.accountType}
          confidence={classification.confidence}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Primary Classification
        </label>
        <SearchableSelect
          value={classification.primaryClassification}
          options={primaryOptions}
          onChange={(value) => onChange('primaryClassification', value)}
          placeholder="Select Primary Classification"
          isDisabled={classification.accountType === 'UNKNOWN'}
          suggestions={suggestions?.primary}
          error={errors?.primary}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Secondary Classification
        </label>
        <SearchableSelect
          value={classification.secondaryClassification}
          options={secondaryOptions}
          onChange={(value) => onChange('secondaryClassification', value)}
          placeholder="Select Secondary Classification"
          isDisabled={classification.primaryClassification === 'UNKNOWN'}
          suggestions={suggestions?.secondary}
          error={errors?.secondary}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Tertiary Classification
        </label>
        <SearchableSelect
          value={classification.tertiaryClassification}
          options={tertiaryOptions}
          onChange={(value) => onChange('tertiaryClassification', value)}
          placeholder="Select Tertiary Classification"
          isDisabled={classification.secondaryClassification === 'UNKNOWN'}
          suggestions={suggestions?.tertiary}
          error={errors?.tertiary}
        />
      </div>
    </div>
  );
};

export default ClassificationForm;