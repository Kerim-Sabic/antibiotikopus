/**
 * Horalix Drug Navigator Component
 *
 * Dual-tier medication navigator:
 * - Tab 1: Antibiotics with WHO AWaRe classification
 * - Tab 2: Other medications by therapeutic category (ATC)
 */

'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Filter, AlertTriangle, CheckCircle, AlertCircle } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useMedications } from '@/hooks/useMedications';
import { MedicationCard } from './MedicationCard';
import { MedicationDetails } from './MedicationDetails';
import type { Medication, AWaReCategory } from '@/types';

interface DrugNavigatorProps {
  onSelect?: (medication: Medication) => void;
  patientId?: string;
  diagnosis?: string;
}

export function DrugNavigator({ onSelect, patientId, diagnosis }: DrugNavigatorProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'antibiotics' | 'other'>('antibiotics');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAWaRe, setSelectedAWaRe] = useState<AWaReCategory | 'all'>('all');
  const [selectedMedication, setSelectedMedication] = useState<Medication | null>(null);

  const {
    antibioticsByAWaRe,
    searchMedications,
    isLoading,
  } = useMedications();

  const handleMedicationClick = (med: Medication) => {
    setSelectedMedication(med);
  };

  const handleMedicationSelect = (med: Medication) => {
    onSelect?.(med);
    setSelectedMedication(null);
  };

  return (
    <div className="w-full h-full flex flex-col bg-white rounded-lg shadow-lg">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          {t('drugNavigator.title')}
        </h2>
        <p className="text-sm text-gray-600">
          {t('drugNavigator.subtitle')}
        </p>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          {/* Tab Navigation */}
          <div className="px-6 pt-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="antibiotics" className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                {t('drugNavigator.tabs.antibiotics')}
              </TabsTrigger>
              <TabsTrigger value="other" className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                {t('drugNavigator.tabs.other')}
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Search and Filters */}
          <div className="px-6 py-4 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                type="text"
                placeholder={t('drugNavigator.search.placeholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {activeTab === 'antibiotics' && (
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedAWaRe('all')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedAWaRe === 'all'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {t('drugNavigator.filters.all')}
                </button>
                <button
                  onClick={() => setSelectedAWaRe('ACCESS')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedAWaRe === 'ACCESS'
                      ? 'bg-green-600 text-white'
                      : 'bg-green-50 text-green-700 hover:bg-green-100'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    {t('drugNavigator.awaRe.access')}
                  </span>
                </button>
                <button
                  onClick={() => setSelectedAWaRe('WATCH')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedAWaRe === 'WATCH'
                      ? 'bg-yellow-600 text-white'
                      : 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    {t('drugNavigator.awaRe.watch')}
                  </span>
                </button>
                <button
                  onClick={() => setSelectedAWaRe('RESERVE')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedAWaRe === 'RESERVE'
                      ? 'bg-red-600 text-white'
                      : 'bg-red-50 text-red-700 hover:bg-red-100'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    {t('drugNavigator.awaRe.reserve')}
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-auto px-6 pb-6">
            <TabsContent value="antibiotics" className="mt-0">
              <AntibioticsTab
                awaRe={selectedAWaRe}
                searchQuery={searchQuery}
                onMedicationClick={handleMedicationClick}
                antibioticsByAWaRe={antibioticsByAWaRe}
                isLoading={isLoading}
              />
            </TabsContent>

            <TabsContent value="other" className="mt-0">
              <OtherMedicationsTab
                searchQuery={searchQuery}
                onMedicationClick={handleMedicationClick}
                isLoading={isLoading}
              />
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {/* Medication Details Modal */}
      {selectedMedication && (
        <MedicationDetails
          medication={selectedMedication}
          patientId={patientId}
          onClose={() => setSelectedMedication(null)}
          onSelect={handleMedicationSelect}
        />
      )}
    </div>
  );
}

// Antibiotics Tab Component
function AntibioticsTab({
  awaRe,
  searchQuery,
  onMedicationClick,
  antibioticsByAWaRe,
  isLoading,
}: any) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Filter based on AWaRe category and search
  let medications: Medication[] = [];
  if (awaRe === 'all') {
    medications = [
      ...(antibioticsByAWaRe?.access || []),
      ...(antibioticsByAWaRe?.watch || []),
      ...(antibioticsByAWaRe?.reserve || []),
    ];
  } else {
    medications = antibioticsByAWaRe?.[awaRe.toLowerCase()] || [];
  }

  if (searchQuery) {
    medications = medications.filter(
      (med) =>
        med.genericName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        med.brandName?.toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }

  return (
    <div className="space-y-4">
      {/* AWaRe Category Info */}
      {awaRe !== 'all' && (
        <Card className="p-4 bg-blue-50 border-blue-200">
          <h3 className="font-semibold text-blue-900 mb-2">
            {t(`drugNavigator.awaRe.${awaRe.toLowerCase()}`)} {t('drugNavigator.awaRe.category')}
          </h3>
          <p className="text-sm text-blue-700">
            {t(`drugNavigator.awaRe.${awaRe.toLowerCase()}_description`)}
          </p>
        </Card>
      )}

      {/* Medication Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {medications.map((med) => (
          <MedicationCard
            key={med.id}
            medication={med}
            onClick={() => onMedicationClick(med)}
          />
        ))}
      </div>

      {medications.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          {t('drugNavigator.noResults')}
        </div>
      )}
    </div>
  );
}

// Other Medications Tab Component
function OtherMedicationsTab({ searchQuery, onMedicationClick, isLoading }: any) {
  const { t } = useTranslation();
  const { searchMedications } = useMedications();

  // Search non-antibiotic medications
  const { data: searchResults, isLoading: searching } = searchMedications(
    { query: searchQuery, isAntibiotic: false },
    { enabled: searchQuery.length >= 2 },
  );

  if (isLoading || searching) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const medications = searchResults?.medications || [];

  return (
    <div className="space-y-4">
      {searchQuery.length < 2 ? (
        <div className="text-center py-12 text-gray-500">
          {t('drugNavigator.other.searchPrompt')}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {medications.map((med) => (
            <MedicationCard
              key={med.id}
              medication={med}
              onClick={() => onMedicationClick(med)}
            />
          ))}
        </div>
      )}

      {searchQuery.length >= 2 && medications.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          {t('drugNavigator.noResults')}
        </div>
      )}
    </div>
  );
}

function AWaReBadge({ category }: { category: AWaReCategory }) {
  const { t } = useTranslation();

  const styles = {
    ACCESS: 'bg-green-100 text-green-800 border-green-300',
    WATCH: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    RESERVE: 'bg-red-100 text-red-800 border-red-300',
    NOT_APPLICABLE: 'bg-gray-100 text-gray-800 border-gray-300',
  };

  return (
    <Badge className={`${styles[category]} border`}>
      {t(`drugNavigator.awaRe.${category.toLowerCase()}`)}
    </Badge>
  );
}
