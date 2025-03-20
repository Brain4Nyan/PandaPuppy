import React from 'react';
import Select from 'react-select';
import { SelectOption } from '../utils/classificationMatcher';

interface SearchableSelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  isDisabled?: boolean;
  error?: string;
  confidence?: number;
  suggestions?: SelectOption[];
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({
  value,
  options,
  onChange,
  placeholder = 'Select...',
  isDisabled = false,
  error,
  confidence,
  suggestions = []
}) => {
  const selectedOption = options.find(option => option.value === value) || null;

  const customStyles = {
    control: (base: any, state: any) => ({
      ...base,
      minHeight: '32px',
      backgroundColor: 'white',
      borderColor: error ? '#EF4444' : state.isFocused ? '#3B82F6' : '#E5E7EB',
      '&:hover': {
        borderColor: error ? '#DC2626' : '#D1D5DB'
      },
      boxShadow: error ? '0 0 0 1px #EF4444' : state.isFocused ? '0 0 0 1px #3B82F6' : 'none'
    }),
    menu: (base: any) => ({
      ...base,
      zIndex: 50
    }),
    menuList: (base: any) => ({
      ...base,
      maxHeight: '200px'
    }),
    option: (base: any, state: any) => ({
      ...base,
      backgroundColor: state.isSelected ? '#3B82F6' : state.isFocused ? '#EFF6FF' : 'white',
      color: state.isSelected ? 'white' : '#374151',
      '&:active': {
        backgroundColor: '#2563EB'
      }
    })
  };

  return (
    <div className="w-full">
      {suggestions.length > 0 && (
        <div className="mb-2">
          <p className="text-sm text-gray-600 mb-1">Suggestions:</p>
          <div className="space-y-1">
            {suggestions.map((suggestion, index) => (
              <button
                key={index}
                onClick={() => onChange(suggestion.value)}
                className="text-sm text-blue-600 hover:text-blue-800 block"
              >
                {suggestion.label}
              </button>
            ))}
          </div>
        </div>
      )}
      
      <Select
        value={selectedOption}
        onChange={(option) => onChange(option?.value || 'UNKNOWN')}
        options={[
          { value: 'UNKNOWN', label: 'UNKNOWN' },
          ...options
        ]}
        placeholder={placeholder}
        isDisabled={isDisabled}
        className="min-w-[200px]"
        classNamePrefix="react-select"
        isClearable={false}
        isSearchable={true}
        menuPlacement="auto"
        styles={customStyles}
      />

      {confidence !== undefined && (
        <div className="mt-1">
          <div className="flex items-center gap-2">
            <div className="h-2 flex-grow bg-gray-200 rounded-full overflow-hidden">
              <div 
                className={`h-full ${confidence >= 0.7 ? 'bg-green-500' : confidence >= 0.4 ? 'bg-yellow-500' : 'bg-red-500'}`}
                style={{ width: `${confidence * 100}%` }}
              />
            </div>
            <span className="text-xs text-gray-600">
              {(confidence * 100).toFixed(0)}% confidence
            </span>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
};

export default SearchableSelect;