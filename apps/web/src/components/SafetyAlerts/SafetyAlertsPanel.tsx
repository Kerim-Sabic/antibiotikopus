/**
 * Horalix Safety Alerts Panel
 *
 * Displays clinical decision support alerts with:
 * - Color-coded severity indicators
 * - Detailed rationale and recommendations
 * - Override capability (with justification required)
 */

'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  AlertCircle,
  Info,
  XCircle,
  CheckCircle,
  Shield,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { SafetyAlert, AlertType, AlertSeverity } from '@/types';

interface SafetyAlertsPanelProps {
  alerts: SafetyAlert[];
  onOverride?: (alertId: string, reason: string) => Promise<void>;
  readonly?: boolean;
}

export function SafetyAlertsPanel({
  alerts,
  onOverride,
  readonly = false,
}: SafetyAlertsPanelProps) {
  const { t } = useTranslation();
  const [selectedAlert, setSelectedAlert] = useState<SafetyAlert | null>(null);

  if (alerts.length === 0) {
    return (
      <Card className="p-6 bg-green-50 border-green-200">
        <div className="flex items-center gap-3">
          <CheckCircle className="w-6 h-6 text-green-600" />
          <div>
            <h3 className="font-semibold text-green-900">
              {t('safetyAlerts.noAlerts.title')}
            </h3>
            <p className="text-sm text-green-700">
              {t('safetyAlerts.noAlerts.message')}
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const criticalAlerts = alerts.filter((a) => a.severity === 'CRITICAL');
  const warningAlerts = alerts.filter((a) => a.severity === 'WARNING');
  const infoAlerts = alerts.filter((a) => a.severity === 'INFO');

  return (
    <div className="space-y-4">
      {/* Summary Header */}
      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center gap-3">
          <Shield className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-gray-900">
            {t('safetyAlerts.title')}
          </h3>
        </div>
        <div className="flex gap-3 text-sm">
          {criticalAlerts.length > 0 && (
            <span className="flex items-center gap-1 text-red-600 font-medium">
              <XCircle className="w-4 h-4" />
              {criticalAlerts.length} {t('safetyAlerts.critical')}
            </span>
          )}
          {warningAlerts.length > 0 && (
            <span className="flex items-center gap-1 text-yellow-600 font-medium">
              <AlertTriangle className="w-4 h-4" />
              {warningAlerts.length} {t('safetyAlerts.warning')}
            </span>
          )}
          {infoAlerts.length > 0 && (
            <span className="flex items-center gap-1 text-blue-600 font-medium">
              <Info className="w-4 h-4" />
              {infoAlerts.length} {t('safetyAlerts.info')}
            </span>
          )}
        </div>
      </div>

      {/* Critical Alerts (always shown first) */}
      {criticalAlerts.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-semibold text-red-900 flex items-center gap-2">
            <XCircle className="w-5 h-5" />
            {t('safetyAlerts.criticalAlerts')}
          </h4>
          {criticalAlerts.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              onViewDetails={() => setSelectedAlert(alert)}
              onOverride={onOverride}
              readonly={readonly}
            />
          ))}
        </div>
      )}

      {/* Warning Alerts */}
      {warningAlerts.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-semibold text-yellow-900 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            {t('safetyAlerts.warnings')}
          </h4>
          {warningAlerts.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              onViewDetails={() => setSelectedAlert(alert)}
              onOverride={onOverride}
              readonly={readonly}
            />
          ))}
        </div>
      )}

      {/* Info Alerts */}
      {infoAlerts.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-semibold text-blue-900 flex items-center gap-2">
            <Info className="w-5 h-5" />
            {t('safetyAlerts.information')}
          </h4>
          {infoAlerts.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              onViewDetails={() => setSelectedAlert(alert)}
              onOverride={onOverride}
              readonly={readonly}
            />
          ))}
        </div>
      )}

      {/* Alert Details Modal */}
      {selectedAlert && (
        <AlertDetailsModal
          alert={selectedAlert}
          onClose={() => setSelectedAlert(null)}
          onOverride={onOverride}
          readonly={readonly}
        />
      )}
    </div>
  );
}

// Individual Alert Card
function AlertCard({
  alert,
  onViewDetails,
  onOverride,
  readonly,
}: {
  alert: SafetyAlert;
  onViewDetails: () => void;
  onOverride?: (alertId: string, reason: string) => Promise<void>;
  readonly: boolean;
}) {
  const { t } = useTranslation();

  const severityStyles = {
    CRITICAL: 'bg-red-50 border-red-300 text-red-900',
    WARNING: 'bg-yellow-50 border-yellow-300 text-yellow-900',
    INFO: 'bg-blue-50 border-blue-300 text-blue-900',
  };

  const severityIcons = {
    CRITICAL: <XCircle className="w-5 h-5 text-red-600" />,
    WARNING: <AlertTriangle className="w-5 h-5 text-yellow-600" />,
    INFO: <Info className="w-5 h-5 text-blue-600" />,
  };

  return (
    <Card className={`p-4 border-2 ${severityStyles[alert.severity]}`}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {severityIcons[alert.severity]}
        </div>

        <div className="flex-1 min-w-0">
          {/* Alert Type Badge */}
          <div className="mb-2">
            <span className="text-xs font-semibold uppercase tracking-wide">
              {t(`safetyAlerts.types.${alert.type.toLowerCase()}`)}
            </span>
          </div>

          {/* Message */}
          <p className="font-medium mb-2">{alert.message}</p>

          {/* Recommendation (if present) */}
          {alert.recommendation && (
            <p className="text-sm opacity-90 mb-3">
              <span className="font-semibold">{t('safetyAlerts.recommendation')}:</span>{' '}
              {alert.recommendation}
            </p>
          )}

          {/* Override status */}
          {alert.isOverridden && (
            <div className="mt-2 p-2 bg-white bg-opacity-50 rounded text-sm">
              <p className="font-semibold">{t('safetyAlerts.overridden')}</p>
              <p className="text-xs mt-1">{alert.overrideReason}</p>
              <p className="text-xs text-gray-600 mt-1">
                {alert.overriddenAt && new Date(alert.overriddenAt).toLocaleString()}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 mt-3">
            <Button
              size="sm"
              variant="outline"
              onClick={onViewDetails}
              className="text-sm"
            >
              {t('safetyAlerts.viewDetails')}
            </Button>

            {!readonly && !alert.isOverridden && alert.canOverride && onOverride && (
              <Button
                size="sm"
                variant="ghost"
                className="text-sm text-gray-700 hover:text-gray-900"
                onClick={onViewDetails}
              >
                {t('safetyAlerts.override')}
              </Button>
            )}

            {!alert.canOverride && (
              <span className="text-xs text-red-700 font-semibold flex items-center gap-1 px-2">
                <XCircle className="w-3 h-3" />
                {t('safetyAlerts.cannotOverride')}
              </span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

// Alert Details Modal
function AlertDetailsModal({
  alert,
  onClose,
  onOverride,
  readonly,
}: {
  alert: SafetyAlert;
  onClose: () => void;
  onOverride?: (alertId: string, reason: string) => Promise<void>;
  readonly: boolean;
}) {
  const { t } = useTranslation();
  const [showOverrideForm, setShowOverrideForm] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleOverride = async () => {
    if (!overrideReason.trim() || !onOverride) return;

    setIsSubmitting(true);
    try {
      await onOverride(alert.id, overrideReason);
      onClose();
    } catch (error) {
      console.error('Failed to override alert:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {alert.severity === 'CRITICAL' && <XCircle className="w-6 h-6 text-red-600" />}
            {alert.severity === 'WARNING' && <AlertTriangle className="w-6 h-6 text-yellow-600" />}
            {alert.severity === 'INFO' && <Info className="w-6 h-6 text-blue-600" />}
            {t(`safetyAlerts.types.${alert.type.toLowerCase()}`)}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Severity Badge */}
          <div>
            <span
              className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${
                alert.severity === 'CRITICAL'
                  ? 'bg-red-100 text-red-800'
                  : alert.severity === 'WARNING'
                  ? 'bg-yellow-100 text-yellow-800'
                  : 'bg-blue-100 text-blue-800'
              }`}
            >
              {t(`safetyAlerts.severity.${alert.severity.toLowerCase()}`)}
            </span>
          </div>

          {/* Message */}
          <div>
            <h4 className="font-semibold text-gray-900 mb-2">{t('safetyAlerts.alert')}</h4>
            <p className="text-gray-700">{alert.message}</p>
          </div>

          {/* Clinical Rationale */}
          {alert.clinicalRationale && (
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">
                {t('safetyAlerts.clinicalRationale')}
              </h4>
              <p className="text-gray-700">{alert.clinicalRationale}</p>
            </div>
          )}

          {/* Recommendation */}
          {alert.recommendation && (
            <div className="p-4 bg-blue-50 rounded-lg">
              <h4 className="font-semibold text-blue-900 mb-2">
                {t('safetyAlerts.recommendation')}
              </h4>
              <p className="text-blue-800">{alert.recommendation}</p>
            </div>
          )}

          {/* Override Form */}
          {!readonly && !alert.isOverridden && alert.canOverride && !showOverrideForm && (
            <Button
              onClick={() => setShowOverrideForm(true)}
              variant="outline"
              className="w-full"
            >
              {t('safetyAlerts.proceedWithOverride')}
            </Button>
          )}

          {showOverrideForm && (
            <div className="space-y-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <h4 className="font-semibold text-yellow-900">
                {t('safetyAlerts.overrideJustification')}
              </h4>
              <p className="text-sm text-yellow-700">
                {t('safetyAlerts.overrideWarning')}
              </p>
              <Textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder={t('safetyAlerts.overridePlaceholder')}
                rows={4}
                className="bg-white"
              />
              <div className="flex gap-2">
                <Button
                  onClick={handleOverride}
                  disabled={!overrideReason.trim() || isSubmitting}
                  className="bg-yellow-600 hover:bg-yellow-700"
                >
                  {isSubmitting ? t('common.saving') : t('safetyAlerts.confirmOverride')}
                </Button>
                <Button
                  onClick={() => setShowOverrideForm(false)}
                  variant="outline"
                >
                  {t('common.cancel')}
                </Button>
              </div>
            </div>
          )}

          {!alert.canOverride && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-3">
                <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-red-900">
                    {t('safetyAlerts.cannotOverride')}
                  </h4>
                  <p className="text-sm text-red-700 mt-1">
                    {t('safetyAlerts.cannotOverrideMessage')}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button onClick={onClose} variant="outline">
            {t('common.close')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
